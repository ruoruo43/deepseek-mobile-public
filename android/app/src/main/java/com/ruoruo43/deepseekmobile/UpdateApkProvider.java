package com.ruoruo43.deepseekmobile;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.util.regex.Pattern;

/** Grants the installer read-only access to the particular APK selected by the app. */
public final class UpdateApkProvider extends ContentProvider {
    static final String MIME = "application/vnd.android.package-archive";
    private static final Pattern APK_NAME = Pattern.compile("update-[0-9]+\\.apk");
    private static final long CACHE_AGE_MS = 24 * 60 * 60 * 1000L;
    private static final String[] COLUMNS = {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};

    private static String authority(Context context) {
        return context.getPackageName() + ".update-apk";
    }

    private static File directory(Context context) {
        return new File(context.getCacheDir(), "app-updates");
    }

    static File createFile(Context context) throws IOException {
        File cache = directory(context);
        if (!cache.isDirectory() && !cache.mkdirs()) throw new IOException("Update cache is unavailable");
        long expiredBefore = System.currentTimeMillis() - CACHE_AGE_MS;
        File[] expired = cache.listFiles(file -> APK_NAME.matcher(file.getName()).matches()
                && file.lastModified() < expiredBefore);
        if (expired != null) {
            for (File file : expired) file.delete();
        }
        return File.createTempFile("update-", ".apk", cache);
    }

    static Uri uriFor(Context context, File apk) {
        return new Uri.Builder().scheme("content").authority(authority(context))
                .appendPath(apk.getName()).build();
    }

    private File resolve(Uri uri) {
        Context context = getContext();
        String name = uri.getLastPathSegment();
        if (context == null || !authority(context).equals(uri.getAuthority())
                || uri.getPathSegments().size() != 1 || name == null || !APK_NAME.matcher(name).matches()) {
            throw new IllegalArgumentException("Invalid update URI");
        }
        return new File(directory(context), name);
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public String getType(Uri uri) {
        resolve(uri);
        return MIME;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String order) {
        File apk = resolve(uri);
        String[] columns = projection == null ? COLUMNS : projection;
        MatrixCursor cursor = new MatrixCursor(columns, 1);
        if (apk.isFile()) {
            MatrixCursor.RowBuilder row = cursor.newRow();
            for (String column : columns) {
                if (OpenableColumns.DISPLAY_NAME.equals(column)) row.add("ds-chat-update.apk");
                else if (OpenableColumns.SIZE.equals(column)) row.add(apk.length());
                else row.add(null);
            }
        }
        return cursor;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File apk = resolve(uri);
        if (!"r".equals(mode) || !apk.isFile()) throw new FileNotFoundException("Update APK is unavailable");
        return ParcelFileDescriptor.open(apk, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException();
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] args) {
        throw new UnsupportedOperationException();
    }

    @Override
    public int delete(Uri uri, String selection, String[] args) {
        throw new UnsupportedOperationException();
    }
}
