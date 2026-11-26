package com.ruoruo43.deepseekmobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class ApiKeyVault {
    private static final String MODE = "AES/GCM/NoPadding";
    private final String alias;
    private final SharedPreferences preferences;

    ApiKeyVault(Context context) {
        this(context, "ds-mobile-api-key", "encrypted_api");
    }

    ApiKeyVault(Context context, String alias, String preferencesName) {
        this.alias = alias;
        preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE);
    }

    boolean hasValue() {
        return preferences.contains("payload");
    }

    String read() throws GeneralSecurityException, IOException {
        String record = preferences.getString("payload", null);
        if (record == null) return null;
        int delimiter = record.indexOf('.');
        if (delimiter < 1) throw new GeneralSecurityException("Malformed encrypted record");
        byte[] iv = Base64.decode(record.substring(0, delimiter), Base64.NO_WRAP);
        byte[] encrypted = Base64.decode(record.substring(delimiter + 1), Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance(MODE);
        cipher.init(Cipher.DECRYPT_MODE, getKey(false), new GCMParameterSpec(128, iv));
        return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
    }

    void write(String value) throws GeneralSecurityException, IOException {
        if (value == null) {
            if (!preferences.edit().remove("payload").commit()) {
                throw new IOException("Unable to clear encrypted record");
            }
            return;
        }
        if (value.isEmpty() || value.length() > 512) {
            throw new IllegalArgumentException("Invalid credential length");
        }
        Cipher cipher = Cipher.getInstance(MODE);
        cipher.init(Cipher.ENCRYPT_MODE, getKey(true));
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        String record = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP)
                + "." + Base64.encodeToString(encrypted, Base64.NO_WRAP);
        if (!preferences.edit().putString("payload", record).commit()) {
            throw new IOException("Unable to save encrypted record");
        }
    }

    private SecretKey getKey(boolean allowCreate) throws GeneralSecurityException, IOException {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        SecretKey existing = (SecretKey) keyStore.getKey(alias, null);
        if (existing != null) return existing;
        if (!allowCreate) throw new GeneralSecurityException("Missing device encryption key");
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
                alias, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return generator.generateKey();
    }
}
