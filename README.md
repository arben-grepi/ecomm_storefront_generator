# E-commerce Admin Dashboard

A Next.js multi-storefront e-commerce platform for managing dropshipping products sourced from Shopify. Shopify products are sourced via DSers from Alibaba and Temu. The platform also supports creating custom products.

## Features

- **Multiple Storefronts**: Create and manage multiple e-commerce storefronts
- **Shopify Integration**: Import and process products from Shopify (sourced via DSers from Alibaba/Temu)
- **Custom Products**: Create and manage your own products
- **Admin Dashboard**: Analytics, product management, and storefront configuration
- **Protected Routes**: Admin routes are protected and accessible only to authorized admin accounts

## Collaborator Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/LUNERA-ECOMM/ecommerce-admin.git
   cd ecommerce-admin
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure Firebase:**
   - Create a `.env.local` file in the root directory
   - Add your Firebase configuration variables:
     ```env
     NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
     NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=ecommerce-2f366.firebaseapp.com
     NEXT_PUBLIC_FIREBASE_PROJECT_ID=ecommerce-2f366
     NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=ecommerce-2f366.firebasestorage.app
     NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id_here
     NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id_here
     NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id_here
     ```
   - **Important:** Never commit `.env.local` to the repository (it's already in `.gitignore`)

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open [http://localhost:3000](http://localhost:3000)** in your browser (redirects to `/LUNERA`)

## Development Workflow

**For collaborators (required):**

1. **Pull the latest changes:**
   ```bash
   git checkout master
   git pull origin master
   ```

2. **Create a new branch for your changes:**
   ```bash
   git checkout -b feature/your-feature-name
   ```
   Use descriptive branch names like `feature/ai-text-generation` or `fix/category-bug`

3. **Make your changes and commit:**
   ```bash
   git add .
   git commit -m "Description of your changes"
   ```

4. **Push your branch to GitHub:**
   ```bash
   git push origin feature/your-feature-name
   ```

5. **Create a Pull Request:**
   - Go to the repository on GitHub
   - Click "New Pull Request"
   - Select your branch and create the PR
   - Wait for approval before merging

**Note:** The `master` branch is protected. All changes must go through a Pull Request and require approval before merging.

## Project Structure

```
├── app/
│   ├── LUNERA/              # Main storefront (all routes under /LUNERA)
│   │   ├── admin/           # Admin dashboard
│   │   ├── (collections)/   # Category and product pages
│   │   └── page.js          # Homepage
│   └── page.js              # Root redirect to /LUNERA
├── components/
│   ├── admin/               # Admin components
│   └── ...                  # Storefront components
└── lib/                     # Utilities and Firebase config
```

## Tasks

- [ ] **AI Text Generation** - [@AndyMcCode](https://github.com/AndyMcCode) - [Task Documentation](docs/ai-text-generation.md)

## Admin Access

Authorized admin accounts:
- `arbengrepi@gmail.com`
- `andreas.konga@gmail.com`
- `muliqiblerine@gmail.com`

## Technologies Used

- Next.js 16 (App Router)
- React 19
- Firebase (Authentication, Firestore, Hosting)
- Tailwind CSS 4

## Deployment

Deployment is handled automatically via GitHub Actions when pushing to the `master` branch. See `.github/workflows/` for deployment configuration.

### Manual Deployment

```bash
npm run build
firebase deploy
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Firebase Documentation](https://firebase.google.com/docs)
