package com.ruoruo43.deepseekmobile;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebSettings;
import android.webkit.WebView;
import java.io.File;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Arrays;
import java.util.ArrayList;
import org.json.JSONException;
import org.json.JSONObject;

public final class MainActivity extends Activity {
    private static final int PICK_FILE = 10;
    private static final int RECORD_AUDIO = 11;
    private static final int SAVE_HISTORY = 12;
    private static final int CAPTURE_PHOTO = 13;
    private static final int CAMERA_URI_FLAGS =
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
    private static final int MAX_PICK_IMAGES = 50;
    private static final int MAX_SHARE_LENGTH = 90_000;
    private static final int MAX_EXPORT_CHUNK = 44_000;

    private WebView web;
    private ApiKeyVault vault;
    private GitHubUpdates githubUpdates;
    private WebMessagePort hostPort;
    private ValueCallback<Uri[]> fileCallback;
    private File capturedPhoto;
    private PermissionRequest audioRequest;
    private int exportRequestId;
    private OutputStream exportOutput;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        vault = new ApiKeyVault(this);
        githubUpdates = new GitHubUpdates(this);
        web = new WebView(this);
        boolean debug = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        WebView.setWebContentsDebuggingEnabled(debug);
        web.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS);
        int night = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        web.setBackgroundColor(night == Configuration.UI_MODE_NIGHT_YES ? 0xFF171A23 : 0xFFFFFFFF);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSupportMultipleWindows(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        CookieManager.getInstance().setAcceptCookie(false);
        web.setWebViewClient(new LocalWebClient(this));
        web.setWebChromeClient(new BrowserControls());
        setContentView(web);
        web.loadUrl(LocalWebClient.START_URL);
    }

    void connectPage() {
        if (hostPort != null) hostPort.close();
        WebMessagePort[] ports = web.createWebMessageChannel();
        hostPort = ports[0];
        hostPort.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
            @Override
            public void onMessage(WebMessagePort port, WebMessage message) {
                if (port == hostPort && LocalWebClient.START_URL.equals(web.getUrl())) {
                    handlePageMessage(message.getData());
                }
            }
        });
        web.postWebMessage(new WebMessage("ds-android-port", new WebMessagePort[]{ports[1]}),
                Uri.parse(LocalWebClient.APP_ORIGIN));
    }

    private void handlePageMessage(String body) {
        int id = 0;
        try {
            if (body == null || body.length() > 600_000) return;
            JSONObject request = new JSONObject(body);
            id = request.getInt("id");
            if (id <= 0) return;
            int requestId = id;
            WebMessagePort sourcePort = hostPort;
            String value = request.isNull("value") ? null : request.getString("value");
            switch (request.getString("method")) {
                case "key.read":
                    reply(id, true, vault.read());
                    break;
                case "key.write":
                    vault.write(value);
                    reply(id, true, null);
                    break;
                case "github.release.check":
                    githubUpdates.check(result -> reply(sourcePort, requestId, true, result));
                    break;
                case "github.release.download":
                    githubUpdates.download(value, result -> reply(sourcePort, requestId, true, result));
                    break;
                case "github.release.install":
                    reply(id, true, githubUpdates.install(value));
                    break;
                case "appearance.textZoom":
                    int zoom = Integer.parseInt(value);
                    if (zoom < 90 || zoom > 130) throw new IllegalArgumentException("Invalid text zoom");
                    web.getSettings().setTextZoom(Math.round(zoom * getResources().getConfiguration().fontScale));
                    reply(id, true, null);
                    break;
                case "share.text":
                    if (value == null || value.trim().isEmpty() || value.length() > MAX_SHARE_LENGTH) {
                        throw new IllegalArgumentException("Invalid share text");
                    }
                    Intent share = new Intent(Intent.ACTION_SEND);
                    share.setType("text/plain");
                    share.putExtra(Intent.EXTRA_TEXT, value);
                    startActivity(Intent.createChooser(share, null));
                    reply(id, true, null);
                    break;
                case "export.pick":
                    pickDocumentDestination(id, value);
                    break;
                case "export.chunk":
                    if (exportOutput == null || value == null || value.length() > MAX_EXPORT_CHUNK) {
                        throw new IOException("Invalid export chunk");
                    }
                    exportOutput.write(Base64.decode(value, Base64.NO_WRAP));
                    reply(id, true, null);
                    break;
                case "export.close":
                    closeExport();
                    reply(id, true, null);
                    break;
                default:
                    reply(id, false, null);
            }
        } catch (Exception e) {
            if (id > 0) reply(id, false, null);
        }
    }

    private void reply(int id, boolean ok, Object value) {
        reply(hostPort, id, ok, value);
    }

    private void reply(WebMessagePort port, int id, boolean ok, Object value) {
        if (port == null || port != hostPort) return;
        try {
            JSONObject reply = new JSONObject();
            reply.put("id", id);
            reply.put("ok", ok);
            reply.put("value", value == null ? JSONObject.NULL : value);
            port.postMessage(new WebMessage(reply.toString()));
        } catch (JSONException | IllegalStateException e) {
            // The page may already have closed. Never log message contents.
        }
    }

    void openExternalLink(Uri destination) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, destination);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
        } catch (ActivityNotFoundException e) {
            // The APK does not load external pages into its WebView as a fallback.
        }
    }

    private void pickDocumentDestination(int id, String value) throws JSONException {
        if (exportRequestId != 0 || exportOutput != null || value == null || value.length() > 800) {
            throw new IllegalArgumentException("Invalid document export");
        }
        JSONObject document = new JSONObject(value);
        String filename = document.getString("filename");
        String type = document.getString("type");
        if (filename.trim().isEmpty() || filename.length() > 160
                || filename.contains("/") || filename.contains("\\") || !type.matches("[\\w.+-]+/[\\w.+-]+")) {
            throw new IllegalArgumentException("Invalid document name or type");
        }
        Intent picker = new Intent(Intent.ACTION_CREATE_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType(type)
                .putExtra(Intent.EXTRA_TITLE, filename);
        startActivityForResult(picker, SAVE_HISTORY);
        exportRequestId = id;
    }

    private void closeExport() throws IOException {
        OutputStream output = exportOutput;
        exportOutput = null;
        if (output != null) output.close();
    }

    private void openPhotoPicker(boolean multiple) {
        if (Build.VERSION.SDK_INT >= 33) {
            Intent photoPicker = new Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*");
            if (multiple) {
                photoPicker.putExtra(MediaStore.EXTRA_PICK_IMAGES_MAX,
                        Math.min(MAX_PICK_IMAGES, MediaStore.getPickImagesMaxLimit()));
            }
            try {
                startActivityForResult(photoPicker, PICK_FILE);
                return;
            } catch (ActivityNotFoundException e) {
                // Some devices use the system document picker for photos.
            }
        }
        Intent documents = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE)
                .setType("image/*")
                .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
        startActivityForResult(documents, PICK_FILE);
    }

    private void openCamera() throws IOException {
        capturedPhoto = CapturedPhotoProvider.createPhoto(this);
        Uri photo = CapturedPhotoProvider.uriFor(this, capturedPhoto);
        Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                .putExtra(MediaStore.EXTRA_OUTPUT, photo)
                .addFlags(CAMERA_URI_FLAGS);
        camera.setClipData(ClipData.newRawUri("Captured photo", photo));
        startActivityForResult(camera, CAPTURE_PHOTO);
    }

    private File takeCapturedPhoto() {
        File photo = capturedPhoto;
        capturedPhoto = null;
        if (photo != null) revokeUriPermission(CapturedPhotoProvider.uriFor(this, photo), CAMERA_URI_FLAGS);
        return photo;
    }

    private void notifyCameraFailure() {
        web.evaluateJavascript(
                "window.dispatchEvent(new Event('ds-android-camera-failed'))", null);
    }

    private void finishFileChoice(Uri[] uris) {
        ValueCallback<Uri[]> callback = fileCallback;
        fileCallback = null;
        if (callback != null) callback.onReceiveValue(uris);
    }

    private void addPickedUri(ArrayList<Uri> files, Uri uri) {
        if (uri != null && "content".equals(uri.getScheme())
                && !CapturedPhotoProvider.authority(this).equals(uri.getAuthority())) {
            files.add(uri);
        }
    }

    private Uri[] pickedContent(int result, Intent data) {
        if (result != RESULT_OK || data == null) return null;
        ArrayList<Uri> files = new ArrayList<>();
        ClipData picks = data.getClipData();
        if (picks == null) {
            addPickedUri(files, data.getData());
        } else {
            for (int index = 0; index < picks.getItemCount(); index++) {
                addPickedUri(files, picks.getItemAt(index).getUri());
            }
        }
        return files.isEmpty() ? null : files.toArray(new Uri[0]);
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (githubUpdates.onActivityResult(request)) return;
        if (request == PICK_FILE) {
            finishFileChoice(pickedContent(result, data));
        } else if (request == CAPTURE_PHOTO) {
            File photo = takeCapturedPhoto();
            if (result == RESULT_OK && photo != null && photo.length() > 0 && fileCallback != null) {
                finishFileChoice(new Uri[]{CapturedPhotoProvider.uriFor(this, photo)});
            } else {
                if (photo != null) photo.delete();
                if (result == RESULT_OK && fileCallback != null) notifyCameraFailure();
                finishFileChoice(null);
            }
        } else if (request == SAVE_HISTORY && exportRequestId != 0) {
            int id = exportRequestId;
            exportRequestId = 0;
            Uri target = data == null ? null : data.getData();
            if (result != RESULT_OK || target == null || !"content".equals(target.getScheme())) {
                reply(id, true, false);
                return;
            }
            try {
                exportOutput = getContentResolver().openOutputStream(target, "wt");
                reply(id, exportOutput != null, exportOutput != null);
            } catch (IOException | SecurityException e) {
                reply(id, false, null);
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int request, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(request, permissions, grants);
        if (request == RECORD_AUDIO && audioRequest != null) {
            PermissionRequest pending = audioRequest;
            audioRequest = null;
            if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) {
                pending.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else {
                pending.deny();
            }
        }
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript(
                "window.dispatchEvent(new Event('ds-android-back',{cancelable:true}))",
                consumed -> {
                    if (!"false".equals(consumed) && !isFinishing()) finish();
                });
    }

    @Override
    protected void onDestroy() {
        finishFileChoice(null);
        File photo = takeCapturedPhoto();
        if (photo != null) photo.delete();
        if (audioRequest != null) audioRequest.deny();
        if (hostPort != null) hostPort.close();
        hostPort = null;
        githubUpdates.close();
        try {
            closeExport();
        } catch (IOException e) {
            // Activity teardown cannot recover a closed document stream.
        }
        if (web != null) web.destroy();
        super.onDestroy();
    }

    private final class BrowserControls extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(
                WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null || !LocalWebClient.START_URL.equals(view.getUrl())) {
                callback.onReceiveValue(null);
                return true;
            }
            fileCallback = callback;
            String[] types = params.getAcceptTypes();
            boolean images = types.length == 1 && "image/*".equals(types[0]);
            boolean capture = images && params.isCaptureEnabled();
            try {
                if (capture) {
                    openCamera();
                } else if (images) {
                    openPhotoPicker(params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                } else {
                    startActivityForResult(params.createIntent(), PICK_FILE);
                }
            } catch (ActivityNotFoundException | SecurityException | IOException e) {
                File photo = takeCapturedPhoto();
                if (photo != null) photo.delete();
                finishFileChoice(null);
                if (capture) notifyCameraFailure();
            }
            return true;
        }

        @Override
        public void onPermissionRequest(PermissionRequest request) {
            if (audioRequest != null
                    || !LocalWebClient.httpsHost(request.getOrigin(), LocalWebClient.APP_HOST)
                    || !Arrays.equals(request.getResources(),
                        new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE})) {
                request.deny();
                return;
            }
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
                request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else {
                audioRequest = request;
                requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, RECORD_AUDIO);
            }
        }

        @Override
        public void onPermissionRequestCanceled(PermissionRequest request) {
            if (audioRequest == request) audioRequest = null;
        }
    }
}
