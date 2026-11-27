package com.vladartym.yonder

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

// "Hey Yonder" on Android: the speech recognizer of the phone listens while the switch is on, the app is on the screen,
// and no call or dictation has the microphone. For each "yonder" in the words, it calls onWake. The recognizer of the
// phone itself is used when the phone has one (Android 12 and later), so no audio leaves the phone. A recognition ends
// after a few seconds of silence, so a new one starts after each end. Only on the screen: in the background, Android
// gives the microphone only to a foreground service with a notification. shortcut: a new service when the user asks
// for "Hey Yonder" with the screen off.
class Wake(private val activity: Activity, private val onWake: () -> Unit) {
  private val main = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  var on = false
    set(value) { field = value; sync() }
  var busy = false
    set(value) { field = value; sync() }
  var shown = false
    set(value) { field = value; sync() }

  private fun sync() = main.post {
    val want = on && !busy && shown
    if (!want) return@post stop()
    if (recognizer != null) return@post
    if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      // The answer comes after the user taps. onResume (shown) calls sync again.
      ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.RECORD_AUDIO), 7)
      return@post
    }
    if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
      Log.e("Yonder", "Hey Yonder: this phone has no speech recognizer")
      return@post
    }
    val onDevice = Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(activity)
    recognizer = (if (onDevice) SpeechRecognizer.createOnDeviceSpeechRecognizer(activity) else SpeechRecognizer.createSpeechRecognizer(activity)).apply {
      setRecognitionListener(listener)
    }
    listen()
  }

  private fun listen() {
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
      .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      .putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
    recognizer?.startListening(intent)
  }

  private fun stop() {
    recognizer?.destroy()
    recognizer = null
  }

  private fun heard(results: Bundle?): Boolean {
    val words = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: return false
    if (words.none { it.contains("yonder", ignoreCase = true) }) return false
    // The call takes the microphone, and the window calls busy. Until then, no second wake.
    stop()
    onWake()
    return true
  }

  // After an end or an error, a new recognition starts. After an error, it waits a second, so that a recognizer that
  // fails at once (no network, busy) does not run in a tight loop.
  private fun again(delay: Long) = main.postDelayed({ if (recognizer != null) listen() }, delay)

  private val listener = object : RecognitionListener {
    override fun onPartialResults(partialResults: Bundle?) { heard(partialResults) }
    override fun onResults(results: Bundle?) { if (!heard(results)) again(0) }
    override fun onError(error: Int) { again(if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) 0 else 1000) }
    override fun onReadyForSpeech(params: Bundle?) {}
    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(rmsdB: Float) {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onEvent(eventType: Int, params: Bundle?) {}
  }
}
