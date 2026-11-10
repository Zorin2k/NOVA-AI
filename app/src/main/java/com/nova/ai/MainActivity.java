package com.nova.ai;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public final class MainActivity extends Activity {
    private WebView view;
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        view = new WebView(this);
        view.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView w, WebResourceRequest request) {
                // This prototype never navigates to arbitrary remote web pages.
                return true;
            }
        });
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        try (InputStream input = getAssets().open("index.html")) {
            String html = new String(input.readAllBytes(), StandardCharsets.UTF_8);
            // HTTPS origin enables secure cross-origin requests without file:// exceptions.
            view.loadDataWithBaseURL("https://appassets.androidplatform.net/", html, "text/html", "UTF-8", null);
        } catch (Exception error) {
            view.loadData("<h2>Nova AI failed to load.</h2>", "text/html", "UTF-8");
        }
        setContentView(view);
    }
    @Override public void onDestroy() {
        if (view != null) {
            view.destroy();
            view = null;
        }
        super.onDestroy();
    }
}
