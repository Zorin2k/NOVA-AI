# ✦ Nova AI — Android + OpenAI Backend

Nova AI v1.3 is an Android chat prototype, backed by a Node.js API using OpenAI's **Responses API**. The app contains **no OpenAI API key**.

## What works

- Android chat interface with locally saved multiple conversations and New Chat
- Password login to a privately deployed backend over HTTPS
- Server-held paid OpenAI API key and short-lived signed session tokens
- 12-message conversation context, message-size limits, per-session throttling
- OpenAI Responses API (default model: `gpt-6-luna`, configurable)
- Automated backend tests and official Android APK compilation on GitHub Actions

## 1. Add paid OpenAI API billing and create an API key

Go to https://platform.openai.com/api-keys and create an API key.
Set a project budget/usage limit in the OpenAI dashboard.
API usage costs money separately from ChatGPT Plus.
**Never paste the API key into the Android app or GitHub files.**

## 2. Deploy the Node.js backend

The root `render.yaml` provides a Render Blueprint, but deployment is NOT automatic from this repository.

1. Sign in to https://dashboard.render.com/ and create a **New Blueprint** linked to this GitHub repository.
2. Select `render.yaml`. Review the hosting plan/price before deployment.
3. Enter these **environment variables in Render**, not on GitHub:
   - `OPENAI_API_KEY`: your OpenAI API key
   - `NOVA_APP_PASSWORD`: a unique passphrase of 12 or more characters
   - `NOVA_SESSION_SECRET`: Render Blueprint generates this automatically (32+ chars)
   - `OPENAI_MODEL`: default `gpt-6-luna`; change if your API project lacks model access.
4. Deploy and copy your service's `https://...onrender.com` URL.
5. Check that `https://YOUR-SERVICE-URL/health` returns JSON with `"status":"ok"`.

> GitHub Actions builds the Android APK but **does not host the backend**. A hosting provider and private environment variables are required for real AI responses.

## 3. Install Android APK

Visit the [Actions](https://github.com/Zorin2k/NOVA-AI/actions) tab.
Open the latest **Build Nova AI APK** run with a green check.
Download its **NovaAI-Android-APK** artifact and extract `app-debug.apk`.
Install the extracted APK on your Android phone.

## 4. Connect the app

In Nova AI, tap **⚙ Settings**, enter:
- **Backend URL**: the HTTPS URL of your deployed service (no path)
- **App password**: the `NOVA_APP_PASSWORD` you configured on the server

Tap **Connect**. A successful login gives a temporary token. The password is not stored by the app. The app stores chat history **locally on your device**, and a logout clears the temporary session token. Clear/delete chats inside the app when needed. Do not share the app password with strangers.

## Local backend development (computer)

Install Node.js 20+ and copy `backend/.env.example` to `backend/.env`, then replace the example settings.
From `backend`, run `node --env-file=.env server.mjs` and browse `http://localhost:3000/health`.
Run `node --test` to test locally.
The Android release app deliberately requires **HTTPS**, so it cannot connect to an insecure local HTTP server; for local Android tests use a development HTTPS reverse proxy/tunnel.

## Security notes and limitations

- Public source code is safe to share, but the server key/password must stay in your hosting platform environment.
- This is a **single-owner/password-gated prototype**, not a multi-user commercial platform. For public release add account-based authentication, database persistence, abuse controls, monitoring, device integration and privacy disclosures.
- Debug APKs are for testing, not Play Store production release.
- No secrets stored in GitHub Actions; the workflow runs offline mocked backend tests and compiles the UI.
- A session automatically expires after 12 hours.
- Server errors such as 401 (invalid key) or 429 (billing/rate limit) require server-side configuration, not an APK rebuild.
