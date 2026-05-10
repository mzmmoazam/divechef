package com.diveforge.ble

import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class DiveComputerModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "DiveComputer"

    private fun sendEvent(eventName: String, params: WritableMap?) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun startScan(serviceUuid: String, promise: Promise) {
        promise.resolve(null)
    }

    @ReactMethod
    fun stopScan(promise: Promise) {
        promise.resolve(null)
    }

    @ReactMethod
    fun connect(identifier: String, promise: Promise) {
        promise.resolve(null)
    }

    @ReactMethod
    fun disconnect(promise: Promise) {
        promise.resolve(null)
    }

    @ReactMethod
    fun isConnected(promise: Promise) {
        promise.resolve(false)
    }

    @ReactMethod
    fun listDives(promise: Promise) {
        promise.resolve(Arguments.createArray())
    }

    @ReactMethod
    fun downloadDive(index: Int, promise: Promise) {
        val result = Arguments.createMap()
        result.putString("rawBytes", "")
        promise.resolve(result)
    }

    @ReactMethod
    fun addListener(eventName: String) { }

    @ReactMethod
    fun removeListeners(count: Int) { }
}
