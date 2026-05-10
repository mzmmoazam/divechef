package com.diveforge.ble

import android.annotation.SuppressLint
import android.bluetooth.*
import android.bluetooth.le.*
import android.content.Context
import android.os.ParcelUuid
import com.diveforge.ble.protocol.*
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.io.ByteArrayOutputStream
import java.util.UUID

/**
 * Android BLE transport for Shearwater dive computers.
 *
 * Uses BluetoothGatt callbacks with Kotlin coroutines for async coordination.
 * Implements the same flow as the iOS PeregrineClient:
 *   scan -> connect -> discover services -> subscribe notifications ->
 *   transfer (wrap -> SLIP -> fragment -> write; await -> stripHeader -> SLIP decode -> unwrap)
 *
 * Key differences from iOS (CoreBluetooth):
 *   - Uses BluetoothLeScanner for scanning
 *   - Uses BluetoothGatt callbacks (on binder thread)
 *   - Must request MTU explicitly
 *   - Uses Channel<ByteArray> for frame awaiting
 *   - Uses newSingleThreadContext("BLE") for serialized operations
 */
@SuppressLint("MissingPermission")
class PeregrineBleManager(private val context: Context) {

    companion object {
        // Shearwater custom GATT service/characteristic UUIDs
        private val UART_SERVICE_UUID = UUID.fromString("fe25c237-0ece-443c-b0aa-e02033e7029d")
        private val UART_TX_CHAR_UUID = UUID.fromString("27b7570b-359e-45a3-91bb-cf7e70049bd2")
        private val UART_RX_CHAR_UUID = UUID.fromString("27b7570b-359e-45a3-91bb-cf7e70049bd2")
        private val CCCD_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")

        private const val SCAN_TIMEOUT_MS = 15_000L
        private const val TRANSFER_TIMEOUT_MS = 10_000L
        private const val MAX_BLOCK_RETRIES = 2
        private const val DEFAULT_CHUNK_SIZE = 75  // Cap at 75 even if MTU allows more
    }

    // ---- State ----

    private var bluetoothGatt: BluetoothGatt? = null
    private var txCharacteristic: BluetoothGattCharacteristic? = null
    private var negotiatedMtu: Int = 23  // Android default
    private var chunkSize: Int = Peregrine.BLE_CHUNK_SIZE

    private val bleContext = newSingleThreadContext("BLE")
    private val transferMutex = Mutex()
    private val frameChannel = Channel<ByteArray>(Channel.UNLIMITED)
    private val slipDecoder = SlipCodec.Decoder()

    private var scanner: BluetoothLeScanner? = null
    private var scanCallback: ScanCallback? = null
    private var connectionContinuation: CancellableContinuation<Unit>? = null
    private var mtuContinuation: CancellableContinuation<Int>? = null
    private var writeContinuation: CancellableContinuation<Unit>? = null

    data class DiscoveredDevice(
        val name: String?,
        val address: String,
        val rssi: Int
    )

    // ---- Scanning ----

