# E-commerce Admin Dashboard

A Next.js e-commerce application featuring a minimalist lingerie boutique with admin dashboard functionality.

## Features

- **E-commerce Homepage**: Beautiful, minimalist design showcasing 15 lingerie products
- **Google Authentication**: Sign in with Google to access the admin dashboard
- **Admin Dashboard**: Analytics and product overview (accessible only to `arbengrepi@gmail.com`)
- **Protected Routes**: Admin routes are protected and redirect unauthorized users

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Firebase project set up with Authentication enabled

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Firebase:**
   - Create a `.env.local` file in the root directory
   - Copy the values from `.env.local.example` and fill in your Firebase configuration:
     ```env
     NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
     NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
     NEXT_PUBLIC_FIREBASE_PROJECT_ID=ecommerce-2f366
     NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
     NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id_here
     NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id_here
     ```

3. **Enable Google Authentication in Firebase:**
   - Go to Firebase Console → Authentication → Sign-in method
   - Enable Google as a sign-in provider

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open [http://localhost:3000](http://localhost:3000)** in your browser

## Project Structure

```
├── app/
│   ├── admin/
│   │   └── overview/     # Admin dashboard (protected route)
│   ├── page.js           # E-commerce homepage
│   └── layout.js         # Root layout
├── components/
│   ├── AuthButton.js     # Google Sign-In button component
│   └── ProductCard.js   # Product card component
└── lib/
    ├── auth.js           # Authentication utilities
    ├── firebase.js       # Firebase configuration
    └── products.js       # Mock product data
```

## Authentication Flow

- **Regular Users**: Can browse the e-commerce site and sign in with Google
- **Admin Users** (`arbengrepi@gmail.com`): Automatically redirected to `/admin/overview` after sign-in
- **Unauthorized Access**: Attempts to access admin routes redirect to the homepage

## Technologies Used

- Next.js 16 (App Router)
- React 19
- Firebase Authentication
- Tailwind CSS 4
- Google Fonts (Geist)

## Deployment

### Firebase Hosting Setup

This project uses Firebase Hosting with Next.js SSR support, which requires Cloud Functions.

**Before deploying, ensure:**

1. **Cloud Functions API is enabled** (⚠️ **Required - one-time setup**):
   - Go to [Google Cloud Console](https://console.cloud.google.com/apis/library/cloudfunctions.googleapis.com?project=ecommerce-2f366)
   - Click "Enable" button
   - Wait 2-3 minutes for activation
   - **No CLI tools needed** - just use the web console

2. **Required Firebase APIs:**
   - Cloud Functions API
   - Cloud Build API (for building functions)
   - Firebase Hosting API

3. **Service Account Permissions:**
   - The GitHub Actions service account needs permissions to:
     - Create/update Cloud Functions
     - Deploy to Firebase Hosting
     - Enable APIs (or enable manually)

### Manual Deployment

```bash
npm run build
firebase deploy
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Firebase Authentication](https://firebase.google.com/docs/auth)
- [Firebase Hosting with Next.js](https://firebase.google.com/docs/hosting/frameworks/nextjs)
