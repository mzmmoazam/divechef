package com.divechef.ble

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.ParcelUuid
import com.divechef.ble.protocol.*
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.ByteArrayOutputStream
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

@SuppressLint("MissingPermission")
class PeregrineBleManager(private val context: Context) {

    companion object {
        private val UART_SERVICE_UUID = UUID.fromString("fe25c237-0ece-443c-b0aa-e02033e7029d")
        // Shearwater uses a single bidirectional SPP characteristic (not the typical Nordic UART TX/RX split)
        private val SPP_CHAR_UUID = UUID.fromString("27b7570b-359e-45a3-91bb-cf7e70049bd2")
        private val CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

        private const val SCAN_TIMEOUT_MS = 15_000L
        private const val TRANSFER_TIMEOUT_MS = 10_000L
        private const val MAX_BLOCK_RETRIES = 2
        private const val RETRY_BASE_DELAY_MS = 500L
        private const val DEFAULT_CHUNK_SIZE = 75
        private const val MAX_MANIFEST_PAGES = 10
    }

    // ---- State ----

    private var bluetoothGatt: BluetoothGatt? = null
    private var txCharacteristic: BluetoothGattCharacteristic? = null
    private var negotiatedMtu: Int = 23
    private var chunkSize: Int = Peregrine.BLE_CHUNK_SIZE

    private val bleContext = newSingleThreadContext("BLE")
    private val transferMutex = Mutex()
    private val frameChannel = Channel<ByteArray>(Channel.UNLIMITED)
    private val slipDecoder = SlipCodec.Decoder()

    private var scanner: BluetoothLeScanner? = null
    private var scanCallback: ScanCallback? = null
    private var scanTimeoutJob: Job? = null
    @Volatile private var connectionContinuation: CancellableContinuation<Unit>? = null
    @Volatile private var mtuContinuation: CancellableContinuation<Int>? = null
    @Volatile private var writeContinuation: CancellableContinuation<Unit>? = null

    var firmwareVersion: String? = null
        private set

    data class DiscoveredDevice(
        val name: String?,
        val address: String,
        val rssi: Int
    )

    data class ListDivesResult(
        val records: List<ManifestRecord>,
        val baseAddr: Long,
        val firmwareVersion: String?
    )

    // ---- Scanning ----

