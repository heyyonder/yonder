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
import androidx.core.content.ContextCompat
import org.json.JSONObject

// Dictation on Android: the microphone button of the prompt box and the talk view (src/dictate.ts). The speech
// recognizer of the phone makes the words, on the phone itself when the phone has one (Android 12 and later), as in
// "Hey Yonder" (Wake.kt). So dictation does not need the bridge, and it also works with a Windows bridge, which has
// no dictation. The page calls `run` on the thread of the JavaScript bridge, with:
// - start: "" or an error. "permission": the page asks for the microphone, and starts again.
// - poll: {"words", "level", "done", "error"} as JSON. `level` is the bar of src/dictate.ts, from 0 to 1.
// - stop: ends the sound. `done` comes with the last words.
// - cancel: stops at once.
// The recognizer lives on the main thread.
class Dictation(private val activity: Activity) {
  private val main = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null
  private var onDevice = false
  // The words of the recognitions that ended, and of the recognition that runs.
  @Volatile private var said = ""
  @Volatile private var now = ""
  @Volatile private var level = 0f
  @Volatile private var stopping = false
  @Volatile private var done = true
  @Volatile private var error = ""

  fun run(op: String): String = when (op) {
    "start" -> start()
    "poll" -> JSONObject().put("words", listOf(said, now).filter { it.isNotBlank() }.joinToString(" "))
      .put("level", level.toDouble()).put("done", done).put("error", error).toString()
    "stop" -> {
      main.post {
        stopping = true
        recognizer?.stopListening() ?: finish()
      }
      ""
    }
    else -> {
      main.post(::finish)
      ""
    }
  }

  private fun start(): String {
    if (ContextCompat.checkSelfPermission(activity, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return "permission"
    said = ""
    now = ""
    level = 0f
    stopping = false
    error = ""
    done = false
    main.post {
      recognizer?.destroy()
      onDevice = Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(activity)
      if (!onDevice && !SpeechRecognizer.isRecognitionAvailable(activity)) return@post fail("this phone has no speech recognizer.")
      make()
      listen()
    }
    return ""
  }

  private fun make() {
    recognizer = (if (onDevice) SpeechRecognizer.createOnDeviceSpeechRecognizer(activity) else SpeechRecognizer.createSpeechRecognizer(activity)).apply {
      setRecognitionListener(listener)
    }
  }

  // No EXTRA_PREFER_OFFLINE: the recognizer on the phone is offline already, and the other recognizer is the fallback for
  // a phone with no language model, where "prefer offline" fails again with error 13 (ERROR_LANGUAGE_UNAVAILABLE).
  private fun listen() {
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
      .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
    recognizer?.startListening(intent)
  }

  // A recognition ends after a pause, so a new one starts, and its words go after the old ones, until the stop.
  private fun next() {
    said = listOf(said, now).filter { it.isNotBlank() }.joinToString(" ")
    now = ""
    if (stopping) finish() else listen()
  }

  private fun finish() {
    recognizer?.destroy()
    recognizer = null
    level = 0f
    done = true
  }

  private fun fail(message: String) {
    error = message
    finish()
  }

  private fun first(results: Bundle?) = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()

  private val listener = object : RecognitionListener {
    override fun onPartialResults(partialResults: Bundle?) { first(partialResults)?.let { now = it } }
    override fun onResults(results: Bundle?) {
      first(results)?.let { now = it }
      next()
    }
    override fun onError(code: Int) {
      when {
        recognizer == null -> {}
        // Silence also ends a recognition.
        stopping || code == SpeechRecognizer.ERROR_NO_MATCH || code == SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> next()
        // The recognizer of the phone has no model for the language: the other recognizer, which can use the network.
        onDevice && (code == SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED || code == SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE) -> {
          recognizer?.destroy()
          onDevice = false
          make()
          listen()
        }
        // "Hey Yonder" (Wake.kt) can still hold the microphone for a moment.
        code == SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> main.postDelayed({ if (recognizer != null) listen() }, 300)
        else -> fail("the speech recognizer of the phone stopped with error $code.")
      }
    }
    // shortcut: -2 to 10 dB is a guess of the range of Android; tune it if the orb moves too little or too much.
    override fun onRmsChanged(rmsdB: Float) { level = ((rmsdB + 2) / 12).coerceIn(0f, 1f) }
    override fun onReadyForSpeech(params: Bundle?) {}
    override fun onBeginningOfSpeech() {}
    override fun onBufferReceived(buffer: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onEvent(eventType: Int, params: Bundle?) {}
  }
}
