# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
# Keep the YonderAndroid object of MainActivity.kt: the page calls its methods by name.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
# ML Kit, the QR reader of the pairing scan, makes its parts by name with no-argument constructors. Without these
# rules R8 removes the constructors, and a release build crashes at each scan.
-keep class * implements com.google.firebase.components.ComponentRegistrar { <init>(); }
-keep class com.google.mlkit.** { *; }
# The Kotlin code of Yonder keeps its names and line numbers, so that a crash in Sentry names the line. No mapping
# file goes to Sentry, so the frames of the libraries stay short names.
-keep class com.vladartym.yonder.** { *; }
-keepattributes SourceFile,LineNumberTable
