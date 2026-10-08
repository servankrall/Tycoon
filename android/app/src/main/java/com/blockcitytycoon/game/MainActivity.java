package com.blockcitytycoon.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.ActivityManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.database.Cursor;
import android.util.Base64;
import android.util.Log;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.FileWriter;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

import javax.crypto.Mac;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * BLOCK CITY TYCOON — Android shell.
 * The whole game (engine, economy, citizens, traffic, world, save, simulation, quests, achievements) is the same
 * JavaScript code as the Windows EXE; this activity only provides the platform layer:
 *  - a full-screen WebView serving the bundled game from https://appassets.androidplatform.net/www/ (offline, no network)
 *  - the BCTAndroid bridge: private-storage saves, Storage Access Framework export / import, pictures, log file,
 *    orientation, keep-screen-on, thermal status
 *  - Android back button → the game's back handler, game controller events → the game's gamepad layer
 *  - self-test mode (adb: am start -n com.blockcitytycoon.game/.MainActivity --ez selftest true) in an isolated sandbox
 */
public class MainActivity extends Activity {
    static final String TAG = "BCT";
    static final String HOST = "appassets.androidplatform.net";
    static final String START_URL = "https://" + HOST + "/www/index.html";
    static final int REQ_EXPORT = 41, REQ_IMPORT = 42, REQ_PICTURE = 43;

