# Multi-Storefront E-commerce Platform

<img src="docs/screenshots/2Storefronts.png" alt="Multi-Storefront View" width="50%" height="auto" />

Run multiple independent online stores from a single Shopify account and a single codebase.

Each storefront has its own brand identity, product catalog, URL, and customer experience — but they all share one Shopify backend, one Firebase database, and one admin dashboard. New storefronts are added with minimal setup and no code duplication.

## Live Storefronts

- **HEALTH**: [blerinas.com/HEALTH](https://www.blerinas.com/HEALTH)
- **FIVESTARFINDS**: [blerinas.com/FIVESTARFINDS](https://www.blerinas.com/FIVESTARFINDS)

---

## Key Features

### Multi-Storefront from One Shopify Store
Products are imported from Shopify into Firebase and assigned to storefronts via the admin dashboard. Each storefront has its own independent catalog — products are published to whichever storefronts make sense for them.

### AI-Powered Product Copy
When configured, an external microservice generates storefront-specific product names, descriptions, and bullet points tailored to each brand's niche and tone. **This repo does not include a hosted AI endpoint** — cloning the project alone does not connect you to anyone else's service. You point the app at *your* deployment by setting an environment variable (see below). If AI is not configured, the admin UI still works; product text is filled in manually.

### Real-Time Stock & Price Sync via Webhooks
Shopify webhooks keep the Firebase database in sync automatically:
- When stock changes in Shopify (e.g. a variant sells out), the change is reflected across all storefronts instantly
- When prices are updated in Shopify, they propagate to the correct storefronts in real-time
- Crucially, the webhook system **respects admin decisions**: if a product is removed from a storefront via the admin dashboard, future webhooks will not push updates back to that storefront — admin control is never overwritten

### Country & Market-Based Product Filtering
A custom middleware layer detects the user's country from their IP address on every request. Products are then filtered by market availability — a product available in Germany but not Finland simply won't appear for Finnish customers. Market and storefront preferences are cached in cookies to avoid repeated geolocation lookups.

### Full Storefront Customization Without Code Changes
Every visual aspect of a storefront is stored in the database and editable through the admin interface:
- Color palettes, fonts, and sizing
- Product card styles (minimal, bordered, overlay, compact), aspect ratios, column layouts
- Hero section text, banner images, and crop settings
- Company tagline, footer text, category headings

<img src="docs/screenshots/AdminEditSiteInfo.png" alt="Site Customization" width="50%" height="auto" />

*Adjust colors, fonts, content, and product card layout — no code changes required*

### Server-Side Rendering for SEO
For an e-commerce business, search engine visibility is critical. Next.js was chosen specifically for its server-side rendering capabilities — product names, descriptions, prices, and hero text are all rendered as HTML on the server before the page reaches the browser. Search engine crawlers can index every product without executing JavaScript, which directly improves discoverability and search rankings. Page metadata (title, description) is also generated server-side and tailored per storefront.

### Complete Post-Purchase Flow
After completing a Shopify checkout, customers are redirected back to the correct storefront's custom thank-you page — not a generic Shopify confirmation screen. The thank-you page is storefront-branded and pulls the order confirmation from Firebase (populated by the orders webhook).

---

## Admin Dashboard

<img src="docs/screenshots/AdminPortal.png" alt="Admin Portal Overview" width="50%" height="auto" />

The admin dashboard is the single control point for all storefronts:

- **Import Queue**: Pull products from Shopify into a staging area before they go live
- **Product Editor**: Customize images, descriptions, pricing, and variants per product before publishing

<img src="docs/screenshots/AdminImportProducts.png" alt="Product Import" width="50%" height="auto" />

*Import products from Shopify into the staging area*

<img src="docs/screenshots/AdminEditProducts.png" alt="Edit Products" width="50%" height="auto" />

*Customize products before launching to storefronts*

- **Storefront Assignment**: Assign products to their storefront and control which categories they appear in
- **Category Management**: Create and organize categories independently per storefront
- **Styling Control**: Adjust all visual configurations per storefront from a single interface
- **Order Tracking**: Monitor orders, fulfillment status, and customer information across all storefronts
- **Analytics**: Track performance per storefront and market

All changes are reflected live across storefronts immediately.

---

## Adding a New Storefront

Currently, launching a new storefront is a straightforward developer task:

1. Add a route folder for the new storefront (e.g. `app/MYSTOREFRONTNAME/`)
2. Run a setup script that provisions the storefront's database documents with default content and configuration
3. Configure branding, colors, and content through the admin dashboard — no further code changes needed

**Coming soon — self-service storefront creation:** The goal is for store admins to be able to spin up a new storefront entirely on their own, without touching the codebase at all. The planned approach is a guided flow in the admin dashboard that collects the storefront name and initial settings, then triggers a backend script that automatically provisions the route, database documents, and default configuration in one step.

---

## Checkout Flow

<img src="docs/screenshots/NextJsCheckoutPage.png" alt="Next.js Checkout Page" width="50%" height="auto" />

*Checkout begins in the Next.js storefront, with storefront-specific branding*

<img src="docs/screenshots/ShopifyCheckout.png" alt="Shopify Checkout" width="50%" height="auto" />

*Payment and order processing are handled securely by Shopify*

Building a custom payment system across multiple countries and currencies would be a massive undertaking — handling compliance, fraud detection, local payment methods, and tax regulations per market. Shopify's payment infrastructure solves all of that out of the box, which is why it was chosen as the headless payment processor. The customer experience stays within the storefront up until the final payment step, then hands off to Shopify for secure processing. After payment, an `orders/create` webhook fires and saves the order to Firebase, after which the customer is redirected to a custom branded thank-you page.

---

## Technical Architecture

### Data Flow

```
Shopify (backend)
    ↓  import via Admin API
Firebase (database)
    ↓  serve via Firebase Admin SDK (server-side)
Next.js (storefronts)
    ↓  render HTML on server (SSR)
Browser (customer)
```

Shopify webhooks (`products/update`, `orders/create`, `orders/update`) keep Firebase in sync in real-time. The Next.js app never calls Shopify directly at request time — all data comes from Firebase, which keeps pages fast and decoupled from Shopify's API rate limits.

### Performance Optimizations

- **Parallel server-side data fetching**: Products, site info, and categories are fetched simultaneously with `Promise.all`, reducing server response time
- **React `cache()` deduplication**: If both `generateMetadata()` and the page component request the same Firestore document, only one database query is made
- **`React.memo` on ProductCard**: Prevents re-renders of unchanged cards when filters or other state changes
- **`useMemo` for expensive computations**: Variant grouping and availability filtering are cached and only recomputed when their inputs change
- **Next.js Image component**: Automatic WebP/AVIF conversion, lazy loading, and responsive sizing reduce image payload by ~60%
- **Dynamic imports for admin components**: Admin-only code is excluded from the main bundle and loaded on demand

### Middleware & Routing

Custom Next.js middleware runs on every request to:
1. Detect the user's country via IP geolocation
2. Set `market` and `storefront` cookies for use by server and client components
3. Route requests to the correct storefront based on URL path

---

## Technologies

- **Next.js 16** (App Router) with React 19
- **Firebase** (Firestore, Authentication, App Hosting)
- **Shopify** (Headless backend via Storefront API & Admin API, Webhooks)
- **Tailwind CSS 4**

---

## Getting Started

### Prerequisites

- Node.js 18+
- Firebase project with Firestore enabled
- Shopify store with Storefront API and Admin API access

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/arben-grepi/ecomm_storefront_generator.git
   cd ecomm_storefront_generator
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env.local` file with your Firebase and Shopify credentials.

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

### AI product content (optional)

The Next.js app calls `/api/generate-product-text`, which **proxies** requests to a separate FastAPI service. Set `PRODUCT_API_URL` in your environment to the base URL of that service (the app will POST to `{PRODUCT_API_URL}/generate`). Without it, AI generation is disabled and the admin can still edit products by hand.

- **Open-source microservice:** [CreateNameAndDescription](https://github.com/arben-grepi/CreateNameAndDescription) — deploy your own instance (e.g. Cloud Run), add your LLM API keys there, then plug the service URL into this app.
- **Detailed setup:** see [`docs/AI_SERVICE_SETUP.md`](docs/AI_SERVICE_SETUP.md) and [`docs/AI_SERVICE_DEPLOYMENT.md`](docs/AI_SERVICE_DEPLOYMENT.md).

Production deployments should store `PRODUCT_API_URL` (or `NEXT_PUBLIC_PRODUCT_API_URL` if you use that variant) in your secret manager — never commit a live URL or API keys to the repository.

## Deployment

Deployed via **Firebase App Hosting** with automatic deployment on push to the `master` branch. Secrets are managed through Google Cloud Secret Manager.

---

## Contact

Setting up the full integration — connecting Shopify and the Next.js app, configuring webhooks, environment variables, and getting everything ready to go — requires a few specific steps. If you'd like help getting set up, feel free to reach out: **arbengrepi@gmail.com**
