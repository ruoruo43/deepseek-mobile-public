package com.ruoruo43.deepseekmobile;

import android.app.Activity;
import android.os.SystemClock;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.SocketTimeoutException;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import java.util.regex.Pattern;
import javax.net.ssl.HttpsURLConnection;
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
    private static final Pattern TAG =
            Pattern.compile("v(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)");

    private final Activity activity;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private boolean checking;

    GitHubUpdates(Activity activity) {
        this.activity = activity;
    }

    void check(Consumer<JSONObject> finished) {
        if (checking) {
            finished.accept(status("busy"));
            return;
        }
        checking = true;
        worker.execute(() -> {
            JSONObject result = fetchLatestRelease();
            activity.runOnUiThread(() -> {
                checking = false;
                finished.accept(result);
            });
        });
    }

    void close() {
        worker.shutdownNow();
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
            return isStableTag(tag) ? status("release").put("tag", tag) : status("rateLimited");
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
            return status("release").put("tag", tag);
        }
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
