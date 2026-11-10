package com.nova.ai;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public final class MainActivity extends Activity {
    private WebView view;
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        view = new WebView(this);
        view.setWebViewClient(new WebViewClient());
        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        // Development mode: the app may call a backend on the same LAN.
        // Production requires HTTPS and an authenticated server.
        s.setAllowUniversalAccessFromFileURLs(true);
        view.loadUrl("file:///android_asset/index.html");
        setContentView(view);
    }
    @Override public void onDestroy() {
        if(view != null) { view.destroy(); view = null; }
        super.onDestroy();
    }
}
