package com.divechef.ble

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import androidx.core.content.ContextCompat
import com.divechef.ble.protocol.*
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*

class DiveComputerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DiveComputer"

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var bleManager: PeregrineBleManager? = null
    private var cachedManifest: List<ManifestRecord> = emptyList()
    private var cachedBaseAddr: Long = 0L
    private var cachedFirmwareVersion: String? = null

    private fun getOrCreateManager(): PeregrineBleManager {
        if (bleManager == null) {
            bleManager = PeregrineBleManager(reactApplicationContext)
        }
        return bleManager!!
    }

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    private fun hasBluetoothPermissions(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(
                reactApplicationContext, Manifest.permission.BLUETOOTH_SCAN
            ) == PackageManager.PERMISSION_GRANTED &&
            ContextCompat.checkSelfPermission(
                reactApplicationContext, Manifest.permission.BLUETOOTH_CONNECT
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            ContextCompat.checkSelfPermission(
                reactApplicationContext, Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
        }
    }

    @ReactMethod
    fun startScan(serviceUuid: String, promise: Promise) {
        if (!hasBluetoothPermissions()) {
            promise.reject("PERMISSION_DENIED", "Bluetooth permissions not granted")
            return
        }

        scope.launch {
            try {
                val manager = getOrCreateManager()
                promise.resolve(null)
                manager.startScan(
                    serviceUuid = serviceUuid,
                    onDiscovered = { device ->
                        val params = Arguments.createMap().apply {
                            putString("name", device.name ?: "Unknown")
                            putString("identifier", device.address)
                            putInt("rssi", device.rssi)
                        }
                        sendEvent("diveComputerDiscovered", params)
                    },
                    onTimeout = {
                        val params = Arguments.createMap().apply {
                            putString("reason", "no_device_found")
                        }
                        sendEvent("diveComputerDisconnected", params)
                    }
                )
            } catch (e: Exception) {
                // promise already resolved, ignore
            }
        }
    }

    @ReactMethod
    fun stopScan(promise: Promise) {
        try {
            bleManager?.stopScan()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("STOP_SCAN_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun connect(identifier: String, promise: Promise) {
        if (!hasBluetoothPermissions()) {
            promise.reject("PERMISSION_DENIED", "Bluetooth permissions not granted")
            return
        }

        scope.launch {
            try {
                val manager = getOrCreateManager()
                manager.connect(identifier)
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("CONNECT_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun disconnect(promise: Promise) {
        try {
            bleManager?.disconnect()
            val params = Arguments.createMap().apply {
                putString("reason", "user_initiated")
            }
            sendEvent("diveComputerDisconnected", params)
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("DISCONNECT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isConnected(promise: Promise) {
        promise.resolve(bleManager?.isConnected() ?: false)
    }

    @ReactMethod
    fun listDives(promise: Promise) {
        scope.launch {
            try {
                val manager = getOrCreateManager()
                if (!manager.isConnected()) {
                    promise.reject("NOT_CONNECTED", "Not connected to dive computer")
                    return@launch
                }

                val listResult = manager.listDives { bytesDownloaded ->
                    val params = Arguments.createMap().apply {
                        putInt("bytesReceived", bytesDownloaded)
                        putNull("bytesExpected")
                    }
                    sendEvent("diveComputerProgress", params)
                }

                cachedManifest = listResult.records
                cachedBaseAddr = listResult.baseAddr
                cachedFirmwareVersion = listResult.firmwareVersion

                val result = Arguments.createArray()
                for (record in listResult.records) {
                    val item = Arguments.createMap().apply {
                        putInt("index", record.index)
                        putDouble("address", record.address.toDouble())
                        putString("fingerprintHex",
                            record.fingerprint.joinToString("") { String.format("%02x", it) })
                        cachedFirmwareVersion?.let { putString("firmwareVersion", it) }
                    }
                    result.pushMap(item)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("LIST_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun downloadDive(index: Double, promise: Promise) {
        val diveIndex = index.toInt()
        scope.launch {
            try {
                val manager = getOrCreateManager()
                if (!manager.isConnected()) {
                    promise.reject("NOT_CONNECTED", "Not connected to dive computer")
                    return@launch
                }

                val record = cachedManifest.find { it.index == diveIndex }
                    ?: run {
                        promise.reject("INVALID_INDEX", "Dive index $diveIndex not found in manifest")
                        return@launch
                    }

                val diveData = manager.downloadDive(record, cachedBaseAddr) { bytesDownloaded ->
                    val params = Arguments.createMap().apply {
                        putInt("bytesReceived", bytesDownloaded)
                        putNull("bytesExpected")
                    }
                    sendEvent("diveComputerProgress", params)
                }

                val result = Arguments.createMap().apply {
                    putString("rawBytes", Base64.encodeToString(diveData, Base64.NO_WRAP))
                }
                promise.resolve(result)
            } catch (e: Exception) {
                val params = Arguments.createMap().apply {
                    putString("reason", e.message ?: "unknown_error")
                }
                sendEvent("diveComputerDisconnected", params)
                promise.reject("DOWNLOAD_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {}

    @ReactMethod
    fun removeListeners(count: Int) {}

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        scope.cancel()
        bleManager?.destroy()
        bleManager = null
    }
}
