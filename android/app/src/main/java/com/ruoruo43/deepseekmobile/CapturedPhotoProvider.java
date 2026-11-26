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

/** Exposes just the app-created JPEG requested by the system camera intent. */
public final class CapturedPhotoProvider extends ContentProvider {
    private static final Pattern CAPTURE_NAME = Pattern.compile("photo-[0-9]+\\.jpg");
    private static final long CACHE_AGE_MS = 24 * 60 * 60 * 1000L;
    private static final String[] COLUMNS = {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};

    static String authority(Context context) {
        return context.getPackageName() + ".captured-photo";
    }

    private static File directory(Context context) {
        return new File(context.getCacheDir(), "captured-photos");
    }

    static File createPhoto(Context context) throws IOException {
        File directory = directory(context);
        if (!directory.isDirectory() && !directory.mkdirs()) {
            throw new IOException("Unable to create photo cache");
        }
        long expiredBefore = System.currentTimeMillis() - CACHE_AGE_MS;
        File[] expired = directory.listFiles(file -> CAPTURE_NAME.matcher(file.getName()).matches()
                && file.lastModified() < expiredBefore);
        if (expired != null) {
            for (File file : expired) file.delete();
        }
        return File.createTempFile("photo-", ".jpg", directory);
    }

    static Uri uriFor(Context context, File photo) {
        return new Uri.Builder().scheme("content").authority(authority(context))
                .appendPath(photo.getName()).build();
    }

    private File resolve(Uri uri) {
        Context context = getContext();
        String name = uri.getLastPathSegment();
        if (context == null || !authority(context).equals(uri.getAuthority())
                || uri.getPathSegments().size() != 1 || name == null
                || !CAPTURE_NAME.matcher(name).matches()) {
            throw new IllegalArgumentException("Invalid captured photo URI");
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
        return "image/jpeg";
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] args, String order) {
        File photo = resolve(uri);
        String[] columns = projection == null ? COLUMNS : projection;
        MatrixCursor cursor = new MatrixCursor(columns, 1);
        if (photo.isFile()) {
            MatrixCursor.RowBuilder row = cursor.newRow();
            for (String column : columns) {
                if (OpenableColumns.DISPLAY_NAME.equals(column)) row.add(photo.getName());
                else if (OpenableColumns.SIZE.equals(column)) row.add(photo.length());
                else row.add(null);
            }
        }
        return cursor;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File photo = resolve(uri);
        if (!photo.isFile()) throw new FileNotFoundException("Captured photo is unavailable");
        return ParcelFileDescriptor.open(photo, ParcelFileDescriptor.parseMode(mode));
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
