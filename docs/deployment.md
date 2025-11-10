# Deployment Guide

## Prerequisites

Before deploying to Firebase Hosting, ensure the following APIs are enabled in your Google Cloud project. **You don't need to install any CLI tools** - just use the web console links below.

### Required APIs

1. **Cloud Functions API** (Required for Next.js SSR) ⚠️ **REQUIRED**
   - **Enable here:** https://console.cloud.google.com/apis/library/cloudfunctions.googleapis.com?project=ecommerce-2f366
   - Click the "Enable" button
   - Wait 2-3 minutes for it to activate

2. **Cloud Build API** (Required for building Cloud Functions)
   - **Enable here:** https://console.cloud.google.com/apis/library/cloudbuild.googleapis.com?project=ecommerce-2f366
   - Click the "Enable" button

3. **Firebase Hosting API** (Usually enabled by default)
   - **Check here:** https://console.cloud.google.com/apis/library/firebasehosting.googleapis.com?project=ecommerce-2f366
   - Should already be enabled, but verify if needed

> **Note:** You don't need to install `gcloud` CLI. The web console links above are the easiest way to enable these APIs.

### Service Account Permissions

Ensure your Firebase service account (`FIREBASE_SERVICE_ACCOUNT_ECOMMERCE_2F366`) has the following roles:
- Cloud Functions Admin
- Firebase Admin
- Service Account User
- Cloud Build Service Account

## Build Failure: "Cloud Functions API has not been used"

If you see this error during deployment:

```
Cloud Functions API has not been used in project *** before or it is disabled.
```

**Solution:**
1. Visit: https://console.cloud.google.com/apis/library/cloudfunctions.googleapis.com?project=ecommerce-2f366
2. Click "Enable"
3. Wait 2-3 minutes for the API to propagate
4. Retry the deployment

## Manual Deployment

```bash
# Build the project
npm run build

# Deploy to Firebase
firebase deploy
```

## CI/CD Deployment

The GitHub Actions workflows will automatically:
1. Build the Next.js application
2. Deploy to Firebase Hosting
3. Create/update Cloud Functions for SSR routes

Make sure all required APIs are enabled before the first deployment.

