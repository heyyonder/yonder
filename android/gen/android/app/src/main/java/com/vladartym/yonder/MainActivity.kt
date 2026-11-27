package com.vladartym.yonder

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  // The sizes of the system bars in CSS pixels, as JSON for src/main.tsx.
  private var json = "{}"
  // "Hey Yonder" (Wake.kt) sends the event "yonder-wake" to the window, and the window starts a call.
  private lateinit var wake: Wake
  // The dictation of the prompt box (Dictation.kt).
  private val dictation by lazy { Dictation(this) }

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onResume() {
    super.onResume()
    if (::wake.isInitialized) wake.shown = true
  }

  override fun onPause() {
    if (::wake.isInitialized) wake.shown = false
    super.onPause()
  }

  // The back gesture goes to the app (onBackButtonPress in src/App.tsx), which calls background() at the list.
  // When the page does not listen, as on the pairing screen, Tauri calls this function, and the app also goes
  // to the background, as other apps do. The default ends the app and a live call.
  @Suppress("OVERRIDE_DEPRECATION")
  override fun onBackPressed() {
    if (onBackPressedDispatcher.hasEnabledCallbacks()) super.onBackPressed() else moveTaskToBack(true)
  }

  // Android draws the app under the status bar and the navigation bar, but the web view gives env(safe-area-inset-*)
  // only for a cutout of the screen. So src/main.tsx reads the sizes of the bars here and pads the app with them.
  // The keyboard makes the web view shorter, so that the message box stays above the keyboard.
  // The icons of the system bars follow the theme of the app, not the theme of the phone.
  // A live call keeps CallService.kt on, so that the call goes on with the screen locked (src/voice.ts).
  override fun onWebViewCreate(webView: WebView) {
    wake = Wake(this) { webView.evaluateJavascript("dispatchEvent(new Event('yonder-wake'))", null) }
    wake.shown = true
    webView.addJavascriptInterface(object {
      @JavascriptInterface fun bars() = json
      @JavascriptInterface fun dark(dark: Boolean) = runOnUiThread {
        val style = if (dark) SystemBarStyle.dark(Color.TRANSPARENT) else SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        enableEdgeToEdge(style, style)
      }
      // The switch in the settings, and a dictation or a call that has the microphone.
      @JavascriptInterface fun wake(on: Boolean) { wake.on = on }
      @JavascriptInterface fun busy(busy: Boolean) { wake.busy = busy }
      @JavascriptInterface fun dictation(op: String) = this@MainActivity.dictation.run(op)
      @JavascriptInterface fun call(live: Boolean) {
        val service = Intent(this@MainActivity, CallService::class.java)
        // The notification of the call needs this permission from Android 13. The call goes on without it.
        if (live && Build.VERSION.SDK_INT >= 33 &&
          ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) runOnUiThread { ActivityCompat.requestPermissions(this@MainActivity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 8) }
        try {
          if (live) ContextCompat.startForegroundService(this@MainActivity, service) else stopService(service)
        } catch (e: Exception) {
          // The call goes on, but it can stop when the screen locks.
          Log.e("Yonder", "The call service did not start: $e")
        }
      }
      @JavascriptInterface fun background() = runOnUiThread { moveTaskToBack(true) }
      // A copy from Google Play opens its page in Play for an update, and the APK copy opens the new APK (src/front.ts).
      @Suppress("DEPRECATION")
      @JavascriptInterface fun play() = "com.android.vending" ==
        if (Build.VERSION.SDK_INT >= 30) packageManager.getInstallSourceInfo(packageName).installingPackageName
        else packageManager.getInstallerPackageName(packageName)
    }, "YonderAndroid")
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val sides = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
      val px = view.resources.displayMetrics.density
      // Over the keyboard, the navigation bar needs no room.
      val bottom = if (keyboard > 0) 0 else sides.bottom
      json = """{"top":${sides.top / px},"right":${sides.right / px},"bottom":${bottom / px},"left":${sides.left / px}}"""
      val params = view.layoutParams as ViewGroup.MarginLayoutParams
      if (params.bottomMargin != keyboard) {
        params.bottomMargin = keyboard
        view.layoutParams = params
      }
      webView.evaluateJavascript("dispatchEvent(new Event('resize'))", null)
      insets
    }
  }
}
