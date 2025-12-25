# Multi-Storefront E-commerce Platform

A sophisticated Next.js e-commerce platform that uses Shopify as a headless backend for dropshipping products. The platform enables the creation and management of multiple independent storefronts, each selling different product catalogs imported from Shopify, with advanced customization capabilities before products go live.

## Project Overview

This platform is designed for managing multiple e-commerce storefronts that source products from Shopify (via DSers from Alibaba and Temu). The Next.js application provides a powerful solution for creating and managing different storefronts that sell different items imported from Shopify. Users can customize products before launching them on one or multiple storefronts, manage different items for different markets, and display products to users based on their country/market accessed via URL path.

### Key Features

- **Premium Design**: Tailwind-powered design system that gives the site a legitimate, high-quality online shop feel and look
- **Multiple Storefronts**: Create unlimited independent storefronts, each with its own product catalog and branding
- **Shopify Integration**: Import products from Shopify as a headless backend for dropshipping
- **Product Customization**: Customize products (images, descriptions, pricing, variants) before launching to storefronts
- **Market Management**: Manage different products for different markets (e.g., Finland, Germany) with market-specific pricing and availability
- **Country-Based Routing**: Products are automatically filtered and displayed based on the user's country/market detected from their IP address
- **Payment & Checkout**: Integrated with Shopify's checkout system, leveraging Shopify's outstanding payment processing and global order tracking services
- **Editable Content**: Essential website text can be altered from the admin overview without code changes. All content is rendered on the server before being sent as fully formed HTML to the client, ensuring optimal web crawler indexing and search engine optimization
- **Real-Time Sync**: Webhooks synchronize Shopify backend information (shipping prices, stock levels, product updates) with the Next.js app in real-time
- **Smart Server-Side Rendering (SSR)**: The application uses SSR strategically to ensure all product content, descriptions, and metadata are fully rendered as HTML on the server before delivery. This makes the content highly search-optimizable, as search engine crawlers can index all product information without executing JavaScript, significantly improving SEO rankings and discoverability

## Architecture

### Server-Side Rendering (SSR)

The application uses server-side rendering for critical benefits:

**SEO Optimization:**
- Product names, descriptions, and metadata are rendered as HTML on the server, making them immediately accessible to search engine crawlers
- Search engines can index product content without executing JavaScript, improving discoverability and search rankings

**Performance Benefits:**
- Faster initial page load as users receive fully rendered HTML with product data
- Improved Core Web Vitals scores (better LCP, reduced time to interactive)
- Better user experience, especially on slower connections

### Performance Optimizations

The application implements modern performance optimization techniques:

**React Optimizations:**
- **Memoization (`useMemo`)**: Prevents expensive recalculations on every render. For example, variant grouping and filtering in `ProductDetailPage` are memoized - they only recalculate when variants actually change, not on every state update. Market and storefront values are also memoized to avoid recalculating them on every Firestore snapshot update.
- **Component Memoization (`React.memo`)**: `ProductCard` and `CategoryCard` are wrapped with `React.memo` to prevent unnecessary re-renders. When a parent component updates, these cards won't re-render unless their props actually change.
- **Optimized Context**: Storefront context uses memoization to avoid recalculating storefront values unnecessarily.

**Image Optimization:**
- **Next.js Image Component**: Automatically converts images to modern formats (WebP/AVIF) which are 30-50% smaller than JPEG/PNG, reducing bandwidth and load times. Images are lazy-loaded (only load when scrolled into view) and use responsive sizing based on viewport.

**Caching Strategies:**
- **In-Memory Caching**: Storefront detection is cached in memory to avoid repeatedly parsing URLs or reading cookies. Once detected, it's reused throughout the session.
- **localStorage Caching**: Stock levels are cached in the browser's localStorage with a 5-minute expiration, reducing API calls for frequently accessed product data.

**Parallel Data Fetching:**
- **Promise.all**: On server-side pages, we fetch categories, products, and site info simultaneously using `Promise.all` instead of waiting for each one sequentially. This reduces total page load time from ~300ms (100ms × 3) to ~100ms (all at once).

**Code Splitting:**
- **Dynamic Imports**: Admin-only components like `AdminRedirect` are loaded dynamically only when needed, reducing the initial JavaScript bundle size for regular customers.

## Admin Dashboard

The admin dashboard provides comprehensive management capabilities:

- **Product Management**: Import products from Shopify queue and customize before launching to storefronts (products can only be created via Shopify import, not manually)
- **Category Management**: Create, edit, and organize product categories
- **Order Tracking**: Monitor orders, fulfillment status, and customer information
- **Stock Management**: Real-time stock level monitoring with low-stock alerts
- **Content Editing**: Edit essential website text without code changes

## Webhook Integration

The platform uses Shopify webhooks to maintain real-time synchronization between Shopify and the Next.js application. Webhooks automatically update product data, inventory levels, prices, shipping rates, and order information whenever changes occur in Shopify, ensuring the storefronts always display current information without manual intervention.

## Production Website

The production website is currently live and under continuous development:

- **LUNERA Storefront** (Default): [https://blerinas.com](https://blerinas.com) - Served at the root URL
- **FIVESTARFINDS Storefront**: [https://blerinas.com/FIVESTARFINDS](https://blerinas.com/FIVESTARFINDS) - Served at `/FIVESTARFINDS`
- **Status**: Under construction and being developed continuously
- **Current Status**: We currently have 2 storefronts. Products are only available in FIVESTARFINDS at this time.

### Storefront Routing

- **Root URL** (`/` or `blerinas.com`): Serves the **LUNERA** storefront (default)
- **Other Storefronts**: Accessible via `/STOREFRONT_NAME` (e.g., `/FIVESTARFINDS`)
- In development: `http://localhost:3000` serves LUNERA, `http://localhost:3000/FIVESTARFINDS` serves FIVESTARFINDS

## Current Development

We are currently working closely with **Andreas Konge** to optimize the application further:

- **AI-Powered Content Generation**: Using an external Python FastAPI service to generate product display names, descriptions, and bullet points automatically when importing products from Shopify
- **Multi-Language Support**: AI-powered translation to generate content in multiple languages
- **IP-Based Localization**: Automatically translate websites into different European languages based on the user's IP address

### AI Content Generation

The platform integrates with an external Python FastAPI service for AI-powered product content generation. When importing products from Shopify, the system automatically generates:
- **Display Name**: Shorter, optimized product names
- **Display Description**: 2-4 sentence product descriptions (50-150 words)
- **Bullet Points**: Up to 5 key product features

See `docs/AI_SERVICE_SETUP.md` and `docs/AI_SERVICE_DEPLOYMENT.md` for setup and deployment instructions.

## Technologies

- **Next.js 16** (App Router) with React 19
- **Firebase** (Authentication, Firestore, Hosting)
- **Shopify** (Headless backend, Storefront API, Admin API)
- **Tailwind CSS 4** for styling

## Getting Started

### Prerequisites

- Node.js 18+ 
- Firebase project with Firestore enabled
- Shopify store with Storefront API access

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/LUNERA-ECOMM/ecommerce-admin.git
   cd ecommerce-admin
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env.local` file in the root directory with Firebase and Shopify credentials (see `.env.example` for reference)

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open [http://localhost:3000](http://localhost:3000)** in your browser
   - Root URL (`http://localhost:3000`) serves the **LUNERA** storefront (default)
   - Other storefronts are accessible at `http://localhost:3000/STOREFRONT_NAME` (e.g., `http://localhost:3000/FIVESTARFINDS`)

## Deployment

Deployment is handled via **Firebase App Hosting**. The application is configured for automatic deployment when pushing to the `master` branch via GitHub integration.

### Environment Variables & Secrets

The application uses Google Cloud Secret Manager for environment variables. Required secrets include:
- Firebase configuration (`NEXT_PUBLIC_FIREBASE_*`)
- Shopify credentials (`SHOPIFY_*`)
- AI Product Content Generation Service URL (`NEXT_PUBLIC_PRODUCT_API_URL`)

Secrets must be created in Google Cloud Secret Manager and granted access to the App Hosting backend:

```bash
# Grant backend access to a secret
firebase apphosting:secrets:grantaccess SECRET_NAME --backend BACKEND_NAME --location REGION
```

See `docs/AI_SERVICE_SETUP.md` and `docs/AI_SERVICE_DEPLOYMENT.md` for detailed setup instructions.

### Manual Deployment

For Firebase App Hosting, deployment is typically handled automatically via GitHub integration. For manual deployment, use the Firebase Console or CLI.

## Admin Access

Authorized admin accounts:
- `arbengrepi@gmail.com`
- `muliqiblerine@gmail.com`
- `andreas.konga@gmail.com`

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Shopify Storefront API](https://shopify.dev/docs/api/storefront)
