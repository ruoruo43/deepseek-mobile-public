package com.ruoruo43.deepseekmobile;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.ColorSpace;
import android.graphics.ImageDecoder;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.os.Build;
import com.googlecode.tesseract.android.TessBaseAPI;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import org.json.JSONException;
import org.json.JSONObject;

/** Reads pixels from one system-selected image and runs the packaged OCR model. */
final class ImageTextRecognition {
    private static final int MAX_SIDE = 2400;
    private static final String[] MODELS = {"chi_sim.traineddata", "eng.traineddata"};

    static JSONObject recognize(Context context, Uri uri) {
        Bitmap image;
        try {
            image = decodeImage(context, uri);
        } catch (IOException | RuntimeException e) {
            return status("unreadable");
        }
        try {
            TessBaseAPI engine = new TessBaseAPI();
            try {
                if (!engine.init(prepareModels(context).getAbsolutePath(), "chi_sim+eng")) {
                    return status("failed");
                }
                engine.setPageSegMode(TessBaseAPI.PageSegMode.PSM_AUTO);
                engine.setImage(image);
                String text = engine.getUTF8Text();
                if (text == null || text.trim().isEmpty()) return status("empty");
                return result("recognized", text.trim());
            } finally {
                engine.recycle();
            }
        } catch (IOException | RuntimeException | LinkageError e) {
            return status("failed");
        } finally {
            image.recycle();
        }
    }

    static JSONObject status(String status) {
        return result(status, null);
    }

    private static JSONObject result(String status, String text) {
        try {
            return new JSONObject().put("status", status).put("text", text);
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    private static File prepareModels(Context context) throws IOException {
        File root = new File(context.getNoBackupFilesDir(), "ocr-4.1.0");
        File tessdata = new File(root, "tessdata");
        if (!tessdata.mkdirs() && !tessdata.isDirectory()) {
            throw new IOException("Could not create OCR model directory");
        }
        for (String name : MODELS) {
            File model = new File(tessdata, name);
            if (model.isFile() && model.length() > 0) continue;
            File temporary = File.createTempFile("model-", ".part", tessdata);
            try {
                try (InputStream source = context.getAssets().open("ocr/tessdata/" + name);
                     FileOutputStream output = new FileOutputStream(temporary)) {
                    byte[] buffer = new byte[32_768];
                    int count;
                    while ((count = source.read(buffer)) != -1) {
                        output.write(buffer, 0, count);
                    }
                }
                if (!temporary.renameTo(model)) {
                    throw new IOException("Could not finish OCR model extraction");
                }
            } finally {
                temporary.delete();
            }
        }
        return root;
    }

    private static Bitmap decodeImage(Context context, Uri uri) throws IOException {
        Bitmap image = Build.VERSION.SDK_INT >= 28 ? decodeModern(context, uri) : decodeLegacy(context, uri);
        if (image == null) throw new IOException("Unreadable image");
        if (image.getConfig() == Bitmap.Config.ARGB_8888 && !image.hasAlpha()) return image;
        try {
            Bitmap opaque = Bitmap.createBitmap(image.getWidth(), image.getHeight(), Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(opaque);
            canvas.drawColor(Color.WHITE);
            canvas.drawBitmap(image, 0, 0, null);
            return opaque;
        } finally {
            image.recycle();
        }
    }

    private static Bitmap decodeModern(Context context, Uri uri) throws IOException {
        ImageDecoder.Source source = ImageDecoder.createSource(context.getContentResolver(), uri);
        return ImageDecoder.decodeBitmap(source, (decoder, info, ignored) -> {
            int width = info.getSize().getWidth();
            int height = info.getSize().getHeight();
            int longest = Math.max(width, height);
            decoder.setAllocator(ImageDecoder.ALLOCATOR_SOFTWARE);
            decoder.setTargetColorSpace(ColorSpace.get(ColorSpace.Named.SRGB));
            if (longest > MAX_SIDE) {
                decoder.setTargetSize((int) Math.max(1, width * (long) MAX_SIDE / longest),
                        (int) Math.max(1, height * (long) MAX_SIDE / longest));
            }
        });
    }

    private static Bitmap decodeLegacy(Context context, Uri uri) throws IOException {
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inJustDecodeBounds = true;
        try (InputStream input = context.getContentResolver().openInputStream(uri)) {
            BitmapFactory.decodeStream(input, null, options);
        }
        if (options.outWidth < 1 || options.outHeight < 1) throw new IOException("Invalid image dimensions");
        options.inJustDecodeBounds = false;
        options.inPreferredConfig = Bitmap.Config.ARGB_8888;
        options.inSampleSize = 1;
        while (Math.max(options.outWidth, options.outHeight) / options.inSampleSize > MAX_SIDE) {
            options.inSampleSize *= 2;
        }
        Bitmap image;
        try (InputStream input = context.getContentResolver().openInputStream(uri)) {
            image = BitmapFactory.decodeStream(input, null, options);
        }
        if (image == null) return null;
        Matrix transform = new Matrix();
        try (InputStream input = context.getContentResolver().openInputStream(uri)) {
            if (input == null) return image;
            int orientation = new ExifInterface(input).getAttributeInt(
                    ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            switch (orientation) {
                case ExifInterface.ORIENTATION_FLIP_HORIZONTAL:
                    transform.setScale(-1, 1);
                    break;
                case ExifInterface.ORIENTATION_ROTATE_180:
                    transform.setRotate(180);
                    break;
                case ExifInterface.ORIENTATION_FLIP_VERTICAL:
                    transform.setScale(1, -1);
                    break;
                case ExifInterface.ORIENTATION_TRANSPOSE:
                    transform.setRotate(90);
                    transform.postScale(-1, 1);
                    break;
                case ExifInterface.ORIENTATION_ROTATE_90:
                    transform.setRotate(90);
                    break;
                case ExifInterface.ORIENTATION_TRANSVERSE:
                    transform.setRotate(270);
                    transform.postScale(-1, 1);
                    break;
                case ExifInterface.ORIENTATION_ROTATE_270:
                    transform.setRotate(270);
                    break;
                default:
                    return image;
            }
        } catch (IOException ignored) {
            return image;
        }
        Bitmap rotated = Bitmap.createBitmap(image, 0, 0, image.getWidth(), image.getHeight(), transform, true);
        if (rotated != image) image.recycle();
        return rotated;
    }
}
