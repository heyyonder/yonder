package com.vladartym.yonder

import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat

// A live voice call keeps this service on (YonderAndroid.call in MainActivity.kt). Without it, Android silences the
// microphone about 10 seconds after the screen locks, and it can freeze the app. The wake lock keeps the processor on,
// for 30 minutes at most, the longest Grok session.
class CallService : Service() {
  private var lock: PowerManager.WakeLock? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    NotificationManagerCompat.from(this).createNotificationChannel(
      NotificationChannelCompat.Builder("call", NotificationManagerCompat.IMPORTANCE_LOW).setName("Voice call").build()
    )
    val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
    val notification = NotificationCompat.Builder(this, "call")
      .setSmallIcon(R.drawable.ic_call)
      .setContentTitle("Yonder")
      .setContentText("The call is live.")
      .setContentIntent(open)
      .setOngoing(true)
      .build()
    try {
      ServiceCompat.startForeground(this, 1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
    } catch (e: Exception) {
      Log.e("Yonder", "The call cannot keep the microphone with the screen locked: $e")
      stopSelf()
      return START_NOT_STICKY
    }
    if (lock == null) {
      lock = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "yonder:call").apply { acquire(30 * 60 * 1000L) }
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    lock?.takeIf { it.isHeld }?.release()
    super.onDestroy()
  }
}