    suspend fun startScan(
        serviceUuid: String,
        onDiscovered: (DiscoveredDevice) -> Unit
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

        scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult) {
                onDiscovered(DiscoveredDevice(
                    name = result.device.name,
                    address = result.device.address,
                    rssi = result.rssi
                ))
            }
        }

        scanner?.startScan(listOf(filter), settings, scanCallback!!)

        // Auto-stop after timeout
        withContext(bleContext) {
            delay(SCAN_TIMEOUT_MS)
            stopScan()
        }
    }

    fun stopScan() {
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

        // Request larger MTU
        val mtu = suspendCancellableCoroutine<Int> { cont ->
            mtuContinuation = cont
            bluetoothGatt?.requestMtu(185) // Request 185 to get ~180 usable
        }
        negotiatedMtu = mtu
        // Chunk size = MTU - 5 (3 ATT overhead + 2 BLE mini-header), capped at 75
        chunkSize = minOf(mtu - 5, DEFAULT_CHUNK_SIZE)
    }

    fun disconnect() {
        bluetoothGatt?.disconnect()
        bluetoothGatt?.close()
        bluetoothGatt = null
        txCharacteristic = null
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

            txCharacteristic = service.getCharacteristic(UART_TX_CHAR_UUID)
            val rxCharacteristic = service.getCharacteristic(UART_RX_CHAR_UUID)

            if (txCharacteristic == null || rxCharacteristic == null) {
                connectionContinuation?.cancel(
                    PeregrineProtocolException.UnexpectedResponse("UART characteristics not found")
                )
                return
            }

            // Enable notifications on RX characteristic
            gatt.setCharacteristicNotification(rxCharacteristic, true)
            val descriptor = rxCharacteristic.getDescriptor(CCCD_UUID)
            if (descriptor != null) {
                descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                gatt.writeDescriptor(descriptor)
            } else {
                // No CCCD, resolve immediately
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
            // Strip BLE mini-header and feed to SLIP decoder
            try {
                val payload = BleFramer.stripHeader(value)
                val frames = slipDecoder.feed(payload)
                for (frame in frames) {
                    frameChannel.trySend(frame)
                }
            } catch (e: Exception) {
                // Tolerate framing errors on individual notifications
            }
        }
    }

    // ---- Low-level transport ----

    /**
     * Write a single BLE chunk (with mini-header already applied).
     */
    private suspend fun writeChunk(chunk: ByteArray) {
        val gatt = bluetoothGatt ?: throw PeregrineProtocolException.NotConnected()
        val char = txCharacteristic ?: throw PeregrineProtocolException.NotConnected()

        suspendCancellableCoroutine<Unit> { cont ->
            writeContinuation = cont
            char.value = chunk
            char.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            if (!gatt.writeCharacteristic(char)) {
                writeContinuation = null
                cont.cancel(PeregrineProtocolException.UnexpectedResponse("writeCharacteristic returned false"))
            }
        }
    }

    /**
     * Fragment and write a SLIP-encoded payload as BLE chunks.
     */
    private suspend fun sendFrames(slipData: ByteArray) {
        val chunks = BleFramer.fragment(slipData, chunkSize)
        for (chunk in chunks) {
            writeChunk(chunk)
        }
    }

    /**
     * Await a complete SLIP frame from the device with timeout.
     */
    private suspend fun awaitFrame(timeoutMs: Long = TRANSFER_TIMEOUT_MS): ByteArray {
        return withTimeout(timeoutMs) {
            frameChannel.receive()
        }
    }

    // ---- Protocol-level transport ----

    /**
     * Full transfer cycle: wrap -> SLIP encode -> fragment -> write; await -> unwrap.
     * Returns the inner response payload.
     */
    suspend fun transfer(payload: ByteArray): ByteArray = transferMutex.withLock {
        val wrapped = WrapCodec.wrapRequest(payload)
        val slipEncoded = SlipCodec.encode(wrapped)
        sendFrames(slipEncoded)
        val response = awaitFrame()
        return WrapCodec.unwrapResponse(response)
    }

    /**
     * RDBI convenience: send RDBI request, parse response.
     */
    suspend fun rdbi(id: Int): ByteArray {
        val payload = RDBI.request(id)
        val response = transfer(payload)
        return RDBI.parse(response, id)
    }

    // ---- High-level operations ----

    /**
     * List dives: read serial/firmware/hardware/logupload, then download manifest.
     * Returns parsed manifest records.
     */
    suspend fun listDives(onProgress: ((String) -> Unit)? = null): List<ManifestRecord> {
        onProgress?.invoke("Reading device info...")

        // Read device identifiers
        val serial = rdbi(Peregrine.ID_SERIAL)
        val firmware = rdbi(Peregrine.ID_FIRMWARE)
        val hardware = rdbi(Peregrine.ID_HARDWARE)
        val logupload = rdbi(Peregrine.ID_LOGUPLOAD)

        onProgress?.invoke("Reading manifest...")

        // Determine base address from logupload response
        val baseAddr = LogbookFormat.baseAddress(logupload)

        // Download manifest via block download (no compression for manifest)
        val manifestData = blockDownload(
            address = Peregrine.MANIFEST_ADDR,
            size = Peregrine.MANIFEST_SIZE,
            compression = false,
            onProgress = { pct -> onProgress?.invoke("Manifest: ${pct}%") }
        )

        return Manifest.parse(manifestData)
    }

    /**
     * Download a single dive by manifest index (0-based into the ManifestRecord list).
     * Returns decompressed dive data.
     */
    suspend fun downloadDive(
        record: ManifestRecord,
        baseAddr: Long,
        onProgress: ((Int) -> Unit)? = null
    ): ByteArray {
        val diveAddress = baseAddr + record.address
        val compressed = blockDownload(
            address = diveAddress,
            size = Peregrine.DIVE_SIZE,
            compression = true,
            onProgress = { pct -> onProgress?.invoke(pct) }
        )
        return Decompress.full(compressed)
    }

    /**
     * Block download with retry and progress reporting.
     * Implements shearwater_common.c block download flow.
     */
    private suspend fun blockDownload(
        address: Long,
        size: Long,
        compression: Boolean,
        onProgress: ((Int) -> Unit)? = null
    ): ByteArray {
        // Send init request
        val initPayload = BlockDownload.initRequest(address, size, compression)
        val initResponse = transfer(initPayload)
        val blockSize = BlockDownload.parseInitResponse(initResponse)

        val output = ByteArrayOutputStream()
        var blockNum = 0
        var totalExpected = size
        var totalReceived = 0L

        while (true) {
            var attempt = 0
            var blockData: ByteArray? = null

            // Retry loop with exponential backoff
            while (attempt <= MAX_BLOCK_RETRIES) {
                try {
                    val blockPayload = BlockDownload.blockRequest(blockNum)
                    val blockResponse = transfer(blockPayload)
                    blockData = BlockDownload.parseBlockResponse(blockResponse, blockNum)
                    break
                } catch (e: PeregrineProtocolException) {
                    attempt++
                    if (attempt > MAX_BLOCK_RETRIES) throw e
                    // Exponential backoff: 100ms, 200ms
                    delay(100L * attempt)
                }
            }

            val data = blockData ?: throw PeregrineProtocolException.Timeout()

            // Check for end-of-transfer (empty block or short block)
            if (data.isEmpty()) break

            output.write(data)
            totalReceived += data.size
            blockNum = (blockNum + 1) and 0xFF

            // Report progress
            if (totalExpected > 0) {
                val pct = ((totalReceived * 100) / totalExpected).toInt().coerceAtMost(100)
                onProgress?.invoke(pct)
            }

            // If we got less than blockSize, this is the last block
            if (data.size < blockSize) break
        }

        // Send quit
        val quitResponse = transfer(BlockDownload.quitRequest)
        BlockDownload.parseQuitResponse(quitResponse)

        return output.toByteArray()
    }

    /**
     * Clean up resources.
     */
    fun destroy() {
        stopScan()
        disconnect()
        frameChannel.close()
        bleContext.close()
    }
}