    WebView web;
    File storeDir, logDir;
    boolean selftest;
    int selftestPhase = 1;
    final Handler ui = new Handler(Looper.getMainLooper());
    int pendingId = 0;
    String pendingText = null;
    byte[] pendingBytes = null;
    long lastAxes = 0;
    JSONObject selftestRealm = null;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle state) {
        Intent it = getIntent();
        selftest = it != null && it.getBooleanExtra("selftest", false);
        selftestPhase = it != null ? Math.max(1, it.getIntExtra("selftestPhase", 1)) : 1;
        if (selftest && Build.VERSION.SDK_INT >= 28) {
            try { WebView.setDataDirectorySuffix("selftest"); } catch (Exception e) { Log.w(TAG, "data dir suffix: " + e); }
        }
        super.onCreate(state);
        storeDir = new File(getFilesDir(), selftest ? "selftest/store" : "store");
        logDir = new File(getFilesDir(), selftest ? "selftest/logs" : "logs");
        if (selftest && selftestPhase == 1) deleteTree(new File(getFilesDir(), "selftest"));
        storeDir.mkdirs(); logDir.mkdirs();
        rotateLog();
        log("info", "Android shell started — v" + BuildConfig.VERSION_NAME + " (" + BuildConfig.BUILD_PROFILE + "), Android " + Build.VERSION.RELEASE + ", " + Build.MODEL + (selftest ? ", SELF-TEST phase " + selftestPhase : ""));

        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);
        if (Build.VERSION.SDK_INT >= 28) w.getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;

        web = new WebView(this);
        web.setBackgroundColor(0xFF12152B);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);         // release builds: no remote debugging
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.addJavascriptInterface(new Bridge(), "BCTAndroid");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) { return serve(req.getUrl()); }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) { return !HOST.equals(req.getUrl().getHost()); }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage m) {
                String msg = m.message();
                if (msg != null && msg.startsWith("SELFTEST ")) Log.i("BCT_SELFTEST", msg.length() > 3500 ? msg.substring(0, 3500) : msg);
                if (m.messageLevel() == ConsoleMessage.MessageLevel.ERROR) log("warning", "Console: " + msg + " (" + m.sourceId() + ":" + m.lineNumber() + ")");
                return true;
            }
        });
        setContentView(web);
        immersive();
        web.loadUrl(START_URL + (selftest ? "?selftest=" + selftestPhase : ""));
    }

    /* ---------------- asset server (https://appassets.androidplatform.net/www/…) ---------------- */
    WebResourceResponse serve(Uri u) {
        if (u == null || !HOST.equals(u.getHost())) return blocked();
        String p = u.getPath();
        if (p == null || !p.startsWith("/www/") || p.contains("..")) return blocked();
        try {
            InputStream in = getAssets().open(p.substring(1));
            Map<String, String> h = new HashMap<>();
            h.put("Cache-Control", "no-store");
            WebResourceResponse r = new WebResourceResponse(mime(p), mime(p).startsWith("text") || p.endsWith(".js") || p.endsWith(".json") ? "utf-8" : null, in);
            r.setResponseHeaders(h);
            return r;
        } catch (Exception e) {
            log("warning", "Missing asset " + p);
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
        }
    }
    WebResourceResponse blocked() { return new WebResourceResponse("text/plain", "utf-8", 403, "Offline", null, new ByteArrayInputStream(new byte[0])); }
    static String mime(String p) {
        String l = p.toLowerCase(Locale.ROOT);
        if (l.endsWith(".html")) return "text/html";
        if (l.endsWith(".js")) return "application/javascript";
        if (l.endsWith(".css")) return "text/css";
        if (l.endsWith(".png")) return "image/png";
        if (l.endsWith(".svg")) return "image/svg+xml";
        if (l.endsWith(".ico")) return "image/x-icon";
        if (l.endsWith(".json")) return "application/json";
        if (l.endsWith(".mp3")) return "audio/mpeg";
        if (l.endsWith(".ogg")) return "audio/ogg";
        if (l.endsWith(".wav")) return "audio/wav";
        return "application/octet-stream";
    }

    /* ---------------- window ---------------- */
    @SuppressWarnings("deprecation")
    void immersive() {
        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            WindowInsetsController c = w.getInsetsController();
            if (c != null) { c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars()); c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE); }
        } else {
            w.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }
    @Override
    public void onWindowFocusChanged(boolean focus) { super.onWindowFocusChanged(focus); if (focus) immersive(); }

    /* ---------------- lifecycle: the game autosaves when Android pauses the app ---------------- */
    @Override
    protected void onPause() { js("window.bctOnPause && bctOnPause()"); if (web != null) web.onPause(); super.onPause(); }
    @Override
    protected void onResume() { super.onResume(); if (web != null) web.onResume(); js("window.bctOnResume && bctOnResume()"); immersive(); }
    @Override
    protected void onDestroy() { if (web != null) { web.destroy(); web = null; } super.onDestroy(); }

    /* ---------------- back button → the game's own back handler ---------------- */
    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("(window.bctOnBack ? bctOnBack() : 'exit')", new android.webkit.ValueCallback<String>() { @Override public void onReceiveValue(String v) {
            log("info", "Back button → " + v);
            if (v == null || v.contains("exit")) moveTaskToBack(true);
        } });
    }

    /* ---------------- game controllers → window.bctPadKey / bctPadAxes ---------------- */
    static boolean isPad(KeyEvent e) {
        int src = e.getSource();
        return (src & InputDevice.SOURCE_GAMEPAD) == InputDevice.SOURCE_GAMEPAD || (src & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK
            || KeyEvent.isGamepadButton(e.getKeyCode());
    }
    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (web != null && isPad(e) && (e.getAction() == KeyEvent.ACTION_DOWN || e.getAction() == KeyEvent.ACTION_UP)) {
            if (e.getRepeatCount() == 0) js("window.bctPadKey && bctPadKey(" + e.getKeyCode() + "," + (e.getAction() == KeyEvent.ACTION_DOWN) + ")");
            return true;
        }
        return super.dispatchKeyEvent(e);
    }
    @Override
    public boolean onGenericMotionEvent(MotionEvent e) {
        if (web != null && (e.getSource() & InputDevice.SOURCE_JOYSTICK) == InputDevice.SOURCE_JOYSTICK && e.getAction() == MotionEvent.ACTION_MOVE) {
            long t = System.currentTimeMillis();
            if (t - lastAxes > 15) {
                lastAxes = t;
                float hx = e.getAxisValue(MotionEvent.AXIS_HAT_X), hy = e.getAxisValue(MotionEvent.AXIS_HAT_Y);
                float x = e.getAxisValue(MotionEvent.AXIS_X), y = e.getAxisValue(MotionEvent.AXIS_Y);
                if (Math.abs(x) < 0.05f && Math.abs(y) < 0.05f) { x = hx; y = hy; }
                js(String.format(Locale.ROOT, "window.bctPadAxes && bctPadAxes(%.3f,%.3f,%.3f,%.3f,%.3f,%.3f)", x, y, e.getAxisValue(MotionEvent.AXIS_Z), e.getAxisValue(MotionEvent.AXIS_RZ),
                    Math.max(e.getAxisValue(MotionEvent.AXIS_LTRIGGER), e.getAxisValue(MotionEvent.AXIS_BRAKE)), Math.max(e.getAxisValue(MotionEvent.AXIS_RTRIGGER), e.getAxisValue(MotionEvent.AXIS_GAS))));
            }
            return true;
        }
        return super.onGenericMotionEvent(e);
    }

    /* ---------------- helpers ---------------- */
    void js(final String code) { ui.post(new Runnable() { @Override public void run() { if (web != null) web.evaluateJavascript(code, null); } }); }
    void result(int id, JSONObject o) { js("window.__bctAndroidResult && __bctAndroidResult(" + id + "," + JSONObject.quote(o.toString()) + ")"); }
    static JSONObject obj(Object... kv) { JSONObject o = new JSONObject(); try { for (int i = 0; i + 1 < kv.length; i += 2) o.put(String.valueOf(kv[i]), kv[i + 1]); } catch (Exception e) { /* ignore */ } return o; }
    static void deleteTree(File f) { if (f == null || !f.exists()) return; File[] k = f.listFiles(); if (k != null) for (File c : k) deleteTree(c); f.delete(); }
    static String readAll(InputStream in, int max) throws Exception {
        ByteArrayOutputStream b = new ByteArrayOutputStream(); byte[] buf = new byte[65536]; int n, tot = 0;
        while ((n = in.read(buf)) > 0) { tot += n; if (tot > max) throw new Exception("file too large"); b.write(buf, 0, n); }
        in.close(); return new String(b.toByteArray(), StandardCharsets.UTF_8);
    }
    File keyFile(String key) throws Exception { return new File(storeDir, URLEncoder.encode(key, "UTF-8") + ".dat"); }
    void rotateLog() { File l = new File(logDir, "latest.log"); if (l.exists()) { File p = new File(logDir, "previous.log"); p.delete(); l.renameTo(p); } }
    synchronized void log(String level, String msg) {
        if ("error".equals(level)) Log.e(TAG, msg); else if ("warning".equals(level)) Log.w(TAG, msg); else Log.i(TAG, msg);
        try {
            File l = new File(logDir, "latest.log");
            if (l.length() > 2_000_000) rotateLog();
            FileWriter fw = new FileWriter(l, true);
            fw.write("[" + new SimpleDateFormat("HH:mm:ss", Locale.ROOT).format(new Date()) + "] " + ("info".equals(level) ? "" : level.toUpperCase(Locale.ROOT) + ": ") + msg + "\n");
            fw.close();
        } catch (Exception e) { /* logging never breaks the game */ }
    }
    String displayName(Uri u) {
        try (Cursor c = getContentResolver().query(u, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getString(0);
        } catch (Exception e) { /* unknown */ }
        return "file";
    }

    /* ---------------- Storage Access Framework results ---------------- */
    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        final int id = pendingId;
        Uri u = data != null ? data.getData() : null;
        if (res != RESULT_OK || u == null) { result(id, obj("ok", false, "canceled", true)); pendingText = null; pendingBytes = null; return; }
        try {
            if (req == REQ_EXPORT || req == REQ_PICTURE) {
                OutputStream out = getContentResolver().openOutputStream(u, "wt");
                if (out == null) throw new Exception("cannot write");
                out.write(req == REQ_EXPORT ? pendingText.getBytes(StandardCharsets.UTF_8) : pendingBytes);
                out.close();
                log("info", "Exported " + displayName(u));
                result(id, obj("ok", true, "path", displayName(u)));
            } else if (req == REQ_IMPORT) {
                String text = readAll(getContentResolver().openInputStream(u), 64 * 1024 * 1024);
                log("info", "Imported " + displayName(u));
                result(id, obj("ok", true, "text", text, "name", displayName(u)));
            }
        } catch (Exception e) { log("error", "File transfer failed: " + e); result(id, obj("ok", false, "error", String.valueOf(e.getMessage()))); }
        pendingText = null; pendingBytes = null;
    }

    /* ---------------- self-test admin realm: one-time OWNER credential that exists only in this self-test process ---------------- */
    JSONObject makeSelftestRealm() throws Exception {
        SecureRandom r = new SecureRandom();
        byte[] master = new byte[32], salt = new byte[16], pwb = new byte[18];
        r.nextBytes(master); r.nextBytes(salt); r.nextBytes(pwb);
        String pw = hex(pwb);
        JSONObject checks = new JSONObject();
        for (String role : new String[]{"OWNER", "ADMIN", "DEVELOPER", "DEBUG"}) {
            Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(master, "HmacSHA256"));
            byte[] rk = mac.doFinal(("bct-role:" + role).getBytes(StandardCharsets.UTF_8));
            checks.put(role, hex(java.security.MessageDigest.getInstance("SHA-256").digest(rk)));
        }
        byte[] su = "selftest".getBytes(StandardCharsets.UTF_8), full = new byte[salt.length + su.length];
        System.arraycopy(salt, 0, full, 0, salt.length); System.arraycopy(su, 0, full, salt.length, su.length);
        PBEKeySpec spec = new PBEKeySpec(pw.toCharArray(), full, 120000, 256);
        byte[] dk = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
        byte[] wrap = new byte[32]; for (int i = 0; i < 32; i++) wrap[i] = (byte) (master[i] ^ dk[i]);
        JSONObject rec = obj("u", "selftest", "role", "OWNER", "kind", "master", "it", 120000, "salt", hex(salt), "wrap", hex(wrap));
        JSONObject realm = obj("id", "selftest", "checks", checks, "records", new JSONArray().put(rec));
        log("info", "Self-test: isolated admin realm created for this test process");
        return obj("realm", realm, "user", "selftest", "password", pw);
    }
    static String hex(byte[] b) { StringBuilder s = new StringBuilder(); for (byte x : b) s.append(String.format("%02x", x & 255)); return s.toString(); }

    /* =============================== JavaScript bridge (window.BCTAndroid) =============================== */
    class Bridge {
        @JavascriptInterface
        public String info() {
            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo(); if (am != null) am.getMemoryInfo(mi);
            return obj("version", BuildConfig.VERSION_NAME, "versionCode", BuildConfig.VERSION_CODE, "profile", BuildConfig.BUILD_PROFILE, "debuggable", BuildConfig.DEBUG,
                "model", Build.MANUFACTURER + " " + Build.MODEL, "release", Build.VERSION.RELEASE, "sdk", Build.VERSION.SDK_INT,
                "ramMB", mi.totalMem / 1048576, "lowRam", am != null && am.isLowRamDevice(), "cores", Runtime.getRuntime().availableProcessors(),
                "selftest", selftest, "selftestPhase", selftestPhase).toString();
        }
        @JavascriptInterface
        public String storeLoadAll() {
            JSONObject o = new JSONObject();
            File[] files = storeDir.listFiles();
            if (files != null) for (File f : files) {
                String n = f.getName(); if (!n.endsWith(".dat")) continue;
                try { o.put(URLDecoder.decode(n.substring(0, n.length() - 4), "UTF-8"), readAll(new FileInputStream(f), 128 * 1024 * 1024)); } catch (Exception e) { log("error", "Store read " + n + ": " + e); }
            }
            return o.toString();
        }
        @JavascriptInterface
        public String storeWrite(String key, String value) {
            try {
                File f = keyFile(key), tmp = new File(f.getPath() + ".tmp");
                FileOutputStream out = new FileOutputStream(tmp); out.write(value.getBytes(StandardCharsets.UTF_8)); out.getFD().sync(); out.close();
                if (!tmp.renameTo(f)) { f.delete(); if (!tmp.renameTo(f)) throw new Exception("rename failed"); }
                return obj("ok", true).toString();
            } catch (Exception e) { log("error", "Store write " + key + ": " + e); return obj("ok", false, "error", String.valueOf(e.getMessage())).toString(); }
        }
        @JavascriptInterface
        public void storeRemove(String key) { try { keyFile(key).delete(); } catch (Exception e) { /* already gone */ } }
        @JavascriptInterface
        public void log(String level, String msg) { MainActivity.this.log(level, "[game] " + msg); }
        @JavascriptInterface
        public void exportText(int id, String name, String text, String mime) {
            pendingId = id; pendingText = text;
            ui.post(new Runnable() { @Override public void run() {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType(mime == null || mime.isEmpty() ? "application/json" : mime); i.putExtra(Intent.EXTRA_TITLE, name);
                try { startActivityForResult(i, REQ_EXPORT); } catch (Exception e) { result(id, obj("ok", false, "error", "No file manager")); }
            } });
        }
        @JavascriptInterface
        public void importText(int id, String mimes) {
            pendingId = id;
            ui.post(new Runnable() { @Override public void run() {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, mimes == null ? new String[]{"application/json", "text/plain"} : mimes.split(","));
                try { startActivityForResult(i, REQ_IMPORT); } catch (Exception e) { result(id, obj("ok", false, "error", "No file manager")); }
            } });
        }
        @JavascriptInterface
        public void savePicture(int id, String name, String dataUrl) {
            try {
                String b64 = dataUrl.substring(dataUrl.indexOf(',') + 1);
                byte[] png = Base64.decode(b64, Base64.DEFAULT);
                String fname = (name == null || name.isEmpty() ? "screenshot" : name.replaceAll("[^A-Za-z0-9._ -]", "-")) + (name != null && name.endsWith(".png") ? "" : ".png");
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Images.Media.DISPLAY_NAME, fname); cv.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                    cv.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/BLOCK CITY TYCOON");
                    Uri u = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                    if (u == null) throw new Exception("MediaStore insert failed");
                    OutputStream out = getContentResolver().openOutputStream(u); out.write(png); out.close();
                    log("info", "Picture saved Pictures/BLOCK CITY TYCOON/" + fname);
                    result(id, obj("ok", true, "path", "Pictures/BLOCK CITY TYCOON/" + fname));
                } else {
                    pendingId = id; pendingBytes = png;
                    ui.post(new Runnable() { @Override public void run() { Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("image/png"); i.putExtra(Intent.EXTRA_TITLE, fname); startActivityForResult(i, REQ_PICTURE); } });
                }
            } catch (Exception e) { result(id, obj("ok", false, "error", String.valueOf(e.getMessage()))); }
        }
        @JavascriptInterface
        public void exitApp() { ui.post(new Runnable() { @Override public void run() { log("info", "Exit"); finishAndRemoveTask(); } }); }
        @JavascriptInterface
        public void setOrientation(String mode) {
            ui.post(new Runnable() { @Override public void run() { setRequestedOrientation("portrait".equals(mode) ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT
                : "auto".equals(mode) ? ActivityInfo.SCREEN_ORIENTATION_FULL_USER : ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE); } });
        }
        @JavascriptInterface
        public void keepScreenOn(boolean on) { ui.post(new Runnable() { @Override public void run() { if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); } }); }
        @JavascriptInterface
        public int thermalStatus() {
            if (Build.VERSION.SDK_INT < 29) return 0;
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            return pm != null ? pm.getCurrentThermalStatus() : 0;
        }
        /* ---- self-test only ---- */
        @JavascriptInterface
        public String selftestRealm() {
            if (!selftest) return "null";
            try { if (selftestRealm == null) selftestRealm = makeSelftestRealm(); return selftestRealm.toString(); } catch (Exception e) { log("error", "Self-test realm: " + e); return "null"; }
        }
        @JavascriptInterface
        public void selftestNativeBack() { if (selftest) ui.post(new Runnable() { @Override public void run() { onBackPressed(); } }); }
        @JavascriptInterface
        public void selftestNativePad() {
            if (!selftest) return;
            ui.post(new Runnable() { @Override public void run() {
                long t = android.os.SystemClock.uptimeMillis();
                dispatchKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_BUTTON_A, 0, 0, -1, 0, 0, InputDevice.SOURCE_GAMEPAD));
                ui.postDelayed(new Runnable() { @Override public void run() { long t2 = android.os.SystemClock.uptimeMillis(); dispatchKeyEvent(new KeyEvent(t, t2, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_BUTTON_A, 0, 0, -1, 0, 0, InputDevice.SOURCE_GAMEPAD)); } }, 120);
            } });
        }
        @JavascriptInterface
        public void selftestRestart() {
            if (!selftest) return;
            ui.post(new Runnable() { @Override public void run() {
                log("info", "Self-test: restarting the app (phase 2)");
                Intent i = new Intent(MainActivity.this, MainActivity.class).putExtra("selftest", true).putExtra("selftestPhase", 2).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
                startActivity(i); finish();
            } });
        }
        @JavascriptInterface
        public void selftestReport(String json) {
            if (!selftest) return;
            try { FileOutputStream o = new FileOutputStream(new File(logDir, "selftest.json")); o.write(json.getBytes(StandardCharsets.UTF_8)); o.close(); } catch (Exception e) { log("error", "selftest.json: " + e); }
            boolean ok = false; int passed = 0, total = 0;
            try { JSONObject r = new JSONObject(json); ok = r.optBoolean("ok"); passed = r.optInt("passed"); total = r.optInt("total"); } catch (Exception e) { /* bad json */ }
            int n = (json.length() + 1499) / 1500;                    // the full report in logcat chunks (release APKs are not debuggable → no run-as)
            for (int k = 0; k < n; k++) Log.i("BCT_SELFTEST", "R" + (k + 1) + "/" + n + " " + json.substring(k * 1500, Math.min(json.length(), (k + 1) * 1500)));
            Log.i("BCT_SELFTEST", "SELFTEST_DONE ok=" + ok + " passed=" + passed + "/" + total);
            log("info", "Self-test finished: " + passed + "/" + total + (ok ? " — ALL PASSED" : " — FAILED"));
        }
    }
}
