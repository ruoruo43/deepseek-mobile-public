package com.ruoruo43.deepseekmobile;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import android.os.SystemClock;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.HashSet;
import javax.net.ssl.HttpsURLConnection;

final class UpdateApk {
    static final long MAX_BYTES = 128L * 1024 * 1024;
    private static final long DOWNLOAD_TIMEOUT_MS = 150_000;
    private static final int SOCKET_TIMEOUT_MS = 10_000;
    private static final int MAX_REDIRECTS = 4;

    static final class InvalidApk extends IOException {
        InvalidApk() {
            super("Update APK did not pass validation");
        }
    }

    private UpdateApk() {}

    static File download(Context context, String address, String version, long bytes, String sha256)
            throws Exception {
        long deadline = SystemClock.elapsedRealtime() + DOWNLOAD_TIMEOUT_MS;
        File apk = UpdateApkProvider.createFile(context);
        boolean verified = false;
        try {
            transfer(new URL(address), apk, bytes, sha256, deadline);
            verifyPackage(context, apk, version);
            verified = true;
            return apk;
        } finally {
            if (!verified) apk.delete();
        }
    }

    private static void transfer(URL url, File apk, long bytes, String sha256, long deadline)
            throws Exception {
        for (int redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
            requireTimeRemaining(deadline);
            if (!isTrustedAsset(url)) throw new IOException("Untrusted update address");
            HttpsURLConnection connection = (HttpsURLConnection) url.openConnection();
            try {
                connection.setInstanceFollowRedirects(false);
                connection.setUseCaches(false);
                connection.setConnectTimeout(SOCKET_TIMEOUT_MS);
                connection.setReadTimeout(SOCKET_TIMEOUT_MS);
                connection.setRequestProperty("Accept-Encoding", "identity");
                connection.setRequestProperty("User-Agent", "DS-Chat-Android");
                int code = connection.getResponseCode();
                if (code >= 300 && code < 400) {
                    String location = connection.getHeaderField("Location");
                    if (location == null) throw new IOException("Missing update redirect");
                    url = new URL(url, location);
                    continue;
                }
                if (code != 200) throw new IOException("Update download unavailable");
                copyApk(connection, apk, bytes, sha256, deadline);
                return;
            } finally {
                connection.disconnect();
            }
        }
        throw new IOException("Too many update redirects");
    }

    private static boolean isTrustedAsset(URL url) {
        String host = url.getHost();
        return "https".equals(url.getProtocol()) && url.getUserInfo() == null
                && (url.getPort() == -1 || url.getPort() == 443)
                && ("github.com".equalsIgnoreCase(host)
                        || "release-assets.githubusercontent.com".equalsIgnoreCase(host)
                        || "objects.githubusercontent.com".equalsIgnoreCase(host));
    }

    private static void copyApk(HttpsURLConnection connection, File apk, long bytes, String sha256,
                                long deadline) throws Exception {
        long announced = connection.getContentLengthLong();
        if (announced > MAX_BYTES || (bytes > 0 && announced >= 0 && announced != bytes)) {
            throw new InvalidApk();
        }
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long actual = 0;
        try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(apk)) {
            byte[] buffer = new byte[32_768];
            for (int count; (count = input.read(buffer)) != -1; ) {
                requireTimeRemaining(deadline);
                actual += count;
                if (actual > MAX_BYTES || (bytes > 0 && actual > bytes)) throw new InvalidApk();
                output.write(buffer, 0, count);
                digest.update(buffer, 0, count);
            }
        }
        requireTimeRemaining(deadline);
        if (actual == 0 || (bytes > 0 && actual != bytes)
                || (announced >= 0 && actual != announced)
                || (sha256 != null && !sha256.equals(hex(digest.digest())))) {
            throw new InvalidApk();
        }
    }

    @SuppressWarnings("deprecation")
    private static void verifyPackage(Context context, File apk, String version)
            throws PackageManager.NameNotFoundException, InvalidApk {
        boolean newerSigningApi = Build.VERSION.SDK_INT >= 28;
        int flags = newerSigningApi ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageManager packages = context.getPackageManager();
        PackageInfo installed = packages.getPackageInfo(context.getPackageName(), flags);
        PackageInfo candidate = packages.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (candidate == null || !installed.packageName.equals(candidate.packageName)
                || !version.equals(candidate.versionName) || versionCode(candidate) <= versionCode(installed)) {
            throw new InvalidApk();
        }
        Signature[] expected = signers(installed);
        Signature[] actual = signers(candidate);
        if (expected == null || actual == null || expected.length == 0 || expected.length != actual.length
                || !new HashSet<>(Arrays.asList(expected)).equals(new HashSet<>(Arrays.asList(actual)))) {
            throw new InvalidApk();
        }
    }

    @SuppressWarnings("deprecation")
    private static long versionCode(PackageInfo info) {
        return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }

    @SuppressWarnings("deprecation")
    private static Signature[] signers(PackageInfo info) {
        if (Build.VERSION.SDK_INT < 28) return info.signatures;
        return info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners();
    }

    private static String hex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            result.append(Character.forDigit((value & 255) >>> 4, 16));
            result.append(Character.forDigit(value & 15, 16));
        }
        return result.toString();
    }

    private static void requireTimeRemaining(long deadline) throws IOException {
        if (Thread.currentThread().isInterrupted() || SystemClock.elapsedRealtime() >= deadline) {
            throw new IOException("Update download interrupted");
        }
    }
}
