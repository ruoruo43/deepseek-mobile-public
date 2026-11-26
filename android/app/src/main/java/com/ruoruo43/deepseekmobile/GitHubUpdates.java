package com.ruoruo43.deepseekmobile;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.SystemClock;
import android.provider.Settings;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import java.util.regex.Pattern;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class GitHubUpdates {
    private static final String LATEST_RELEASE =
            "https://api.github.com/repos/ruoruo43/deepseek-mobile-public/releases/latest";
    private static final String RELEASES_PAGE =
            "https://github.com/ruoruo43/deepseek-mobile-public/releases/";
    private static final int SOCKET_TIMEOUT_MS = 5_000;
    private static final int RESPONSE_DEADLINE_MS = 12_000;
    private static final int MAX_RESPONSE_BYTES = 512 * 1024;
    private static final int MAX_TAG_LENGTH = 64;
    private static final int INSTALL_APK = 14;
    private static final Pattern TAG =
            Pattern.compile("v(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)");

    private final Activity activity;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean closed;
    private boolean busy;
    private boolean installerOpen;
    private JSONObject checkedRelease;
    private File readyApk;

    GitHubUpdates(Activity activity) {
        this.activity = activity;
    }

    void check(Consumer<JSONObject> finished) {
        if (busy || installerOpen) {
            finished.accept(status("busy"));
            return;
        }
        busy = true;
        checkedRelease = null;
        discardApk();
        worker.execute(() -> {
            JSONObject result = fetchLatestRelease();
            activity.runOnUiThread(() -> {
                if (closed) return;
                busy = false;
                if (result.optBoolean("downloadAvailable")) checkedRelease = result;
                finished.accept(result);
            });
        });
    }

    void download(String tag, Consumer<JSONObject> finished) {
        if (busy || installerOpen) {
            finished.accept(status("busy"));
            return;
        }
        if (!matchesCheckedRelease(tag)) {
            finished.accept(status("downloadFailed"));
            return;
        }
        if (readyApk != null && readyApk.isFile()) {
            finished.accept(status("ready"));
            return;
        }

        long bytes = checkedRelease.optLong("bytes", -1);
        String sha256 = checkedRelease.optString("sha256", null);
        busy = true;
        worker.execute(() -> {
            File downloaded = null;
            String outcome;
            try {
                downloaded = UpdateApk.download(activity, apkUrl(tag), tag.substring(1), bytes, sha256);
                outcome = "ready";
            } catch (UpdateApk.InvalidApk e) {
                outcome = "invalidApk";
            } catch (Exception e) {
                outcome = "downloadFailed";
            }
            File apk = downloaded;
            JSONObject result = status(outcome);
            activity.runOnUiThread(() -> {
                if (closed || activity.isFinishing()) {
                    if (apk != null) apk.delete();
                    return;
                }
                busy = false;
                readyApk = apk;
                finished.accept(result);
            });
        });
    }

    JSONObject install(String tag) {
        if (busy || installerOpen) return status("busy");
        if (!matchesCheckedRelease(tag) || readyApk == null || !readyApk.isFile()) {
            return status("downloadRequired");
        }
        try {
            if (!activity.getPackageManager().canRequestPackageInstalls()) {
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.fromParts("package", activity.getPackageName(), null)));
                return status("permissionSettings");
            }
            Uri uri = UpdateApkProvider.uriFor(activity, readyApk);
            Intent installer = new Intent(Intent.ACTION_INSTALL_PACKAGE)
                    .setDataAndType(uri, UpdateApkProvider.MIME)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    .putExtra(Intent.EXTRA_RETURN_RESULT, true);
            installer.setClipData(ClipData.newRawUri("DS 对话", uri));
            activity.startActivityForResult(installer, INSTALL_APK);
            installerOpen = true;
            return status("installerOpened");
        } catch (RuntimeException e) {
            return status("installFailed");
        }
    }

    boolean onActivityResult(int request) {
        if (request != INSTALL_APK) return false;
        installerOpen = false;
        if (readyApk != null) {
            activity.revokeUriPermission(UpdateApkProvider.uriFor(activity, readyApk),
                    Intent.FLAG_GRANT_READ_URI_PERMISSION);
        }
        return true;
    }

    private boolean matchesCheckedRelease(String tag) {
        return checkedRelease != null && checkedRelease.optString("tag").equals(tag);
    }

    private void discardApk() {
        if (readyApk != null) readyApk.delete();
        readyApk = null;
    }

    void close() {
        closed = true;
        worker.shutdownNow();
        if (!installerOpen) discardApk();
    }

    private static JSONObject fetchLatestRelease() {
        long deadline = SystemClock.elapsedRealtime() + RESPONSE_DEADLINE_MS;
        HttpsURLConnection connection = null;
        try {
            connection = openConnection(LATEST_RELEASE);
            connection.setRequestProperty("Accept", "application/vnd.github+json");
            connection.setRequestProperty("X-GitHub-Api-Version", "2026-03-10");

            int code = connection.getResponseCode();
            requireTimeRemaining(deadline);
            if (code == 200) return readRelease(connection, deadline);
            if (code == 404) return status("notFound");
            if (code == 429 || (code == 403 && ("0".equals(connection.getHeaderField("X-RateLimit-Remaining"))
                    || connection.getHeaderField("Retry-After") != null))) {
                return readLatestReleasePage(deadline);
            }
            return status("unavailable");
        } catch (SocketTimeoutException e) {
            return status("timeout");
        } catch (JSONException e) {
            return status("invalidRelease");
        } catch (IOException | RuntimeException e) {
            return status("networkError");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static HttpsURLConnection openConnection(String address) throws IOException {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(address).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setUseCaches(false);
        connection.setRequestMethod("GET");
        connection.setConnectTimeout(SOCKET_TIMEOUT_MS);
        connection.setReadTimeout(SOCKET_TIMEOUT_MS);
        connection.setRequestProperty("User-Agent", "DS-Chat-Android");
        return connection;
    }

    private static JSONObject readLatestReleasePage(long deadline) {
        HttpsURLConnection connection = null;
        try {
            requireTimeRemaining(deadline);
            String latestPage = RELEASES_PAGE + "latest";
            connection = openConnection(latestPage);
            int code = connection.getResponseCode();
            requireTimeRemaining(deadline);
            String location = connection.getHeaderField("Location");
            if (code < 300 || code >= 400 || location == null) return status("rateLimited");

            // GitHub redirects /releases/latest to the current stable tag. Read its location only.
            String target = URI.create(latestPage).resolve(location).toASCIIString();
            String tagPrefix = RELEASES_PAGE + "tag/";
            if (!target.startsWith(tagPrefix)) return status("rateLimited");
            String tag = target.substring(tagPrefix.length());
            // The published filename includes the stable version. The APK signer still must match.
            return isStableTag(tag)
                    ? status("release").put("tag", tag).put("downloadAvailable", true)
                    : status("rateLimited");
        } catch (IOException | JSONException | RuntimeException e) {
            return status("rateLimited");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static JSONObject readRelease(HttpsURLConnection connection, long deadline)
            throws IOException, JSONException {
        if (connection.getContentLengthLong() > MAX_RESPONSE_BYTES) return status("invalidRelease");
        try (InputStream input = connection.getInputStream()) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8_192];
            for (int count; (count = input.read(buffer)) != -1; ) {
                requireTimeRemaining(deadline);
                if (output.size() + count > MAX_RESPONSE_BYTES) return status("invalidRelease");
                output.write(buffer, 0, count);
            }
            requireTimeRemaining(deadline);
            JSONObject release = new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8));
            Object tag = release.opt("tag_name");
            if (!(tag instanceof String) || !isStableTag((String) tag)
                    || !Boolean.FALSE.equals(release.opt("draft"))
                    || !Boolean.FALSE.equals(release.opt("prerelease"))) {
                return status("invalidRelease");
            }
            String stableTag = (String) tag;
            JSONObject result = status("release").put("tag", stableTag);
            JSONArray assets = release.optJSONArray("assets");
            if (assets == null) return result;
            for (int index = 0; index < assets.length(); index++) {
                JSONObject asset = assets.optJSONObject(index);
                if (asset == null || !apkUrl(stableTag).equals(asset.optString("browser_download_url"))
                        || !"uploaded".equals(asset.optString("state"))) continue;
                long bytes = asset.optLong("size", -1);
                String digest = asset.optString("digest");
                if (bytes > 0 && bytes <= UpdateApk.MAX_BYTES && digest.matches("sha256:[0-9a-fA-F]{64}")) {
                    return result.put("downloadAvailable", true).put("bytes", bytes)
                            .put("sha256", digest.substring(7).toLowerCase(Locale.ROOT));
                }
            }
            return result;
        }
    }

    private static String apkUrl(String tag) {
        return RELEASES_PAGE + "download/" + tag + "/ds-chat-" + tag.substring(1) + "-android.apk";
    }

    private static boolean isStableTag(String tag) {
        return tag.length() <= MAX_TAG_LENGTH && TAG.matcher(tag).matches();
    }

    private static void requireTimeRemaining(long deadline) throws SocketTimeoutException {
        if (SystemClock.elapsedRealtime() >= deadline) throw new SocketTimeoutException();
    }

    private static JSONObject status(String value) {
        return new JSONObject(Collections.singletonMap("status", value));
    }
}
