# Multi-Storefront E-commerce Platform

A Next.js multi-storefront e-commerce platform using Shopify as a headless backend and single source of truth. The system generates multiple independent storefronts, imports products from Shopify into an internal database, and serves market-specific catalogs.

After import, products go through a processing phase where they are assigned to storefronts and categories, configured with images, and prepared for launch with customer-facing content.

## AI-Powered Content Generation

As part of the product workflow, I built an AI system that generates optimized product display names, marketing-ready descriptions, and optional bullet points from raw Shopify product data.

### AI Integration

The AI system is implemented as a FastAPI microservice using LangChain and Anthropic Claude (Haiku), deployed on Google Cloud Run. The Next.js application communicates with it via HTTP POST during product processing or manual regeneration.

**Key Implementation Details:**
- **Structured Output Parsing**: Pydantic models enforce type-safe JSON responses and validation
- **Prompt Engineering**: Multi-layered prompts define tone, formatting, and content constraints
- **Constraint-Based Generation**: Business rules (e.g., display names shorter than original titles) enforced via schemas and prompts
- **Asynchronous Processing**: Non-blocking API calls keep the UI responsive (2–5 seconds per request)

### Data Flow and Processing

Product data flows from Shopify Admin API → Next.js app → FastAPI AI service → Claude LLM → structured JSON response. No RAG or vector databases are required since the input data is already structured.

The AI extracts relevant information from HTML, removes technical noise, identifies key benefits, and generates marketing copy while avoiding hallucination. Outputs (`displayName`, `displayDescription`, `bulletPoints[]`) are validated before being persisted and used by storefronts.

### Technologies and Deployment

Technologies include LangChain, Anthropic Claude (Haiku), FastAPI, Pydantic, Google Cloud Run, and prompt engineering. The AI service is containerized, integrates with Next.js via REST, and uses Google Secret Manager for secure API key management.

**Repositories:**
- Backend: [CreateNameAndDescription](https://github.com/arben-grepi/CreateNameAndDescription)
- Frontend: [ecomm_storefront_generator](https://github.com/arben-grepi/ecomm_storefront_generator)

## Platform Features

- **Multiple Storefronts**: Create unlimited independent storefronts, each with its own product catalog and branding
- **Shopify Integration**: Import products from Shopify as a headless backend for dropshipping
- **Product Customization**: Customize products (images, descriptions, pricing, variants) before launching to storefronts
- **Market Management**: Manage different products for different markets (e.g., Finland, Germany) with market-specific pricing and availability
- **Country-Based Routing**: Products are automatically filtered and displayed based on the user's country/market detected from their IP address
- **Payment & Checkout**: Integrated with Shopify's checkout system, leveraging Shopify's outstanding payment processing and global order tracking services
- **Editable Content**: Essential website text can be altered from the admin overview without code changes. All content is rendered on the server before being sent as fully formed HTML to the client, ensuring optimal web crawler indexing and search engine optimization
- **Real-Time Sync**: Webhooks synchronize Shopify backend information (shipping prices, stock levels, product updates) with the Next.js app in real-time
- **Smart Server-Side Rendering (SSR)**: The application uses SSR strategically to ensure all product content, descriptions, and metadata are fully rendered as HTML on the server before delivery. This makes the content highly search-optimizable, as search engine crawlers can index all product information without executing JavaScript, significantly improving SEO rankings and discoverability

## Production Storefronts

Currently live storefronts:
- **HEALTH**: [https://blerinas.com/HEALTH](https://blerinas.com/HEALTH)
- **FIVESTARFINDS**: [https://blerinas.com/FIVESTARFINDS](https://blerinas.com/FIVESTARFINDS)

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
   git clone https://github.com/arben-grepi/ecomm_storefront_generator.git
   cd ecomm_storefront_generator
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env.local` file with Firebase and Shopify credentials

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open [http://localhost:3000](http://localhost:3000)** in your browser

## Deployment

Deployment is handled via **Firebase App Hosting** with automatic deployment when pushing to the `master` branch. Environment variables and secrets are managed through Google Cloud Secret Manager.
