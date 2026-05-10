package com.diveforge.ble

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.util.Base64
import androidx.core.content.ContextCompat
import com.diveforge.ble.protocol.*
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*

/**
 * React Native bridge module for dive computer BLE communication.
 * Exposes scan/connect/listDives/downloadDive to JavaScript via the "DiveComputer" native module.
 *
 * Uses PeregrineBleManager for all BLE operations, dispatching on Dispatchers.IO.
 */
class DiveComputerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DiveComputer"

    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var bleManager: PeregrineBleManager? = null
    private var cachedManifest: List<ManifestRecord> = emptyList()
    private var cachedBaseAddr: Long = 0L

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

    /**
     * Check that BLE permissions are granted (Android 12+ requires BLUETOOTH_SCAN + BLUETOOTH_CONNECT).
     */
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
                manager.startScan(serviceUuid) { device ->
                    val params = Arguments.createMap().apply {
                        putString("name", device.name ?: "Unknown")
                        putString("address", device.address)
                        putInt("rssi", device.rssi)
                    }
                    sendEvent("DiveComputerDiscovered", params)
                }
                promise.resolve(null)
            } catch (e: Exception) {
                promise.reject("SCAN_ERROR", e.message, e)
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

                val params = Arguments.createMap().apply {
                    putString("address", identifier)
                    putString("status", "connected")
                }
                sendEvent("DiveComputerConnectionChanged", params)

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
                putString("status", "disconnected")
            }
            sendEvent("DiveComputerConnectionChanged", params)

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

                // Read logupload to get base address
                val logupload = manager.rdbi(Peregrine.ID_LOGUPLOAD)
                cachedBaseAddr = LogbookFormat.baseAddress(logupload)

                val records = manager.listDives { status ->
                    val params = Arguments.createMap().apply {
                        putString("status", status)
                    }
                    sendEvent("DiveComputerProgress", params)
                }

                cachedManifest = records

                val result = Arguments.createArray()
                for (record in records) {
                    val item = Arguments.createMap().apply {
                        putInt("index", record.index)
                        putString("fingerprint",
                            record.fingerprint.joinToString("") { String.format("%02x", it) })
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
    fun downloadDive(index: Int, promise: Promise) {
        scope.launch {
            try {
                val manager = getOrCreateManager()
                if (!manager.isConnected()) {
                    promise.reject("NOT_CONNECTED", "Not connected to dive computer")
                    return@launch
                }

                // Find the record by display index (1-based)
                val record = cachedManifest.find { it.index == index }
                    ?: run {
                        promise.reject("INVALID_INDEX", "Dive index $index not found in manifest")
                        return@launch
                    }

                val diveData = manager.downloadDive(record, cachedBaseAddr) { pct ->
                    val params = Arguments.createMap().apply {
                        putInt("progress", pct)
                        putInt("diveIndex", index)
                    }
                    sendEvent("DiveComputerDownloadProgress", params)
                }

                val result = Arguments.createMap().apply {
                    putString("rawBytes", Base64.encodeToString(diveData, Base64.NO_WRAP))
                    putInt("size", diveData.size)
                    putInt("index", index)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("DOWNLOAD_ERROR", e.message, e)
            }
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RCTDeviceEventEmitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RCTDeviceEventEmitter
    }

    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        scope.cancel()
        bleManager?.destroy()
        bleManager = null
    }
}
