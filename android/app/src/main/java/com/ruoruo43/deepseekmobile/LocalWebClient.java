package com.ruoruo43.deepseekmobile;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

final class LocalWebClient extends WebViewClient {
    static final String APP_HOST = "appassets.androidplatform.net";
    static final String APP_ORIGIN = "https://" + APP_HOST;
    static final String START_URL = APP_ORIGIN + "/index.html";
    private static final String POLICY = "default-src 'none'; script-src 'self'; "
            + "connect-src https://api.deepseek.com; img-src 'self' data: blob:; "
            + "style-src 'self' 'unsafe-inline'; font-src 'self' data:; "
            + "media-src 'self' blob:; worker-src 'self' blob:; "
            + "frame-src 'none'; frame-ancestors 'none'; form-action 'none'; base-uri 'none'";

    private final MainActivity activity;
    private final AssetManager assets;

    LocalWebClient(MainActivity activity) {
        this.activity = activity;
        assets = activity.getAssets();
    }

    static boolean httpsHost(Uri uri, String name) {
        return "https".equals(uri.getScheme()) && name.equals(uri.getHost())
                && uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (httpsHost(uri, APP_HOST)) {
            return localAsset(request);
        }
        if (!request.isForMainFrame() && httpsHost(uri, "api.deepseek.com")) {
            return null;
        }
        return rejected(403, "Forbidden");
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        if (request.isForMainFrame() && START_URL.equals(uri.toString())) return false;
        if (request.isForMainFrame() && request.hasGesture()
                && ("https".equals(uri.getScheme()) || "http".equals(uri.getScheme()))
                && uri.getHost() != null && uri.getUserInfo() == null) {
            activity.openExternalLink(uri);
        }
        return true;
    }

    @Override
    public void onPageFinished(WebView view, String url) {
        super.onPageFinished(view, url);
        if (START_URL.equals(url)) activity.connectPage();
    }

    private WebResourceResponse localAsset(WebResourceRequest request) {
        String path = request.getUrl().getPath();
        if (!"GET".equals(request.getMethod()) || path == null
                || (request.isForMainFrame() && !"/index.html".equals(path))
                || path.contains("..")
                || !("/index.html".equals(path) || "/LICENSE".equals(path)
                    || path.matches("/static/[A-Za-z0-9_./-]+"))) {
            return rejected(404, "Not Found");
        }
        try {
            Map<String, String> headers = new HashMap<>();
            headers.put("Content-Security-Policy", POLICY);
            headers.put("X-Content-Type-Options", "nosniff");
            headers.put("Referrer-Policy", "no-referrer");
            return new WebResourceResponse(contentType(path), "UTF-8", 200, "OK", headers,
                    assets.open("www" + path, AssetManager.ACCESS_STREAMING));
        } catch (IOException e) {
            return rejected(404, "Not Found");
        }
    }

    private static WebResourceResponse rejected(int status, String reason) {
        return new WebResourceResponse("text/plain", "UTF-8", status, reason, null,
                new ByteArrayInputStream(new byte[0]));
    }

    private static String contentType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".woff2")) return "font/woff2";
        if (path.endsWith(".woff")) return "font/woff";
        if (path.endsWith(".ttf")) return "font/ttf";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".png")) return "image/png";
        return "text/plain";
    }
}