    suspend fun startScan(
        serviceUuid: String,
        onDiscovered: (DiscoveredDevice) -> Unit,
        onTimeout: (() -> Unit)? = null
    ) {
        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val adapter = bluetoothManager.adapter
            ?: throw PeregrineProtocolException.NotConnected()

        scanner = adapter.bluetoothLeScanner
            ?: throw PeregrineProtocolException.NotConnected()

        val filter = ScanFilter.Builder()
            .setServiceUuid(ParcelUuid(UUID.fromString(serviceUuid)))
            .build()

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        val foundDevice = AtomicBoolean(false)

        scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                foundDevice.set(true)
                scanTimeoutJob?.cancel()
                scanTimeoutJob = null
                onDiscovered(DiscoveredDevice(
                    name = result.device.name,
                    address = result.device.address,
                    rssi = result.rssi
                ))
            }
        }

        scanner?.startScan(listOf(filter), settings, scanCallback!!)

        scanTimeoutJob = CoroutineScope(bleContext).launch {
            delay(SCAN_TIMEOUT_MS)
            if (!foundDevice.get()) {
                stopScan()
                onTimeout?.invoke()
            }
        }
    }

    fun stopScan() {
        scanTimeoutJob?.cancel()
        scanTimeoutJob = null
        scanCallback?.let { cb ->
            scanner?.stopScan(cb)
        }
        scanCallback = null
        scanner = null
    }

    // ---- Connection ----

    suspend fun connect(address: String) {
        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        val adapter = bluetoothManager.adapter
            ?: throw PeregrineProtocolException.NotConnected()

        val device = adapter.getRemoteDevice(address)

        suspendCancellableCoroutine<Unit> { cont ->
            connectionContinuation = cont
            bluetoothGatt = device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
            cont.invokeOnCancellation {
                bluetoothGatt?.disconnect()
                bluetoothGatt?.close()
                bluetoothGatt = null
            }
        }

        val mtu = suspendCancellableCoroutine<Int> { cont ->
            mtuContinuation = cont
            bluetoothGatt?.requestMtu(185)
        }
        negotiatedMtu = mtu
        chunkSize = minOf(mtu - 5, DEFAULT_CHUNK_SIZE)
    }

    fun disconnect() {
        bluetoothGatt?.disconnect()
        bluetoothGatt?.close()
        bluetoothGatt = null
        txCharacteristic = null
        firmwareVersion = null
    }

    fun isConnected(): Boolean {
        return bluetoothGatt != null && txCharacteristic != null
    }

    // ---- GATT Callback ----

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    gatt.discoverServices()
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    connectionContinuation?.cancel(PeregrineProtocolException.NotConnected())
                    connectionContinuation = null
                }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status != BluetoothGatt.GATT_SUCCESS) {
                connectionContinuation?.cancel(
                    PeregrineProtocolException.UnexpectedResponse("Service discovery failed: $status")
                )
                return
            }

            val service = gatt.getService(UART_SERVICE_UUID)
            if (service == null) {
                connectionContinuation?.cancel(
                    PeregrineProtocolException.UnexpectedResponse("UART service not found")
                )
                return
            }

            val sppChar = service.getCharacteristic(SPP_CHAR_UUID)
            if (sppChar == null) {
                connectionContinuation?.cancel(
                    PeregrineProtocolException.UnexpectedResponse("SPP characteristic not found")
                )
                return
            }
            txCharacteristic = sppChar

            gatt.setCharacteristicNotification(sppChar, true)
            val descriptor = sppChar.getDescriptor(CCCD_UUID)
            if (descriptor != null) {
                descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                gatt.writeDescriptor(descriptor)
            } else {
                connectionContinuation?.resumeWith(Result.success(Unit))
                connectionContinuation = null
            }
        }

        override fun onDescriptorWrite(gatt: BluetoothGatt, descriptor: BluetoothGattDescriptor, status: Int) {
            if (descriptor.uuid == CCCD_UUID) {
                if (status == BluetoothGatt.GATT_SUCCESS) {
                    connectionContinuation?.resumeWith(Result.success(Unit))
                } else {
                    connectionContinuation?.cancel(
                        PeregrineProtocolException.UnexpectedResponse("CCCD write failed: $status")
                    )
                }
                connectionContinuation = null
            }
        }

        override fun onMtuChanged(gatt: BluetoothGatt, mtu: Int, status: Int) {
            mtuContinuation?.resumeWith(Result.success(mtu))
            mtuContinuation = null
        }

        override fun onCharacteristicWrite(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                writeContinuation?.resumeWith(Result.success(Unit))
            } else {
                writeContinuation?.cancel(
                    PeregrineProtocolException.UnexpectedResponse("Write failed: $status")
                )
            }
            writeContinuation = null
        }

        @Deprecated("Deprecated in API 33+, but needed for backward compat")
        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic) {
            val value = characteristic.value ?: return
            handleIncomingData(value)
        }

        override fun onCharacteristicChanged(gatt: BluetoothGatt, characteristic: BluetoothGattCharacteristic, value: ByteArray) {
            handleIncomingData(value)
        }
    }

    private fun handleIncomingData(value: ByteArray) {
        try {
            val payload = BleFramer.stripHeader(value)
            val frames = slipDecoder.feed(payload)
            for (frame in frames) {
                frameChannel.trySend(frame)
            }
        } catch (_: Exception) {}
    }

    // ---- Low-level transport ----

    private suspend fun writeChunk(chunk: ByteArray) {
        val gatt = bluetoothGatt ?: throw PeregrineProtocolException.NotConnected()
        val char = txCharacteristic ?: throw PeregrineProtocolException.NotConnected()

        suspendCancellableCoroutine<Unit> { cont ->
            writeContinuation = cont
            char.value = chunk
            char.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
            if (!gatt.writeCharacteristic(char)) {
                writeContinuation = null
                cont.cancel(PeregrineProtocolException.UnexpectedResponse("writeCharacteristic returned false"))
            }
        }
    }

    private suspend fun sendFrames(slipData: ByteArray) {
        val chunks = BleFramer.fragment(slipData, chunkSize)
        for (chunk in chunks) {
            writeChunk(chunk)
        }
    }

    private suspend fun awaitFrame(timeoutMs: Long = TRANSFER_TIMEOUT_MS): ByteArray {
        return withTimeout(timeoutMs) {
            frameChannel.receive()
        }
    }

    // ---- Protocol-level transport ----

    suspend fun transfer(payload: ByteArray): ByteArray = transferMutex.withLock {
        val wrapped = WrapCodec.wrapRequest(payload)
        val slipEncoded = SlipCodec.encode(wrapped)
        sendFrames(slipEncoded)
        val response = awaitFrame()
        return WrapCodec.unwrapResponse(response)
    }

    suspend fun rdbi(id: Int): ByteArray {
        val payload = RDBI.request(id)
        val response = transfer(payload)
        return RDBI.parse(response, id)
    }

    // ---- High-level operations ----

    suspend fun listDives(onProgress: ((Int) -> Unit)? = null): ListDivesResult {
        val serial = rdbi(Peregrine.ID_SERIAL)
        val firmware = rdbi(Peregrine.ID_FIRMWARE)
        firmwareVersion = String(firmware).trim(' ')
        val hardware = rdbi(Peregrine.ID_HARDWARE)

        // Activate log upload mode (shearwater_common_open)
        val openReq = WDBI.request(Peregrine.ID_LOGUPLOAD, byteArrayOf(0x00, 0x00, 0x00, 0x00))
        val openResp = transfer(openReq)
        WDBI.validate(openResp, Peregrine.ID_LOGUPLOAD)

        val logupload = rdbi(Peregrine.ID_LOGUPLOAD)
        val baseAddr = LogbookFormat.baseAddress(logupload)

        // Pagination only for legacy 0xE0000000 format; newer format is single page.
        val allRecords = mutableListOf<ManifestRecord>()
        var manifestAddr = LogbookFormat.manifestAddress(baseAddr)
        val maxPages = if (baseAddr == 0x80000000L) MAX_MANIFEST_PAGES else 1

        for (page in 0 until maxPages) {
            val manifestData = blockDownload(
                address = manifestAddr,
                size = Peregrine.MANIFEST_SIZE,
                compression = false,
                onProgress = onProgress
            )
            val pageRecords = Manifest.parse(manifestData)
            allRecords.addAll(pageRecords)

            if (maxPages > 1) {
                val totalEntries = manifestData.size / Peregrine.RECORD_SIZE
                if (totalEntries >= Peregrine.RECORD_COUNT) {
                    manifestAddr += Peregrine.MANIFEST_SIZE
                } else {
                    break
                }
            }
        }

        return ListDivesResult(
            records = allRecords,
            baseAddr = baseAddr,
            firmwareVersion = firmwareVersion
        )
    }

    suspend fun downloadDive(
        record: ManifestRecord,
        baseAddr: Long,
        onProgress: ((Int) -> Unit)? = null
    ): ByteArray {
        val diveAddress = baseAddr + record.address
        val compressed = downloadDiveResumable(
            diveIndex = record.index,
            address = diveAddress,
            size = Peregrine.DIVE_SIZE,
            onProgress = onProgress
        )
        partialDownloads.remove(record.index)
        return Decompress.full(compressed)
    }

    // ---- Partial-download recovery (in-memory, v1) ----

    private data class PartialDownload(
        val address: Long,
        val lastBlockNum: Int,
        val accumulatedBytes: ByteArray
    )

    private val partialDownloads = mutableMapOf<Int, PartialDownload>()

    private suspend fun downloadDiveResumable(
        diveIndex: Int,
        address: Long,
        size: Long,
        onProgress: ((Int) -> Unit)? = null
    ): ByteArray {
        val initPayload = BlockDownload.initRequest(address, size, true)
        val initResponse = transfer(initPayload)
        BlockDownload.parseInitResponse(initResponse)

        val lreDetector = IncrementalLREDetector()
        val output: ByteArrayOutputStream
        val resumeFromBlock: Int

        val partial = partialDownloads[diveIndex]
        if (partial != null && partial.address == address) {
            output = ByteArrayOutputStream().also { it.write(partial.accumulatedBytes) }
            resumeFromBlock = (partial.lastBlockNum + 1) and 0xFF
            lreDetector.feed(partial.accumulatedBytes)
        } else {
            output = ByteArrayOutputStream()
            resumeFromBlock = 1
        }

        // Protocol requires sequential block numbers from 1 after init.
        // Re-fetch and discard blocks we already have.
        var blockNum = 1
        while (blockNum != resumeFromBlock && blockNum != 0) {
            val req = BlockDownload.blockRequest(blockNum)
            val rsp = transfer(req)
            BlockDownload.parseBlockResponse(rsp, blockNum)
            blockNum = (blockNum + 1) and 0xFF
        }

        var done = lreDetector.isDone

        while (output.size().toLong() < size && !done) {
            var lastError: Exception? = null
            var blockData: ByteArray = ByteArray(0)

            for (attempt in 0..MAX_BLOCK_RETRIES) {
                try {
                    val blockPayload = BlockDownload.blockRequest(blockNum)
                    val blockResponse = transfer(blockPayload)
                    blockData = BlockDownload.parseBlockResponse(blockResponse, blockNum)
                    lastError = null
                    break
                } catch (e: Exception) {
                    lastError = e
                    if (attempt < MAX_BLOCK_RETRIES) {
                        delay(RETRY_BASE_DELAY_MS * (attempt + 1))
                    }
                }
            }
            if (lastError != null) throw lastError

            if (blockData.isEmpty()) break

            output.write(blockData)

            partialDownloads[diveIndex] = PartialDownload(
                address = address,
                lastBlockNum = blockNum,
                accumulatedBytes = output.toByteArray()
            )

            blockNum = (blockNum + 1) and 0xFF

            if (lreDetector.feed(blockData)) { done = true }

            onProgress?.invoke(output.size())
        }

        val quitResponse = transfer(BlockDownload.quitRequest)
        BlockDownload.parseQuitResponse(quitResponse)

        return output.toByteArray()
    }

    /**
     * Block download with retry, incremental LRE end-detection, and progress reporting.
     * Used for manifest downloads (not resumable).
     */
    private suspend fun blockDownload(
        address: Long,
        size: Long,
        compression: Boolean,
        onProgress: ((Int) -> Unit)? = null
    ): ByteArray {
        val initPayload = BlockDownload.initRequest(address, size, compression)
        val initResponse = transfer(initPayload)
        BlockDownload.parseInitResponse(initResponse)

        val output = ByteArrayOutputStream()
        var blockNum = 1
        var done = false
        val lreDetector = if (compression) IncrementalLREDetector() else null

        while (output.size().toLong() < size && !done) {
            var lastError: Exception? = null
            var blockData: ByteArray = ByteArray(0)

            for (attempt in 0..MAX_BLOCK_RETRIES) {
                try {
                    val blockPayload = BlockDownload.blockRequest(blockNum)
                    val blockResponse = transfer(blockPayload)
                    blockData = BlockDownload.parseBlockResponse(blockResponse, blockNum)
                    lastError = null
                    break
                } catch (e: Exception) {
                    lastError = e
                    if (attempt < MAX_BLOCK_RETRIES) {
                        delay(RETRY_BASE_DELAY_MS * (attempt + 1))
                    }
                }
            }
            if (lastError != null) throw lastError

            if (blockData.isEmpty()) break

            output.write(blockData)
            blockNum = (blockNum + 1) and 0xFF

            if (lreDetector != null) {
                if (lreDetector.feed(blockData)) { done = true }
            }

            onProgress?.invoke(output.size())
        }

        val quitResponse = transfer(BlockDownload.quitRequest)
        BlockDownload.parseQuitResponse(quitResponse)

        return output.toByteArray()
    }

    fun destroy() {
        stopScan()
        disconnect()
        frameChannel.close()
        bleContext.close()
    }
}
