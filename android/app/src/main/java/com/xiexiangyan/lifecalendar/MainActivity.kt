package com.xiexiangyan.lifecalendar

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.File
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val executor = Executors.newSingleThreadExecutor()

    private var savedUri: Uri? = null
    private var savedName: String = ""
    private var pendingCallId: String? = null

    private val VERSION: String by lazy {
        try {
            packageManager.getPackageInfo(packageName, 0).versionName ?: "0.0.0"
        } catch (e: Exception) {
            "0.0.0"
        }
    }

    companion object {
        const val PICK_SAVE = 1001
        const val PICK_OPEN = 1002
        const val TAG = "LifeCalendar"
        const val VERSION_URL = "https://pass-you.github.io/life/release/version.json"
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            allowFileAccess = false
            setSupportZoom(false)
            useWideViewPort = true
            loadWithOverviewMode = true
        }
        webView.setBackgroundColor(0xFFFAF7F5.toInt())

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                return assetLoader.shouldInterceptRequest(request.url)
            }
        }

        webView.addJavascriptInterface(Bridge(), "LifeBridge")
        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html")

        restoreSavedUri()
        cleanupUpdateLeftovers()
    }

    /** 更新完成后清理残留：上次更新下载的安装包在新版启动时删除，不留在磁盘。 */
    private fun cleanupUpdateLeftovers() {
        try {
            val stale = File(cacheDir, "LifeCalendar-new.apk")
            if (stale.exists()) stale.delete()
        } catch (e: Exception) {
            Log.w(TAG, "清理更新残留失败: ${e.message}")
        }
    }

    // ---------------- SAF 文件选择 ----------------

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode != Activity.RESULT_OK || data == null) return
        val uri = data.data ?: return
        when (requestCode) {
            PICK_SAVE -> {
                savedUri = uri
                savedName = queryName(uri)
                persistUri(uri)
                resolvePending("{\"ok\":true,\"name\":\"${savedName}\"}")
            }
            PICK_OPEN -> {
                savedUri = uri
                savedName = queryName(uri)
                persistUri(uri)
                val text = readSavedUri() ?: ""
                resolvePending("{\"ok\":true,\"name\":\"${savedName}\",\"text\":${JSONObject.quote(text)}}")
            }
        }
    }

    private fun resolvePending(resultJson: String) {
        val callId = pendingCallId ?: return
        pendingCallId = null
        runOnUiThread {
            webView.evaluateJavascript(
                "(window.__lifeAsync && window.__lifeAsync.resolve)(${JSONObject.quote(callId)}, ${JSONObject.quote(resultJson)})",
                null)
        }
    }

    // ---------------- 持久化 ----------------

    private fun prefs() = getSharedPreferences("life", MODE_PRIVATE)

    private fun persistUri(uri: Uri) {
        try {
            contentResolver.takePersistableUriPermission(
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            )
        } catch (e: SecurityException) {
            Log.w(TAG, "takePersistableUriPermission failed: ${e.message}")
        }
        prefs().edit().putString("calendarUri", uri.toString()).apply()
    }

    private fun restoreSavedUri() {
        val raw = prefs().getString("calendarUri", null) ?: return
        try {
            val uri = Uri.parse(raw)
            savedUri = uri
            savedName = queryName(uri)
        } catch (e: Exception) {
            prefs().edit().remove("calendarUri").apply()
        }
    }

    private fun queryName(uri: Uri): String {
        try {
            contentResolver.query(uri, null, null, null, null)?.use { c ->
                val idx = c.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (idx >= 0 && c.moveToFirst()) {
                    return c.getString(idx) ?: "人生日历.md"
                }
            }
        } catch (e: Exception) {
            // ignore
        }
        return uri.lastPathSegment ?: "人生日历.md"
    }

    private fun readSavedUri(): String? {
        val uri = savedUri ?: return null
        return try {
            contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
        } catch (e: Exception) {
            null
        }
    }

    // ---------------- 桥 ----------------

    private inner class Bridge {
        @JavascriptInterface
        fun request(method: String, argsJson: String, callId: String): String {
            val args = try {
                JSONObject(argsJson)
            } catch (e: Exception) {
                JSONObject()
            }
            return when (method) {
                "info" -> "{\"ok\":true,\"platform\":\"android\",\"version\":\"$VERSION\"}"
                "pick_save_location" -> pickFile(PICK_SAVE, callId)
                "open_file" -> pickFile(PICK_OPEN, callId)
                "write_file" -> writeFile(args)
                "restore_saved_file" -> restoreFile()
                "clear_saved_file" -> clearFile()
                "check_update" -> checkUpdate()
                "apply_update" -> applyUpdate(callId)
                else -> "{\"ok\":false,\"error\":\"unknown method $method\"}"
            }
        }
    }

    private fun pickFile(code: Int, callId: String): String {
        pendingCallId = callId
        val intent = if (code == PICK_OPEN) {
            Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "*/*"
            }
        } else {
            Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = "text/markdown"
                putExtra(Intent.EXTRA_TITLE, "人生日历.md")
            }
        }
        startActivityForResult(intent, code)
        return "{\"__async\":true}"
    }

    private fun writeFile(args: JSONObject): String {
        val uri = savedUri ?: return "{\"ok\":false,\"error\":\"尚未选择保存位置\"}"
        val text = args.optString("text")
        return try {
            contentResolver.openOutputStream(uri, "rwt")?.use { out ->
                out.write(text.toByteArray(Charsets.UTF_8))
                out.flush()
            } ?: return "{\"ok\":false,\"error\":\"无法打开文件\"}"
            "{\"ok\":true}"
        } catch (e: Exception) {
            "{\"ok\":false,\"error\":\"写入失败：${e.message}\"}"
        }
    }

    private fun restoreFile(): String {
        if (savedUri == null) {
            val raw = prefs().getString("calendarUri", null)
            if (raw == null) return "{\"ok\":false,\"none\":true}"
            try {
                val parsed = Uri.parse(raw)
                savedUri = parsed
                savedName = queryName(parsed)
            } catch (e: Exception) {
                return "{\"ok\":false,\"none\":true}"
            }
        }
        val text = readSavedUri() ?: return "{\"ok\":false,\"none\":true}"
        return "{\"ok\":true,\"name\":\"${savedName}\",\"text\":${JSONObject.quote(text)}}"
    }

    private fun releaseUrl(raw: String): String {
        val full = if (raw.startsWith("http")) raw
        else "https://pass-you.github.io/life/${raw.removePrefix("/")}"
        return try {
            val u = java.net.URL(full)
            val encodedPath = u.path.split("/").joinToString("/") { segment ->
                java.net.URLEncoder.encode(segment, "UTF-8")
            }
            java.net.URL(u.protocol, u.host, u.port,
                encodedPath + (u.query?.let { "?$it" } ?: "")).toString()
        } catch (e: Exception) {
            full
        }
    }

    private fun clearFile(): String {
        savedUri = null
        savedName = ""
        prefs().edit().remove("calendarUri").apply()
        return "{\"ok\":true}"
    }

    // ---------------- 更新 ----------------

    private fun checkUpdate(): String {
        return try {
            val obj = JSONObject(httpGet(VERSION_URL))
            val latest = obj.optString("version", "0")
            val hasUpdate = compareVersion(latest, VERSION) > 0
            val android = obj.optJSONObject("android") ?: JSONObject()
            "{\"ok\":true,\"hasUpdate\":$hasUpdate,\"current\":\"$VERSION\"," +
                "\"latest\":\"$latest\",\"notes\":${JSONObject.quote(obj.optString("notes", ""))}," +
                "\"size\":${android.optInt("size", 0)}}"
        } catch (e: Exception) {
            "{\"ok\":false,\"error\":\"检查更新失败：${e.message}\"}"
        }
    }

    private fun applyUpdate(callId: String): String {
        executor.execute {
            val result = try {
                val manifest = JSONObject(httpGet(VERSION_URL))
                val android = manifest.optJSONObject("android")
                    ?: throw RuntimeException("版本清单缺少 Android 安装包地址")
                val url = android.optString("url")
                val expected = android.optString("sha256", "")
                val target = File(cacheDir, "LifeCalendar-new.apk")
                downloadAndVerify(releaseUrl(url), target, expected)
                installApk(target)
                "{\"ok\":true,\"message\":\"已下载 ${manifest.optString("version")}，请在系统弹窗中确认安装\"}"
            } catch (e: Exception) {
                "{\"ok\":false,\"error\":\"更新失败：${e.message}\"}"
            }
            runOnUiThread {
                webView.evaluateJavascript(
                    "(window.__lifeAsync && window.__lifeAsync.resolve)(${JSONObject.quote(callId)}, ${JSONObject.quote(result)})",
                    null)
            }
        }
        return "{\"__async\":true}"
    }

    private fun installApk(file: File) {
        val authority = "$packageName.fileprovider"
        val uri = androidx.core.content.FileProvider.getUriForFile(this, authority, file)
        val intent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
            setData(uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
            putExtra(Intent.EXTRA_INSTALLER_PACKAGE_NAME, packageName)
        }
        startActivity(intent)
        // 覆盖安装后系统自动替换旧版本；cacheDir 里的新 apk 由系统定期回收，
        // 这里下载前同名覆盖，不累积旧安装包。
    }

    private fun httpGet(url: String): String {
        val connection = java.net.URL(url).openConnection() as java.net.HttpURLConnection
        connection.connectTimeout = 10000
        connection.readTimeout = 10000
        connection.setRequestProperty("User-Agent", "LifeCalendar/$VERSION")
        try {
            val code = connection.responseCode
            if (code != 200) throw RuntimeException("HTTP $code")
            return connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }

    private fun downloadAndVerify(url: String, target: File, expectedSha256: String) {
        val connection = java.net.URL(url).openConnection() as java.net.HttpURLConnection
        connection.connectTimeout = 15000
        connection.readTimeout = 60000
        try {
            val code = connection.responseCode
            if (code != 200) throw RuntimeException("下载失败 HTTP $code")
            val digest = java.security.MessageDigest.getInstance("SHA-256")
            connection.inputStream.use { input ->
                target.outputStream().use { out ->
                    val buf = ByteArray(64 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                        digest.update(buf, 0, n)
                    }
                }
            }
            val actual = digest.digest().joinToString("") { "%02x".format(it) }
            if (expectedSha256.isNotBlank() && actual != expectedSha256.lowercase()) {
                target.delete()
                throw RuntimeException("安装包校验失败")
            }
        } finally {
            connection.disconnect()
        }
    }

    private fun compareVersion(a: String, b: String): Int {
        val pa = a.split('.').map { it.toIntOrNull() ?: 0 }
        val pb = b.split('.').map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(pa.size, pb.size)) {
            val x = pa.getOrElse(i) { 0 }
            val y = pb.getOrElse(i) { 0 }
            if (x != y) return if (x > y) 1 else -1
        }
        return 0
    }

    // ---------------- 生命周期 ----------------

    override fun onDestroy() {
        super.onDestroy()
        if (this::webView.isInitialized) webView.destroy()
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (this::webView.isInitialized && webView.canGoBack()) webView.goBack()
        else super.onBackPressed()
    }
}
