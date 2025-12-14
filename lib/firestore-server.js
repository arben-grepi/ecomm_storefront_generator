import { initializeApp, getApps, getApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getCollectionPath, getDocumentPath } from './store-collections';
import { cache } from 'react';

const DEFAULT_STOREFRONT = 'LUNERA';

// Initialize Firebase Admin (only on server)
let db = null;
let adminApp = null;

function serializeTimestamp(value) {
  if (!value) return null;
  if (typeof value.toMillis === 'function') {
    return value.toMillis();
  }
  if (typeof value.seconds === 'number') {
    return value.seconds * 1000 + Math.round((value.nanoseconds || 0) / 1e6);
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  return value;
}

export function getAdminDb() {
  if (db) return db;

  // Check if already initialized
  if (getApps().length === 0) {
    try {
      // Use Application Default Credentials (ADC)
      // - Automatically available in Firebase App Hosting/Cloud Run (production)
      // - For local development: run `gcloud auth application-default login`
      // - Project ID is auto-detected from ADC or GOOGLE_CLOUD_PROJECT env var
      
      // Try to get project ID from environment (App Hosting provides GOOGLE_CLOUD_PROJECT)
      // Fallback to NEXT_PUBLIC_FIREBASE_PROJECT_ID for local dev
      const projectId = process.env.GOOGLE_CLOUD_PROJECT || 
                        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
                        'ecom-store-generator-41064'; // Fallback project ID
      
      console.log(`[Firebase Admin] Initializing with ADC (projectId: ${projectId}, NODE_ENV: ${process.env.NODE_ENV})`);
      
      adminApp = initializeApp({
        credential: applicationDefault(),
        projectId, // Explicitly set project ID (ADC auto-detects, but explicit is safer)
      });
      
      // Verify initialization succeeded
      if (!adminApp) {
        throw new Error('Firebase Admin app initialization returned null');
      }
      
      console.log(`[Firebase Admin] ✅ App initialized successfully`);
      
      // Use default database
      const databaseId = process.env.FIRESTORE_DATABASE_ID;
      db = databaseId ? getFirestore(adminApp, databaseId) : getFirestore(adminApp);
      
      console.log(`[Firebase Admin] ✅ Firestore instance created (database: ${databaseId || 'default'})`);
      return db;
    } catch (error) {
      // Always log errors (both development and production) to diagnose connection issues
      console.error('❌ Firebase Admin SDK initialization failed:', error.message);
      console.error('Error details:', {
        name: error.name,
        code: error.code,
        stack: error.stack,
        googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT ? '✅ Set' : '❌ Missing',
        nextPublicProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Missing',
        nodeEnv: process.env.NODE_ENV,
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.warn('For local development, run: gcloud auth application-default login');
        console.warn('Make sure you have authenticated with Google Cloud CLI');
      } else {
        console.error('Production error: Firebase Admin SDK cannot initialize.');
        console.error('Check that Application Default Credentials are available in Firebase App Hosting.');
        console.error('Firebase App Hosting should automatically provide ADC - verify service account permissions.');
      }
      
      // Return null so calling functions can handle gracefully
      return null;
    }
  }

  // App already initialized, get existing instance
  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  adminApp = getApps()[0];
  if (!adminApp) {
    console.error('[Firebase Admin] ⚠️  App was marked as initialized but getApps()[0] returned null');
    return null;
  }
  db = databaseId ? getFirestore(adminApp, databaseId) : getFirestore(adminApp);
  console.log(`[Firebase Admin] ✅ Using existing Firestore instance (database: ${databaseId || 'default'})`);
  return db;
}

export function getAdminReference(adminDb, pathSegments) {
  let ref = adminDb;
  pathSegments.forEach((segment, index) => {
    if (index % 2 === 0) {
      ref = ref.collection(segment);
    } else {
      ref = ref.doc(segment);
    }
  });
  return ref;
}

// Transform Firestore category to e-commerce format
function transformCategory(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    value: doc.id,
    label: data.name || '',
    description: data.description || '',
    imageUrl: data.imageUrl || null,
    slug: data.slug || doc.id,
    active: data.active !== false,
    previewProductIds: data.previewProductIds || [],
    storefronts: Array.isArray(data.storefronts) ? data.storefronts : [],
  };
}

// Transform Firestore product to e-commerce format
function transformProduct(doc) {
  const data = doc.data();
  const rawMetrics = data.metrics || { totalViews: 0, totalPurchases: 0 };
  const metrics = Object.entries(rawMetrics).reduce((acc, [key, value]) => {
    acc[key] = serializeTimestamp(value) ?? value;
    return acc;
  }, {});
  const categoryIds = Array.isArray(data.categoryIds)
    ? data.categoryIds
    : data.categoryId
    ? [data.categoryId]
    : [];

  return {
    id: doc.id,
    name: data.name || '',
    slug: data.slug || doc.id,
    price: data.basePrice || 0,
    image: data.images && data.images.length > 0 ? data.images[0] : null,
    categoryIds,
    description: data.description || '',
    active: data.active !== false,
    metrics,
    viewCount: data.viewCount || null, // Direct viewCount field (newer, preferred over metrics.totalViews)
    storefronts: Array.isArray(data.storefronts) ? data.storefronts : [],
    markets: Array.isArray(data.markets) ? data.markets : [],
    marketsObject: data.marketsObject && typeof data.marketsObject === 'object' ? data.marketsObject : null,
    publishedToOnlineStore: data.publishedToOnlineStore !== false,
    hasInStockVariants: data.hasInStockVariants !== false,
    createdAt: serializeTimestamp(data.createdAt),
  };
}

// Fetch active categories (server-side)
// Only returns categories that have at least one available product (filtered by storefront and market)
// @param products - Optional: pre-fetched products array to avoid duplicate fetch
export async function getServerSideCategories(storefront = DEFAULT_STOREFRONT, market = 'DE', products = null) {
  console.log(`[SSR] 📥 Fetching categories for storefront: ${storefront}, market: ${market}`);
  const startTime = Date.now();
  
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      console.warn(`[SSR] ⚠️  No admin DB available for categories`);
      return [];
    }

    const categoriesPath = getCollectionPath('categories', storefront);
    const categoriesRef = getAdminReference(adminDb, categoriesPath);
    console.log(`[SSR] 🔍 Querying Firestore: ${categoriesPath.join('/')}`);
    
    const snapshot = await categoriesRef.get();
    console.log(`[SSR] ✅ Received ${snapshot.docs.length} category documents from Firestore`);

    // Use provided products or fetch if not provided
    let productsToUse = products;
    if (!productsToUse) {
      productsToUse = await getServerSideProducts(storefront, market);
    }
    
    // Create a set of category IDs that have available products
    const categoriesWithProducts = new Set();
    productsToUse.forEach((prod) => {
      if (prod.categoryIds && Array.isArray(prod.categoryIds)) {
        prod.categoryIds.forEach((catId) => categoriesWithProducts.add(catId));
      }
    });

    const categories = snapshot.docs
      .map(transformCategory)
      .filter((cat) => {
        // Filter by active status
        if (!cat.active) return false;
        // Only show categories that have at least one available product
        return categoriesWithProducts.has(cat.id);
      })
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''));

    const duration = Date.now() - startTime;
    console.log(`[SSR] ✅ Categories fetched: ${categories.length} active categories with available products (${duration}ms)`);
    return categories;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[SSR] ❌ Failed to fetch categories server-side (${duration}ms):`, error);
    return [];
  }
}

// Filter product by storefront, market, and availability
function filterProductByStorefrontAndMarket(prod, storefront, market) {
  // Filter by active status
  if (!prod.active) return false;
  
  // Filter by Online Store publication status
  if (prod.publishedToOnlineStore === false) return false;
  
  // Filter by storefront
  if (prod.storefronts && Array.isArray(prod.storefronts) && prod.storefronts.length > 0) {
    if (!prod.storefronts.includes(storefront)) return false;
  } else {
    // Products without storefronts array are hidden (strict storefront filtering)
    return false;
  }
  
  // Filter by market - support both array and object formats
  if (prod.marketsObject && typeof prod.marketsObject === 'object') {
    // New format: markets object { FI: { available: true, ... }, ... }
    const marketData = prod.marketsObject[market];
    if (!marketData || marketData.available === false) return false;
  } else if (prod.markets && Array.isArray(prod.markets) && prod.markets.length > 0) {
    // Legacy format: markets array
    if (!prod.markets.includes(market)) return false;
  } else {
    // Products without markets data are hidden (strict market filtering)
    return false;
  }
  
  // Filter out products with no in-stock variants
  if (prod.hasInStockVariants === false) return false;
  
  // Filter out products with less than 5 in stock
  const totalStock = prod.totalStock || 0;
  if (totalStock < 5) return false;
  
  return true;
}

// Fetch all active products (server-side) with pagination
export async function getServerSideProducts(storefront = DEFAULT_STOREFRONT, market = 'DE', limitCount = 30, startAfterDoc = null) {
  console.log(`[SSR] 📥 Fetching products for storefront: ${storefront}, market: ${market}, limit: ${limitCount}`);
  const startTime = Date.now();
  
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      console.warn(`[SSR] ⚠️  No admin DB available for products`);
      return { products: [], hasMore: false, lastDoc: null };
    }

    const productsPath = getCollectionPath('products', storefront);
    const productsRef = getAdminReference(adminDb, productsPath);
    console.log(`[SSR] 🔍 Querying Firestore: ${productsPath.join('/')}`);
    
    // Build query with server-side filtering
    // Note: Firestore only allows 1 ARRAY_CONTAINS filter per query
    // We'll use storefronts filter (most important) and filter markets client-side
    let query = productsRef
      .where('active', '==', true)
      .where('publishedToOnlineStore', '==', true)
      .where('storefronts', 'array-contains', storefront);
    
    // Cannot add markets array filter - Firestore only allows 1 ARRAY_CONTAINS per query
    // Markets will be filtered client-side (both markets array and marketsObject formats)
    
    // Add sorting and limit
    // Note: orderBy requires an index and must match a where clause or be on the same field
    // We'll try to order by viewCount, but if it fails, we'll sort client-side
    try {
      query = query.orderBy('viewCount', 'desc').limit(limitCount);
    } catch (error) {
      // If orderBy fails (missing index), just use limit and sort client-side
      console.warn(`[SSR] ⚠️  Could not add orderBy to query (may need index): ${error.message}`);
      query = query.limit(limitCount);
    }
    
    // Add pagination cursor if provided
    if (startAfterDoc) {
      query = query.startAfter(startAfterDoc);
    }
    
    const snapshot = await query.get();
    console.log(`[SSR] ✅ Received ${snapshot.docs.length} product documents from Firestore (server-side filtered)`);

    const products = snapshot.docs
      .map(transformProduct)
      .filter((prod) => {
        // Client-side filtering for markets (both array and object formats)
        // We can't use markets array filter in query (only 1 ARRAY_CONTAINS allowed)
        if (prod.marketsObject && typeof prod.marketsObject === 'object') {
          // New format: markets object { FI: { available: true, ... }, ... }
          const marketData = prod.marketsObject[market];
          if (!marketData || marketData.available === false) return false;
        } else if (prod.markets && Array.isArray(prod.markets) && prod.markets.length > 0) {
          // Legacy format: markets array
          if (!prod.markets.includes(market)) return false;
        } else {
          // Products without markets data are hidden (strict market filtering)
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Sort by viewCount (highest first), fallback to metrics.totalViews, then createdAt
        const aViews = a.viewCount ?? a.metrics?.totalViews ?? 0;
        const bViews = b.viewCount ?? b.metrics?.totalViews ?? 0;
        if (aViews !== bViews) {
          return bViews - aViews; // Highest viewCount first
        }
        // If viewCounts are equal, sort by createdAt (newest first)
        const aCreated = typeof a.createdAt === 'number' ? a.createdAt : 0;
        const bCreated = typeof b.createdAt === 'number' ? b.createdAt : 0;
        if (aCreated && bCreated) {
          return bCreated - aCreated;
        }
        return (a.name || '').localeCompare(b.name || '');
      });

    const hasMore = snapshot.docs.length === limitCount;
    const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

    const duration = Date.now() - startTime;
    console.log(`[SSR] ✅ Products fetched: ${products.length} active products (filtered by storefront: ${storefront}, market: ${market}) (${duration}ms)`);
    return { products, hasMore, lastDoc };
  } catch (error) {
    // If query fails (e.g., missing index), fall back to client-side filtering
    console.warn(`[SSR] ⚠️  Server-side query failed (may need index), falling back to client-side filtering: ${error.message}`);
    
    try {
      const adminDbFallback = getAdminDb();
      if (!adminDbFallback) {
        console.warn(`[SSR] ⚠️  No admin DB available for fallback`);
        return { products: [], hasMore: false, lastDoc: null };
      }
      
      const productsPath = getCollectionPath('products', storefront);
      const productsRef = getAdminReference(adminDbFallback, productsPath);
      const snapshot = await productsRef.limit(limitCount).get();
      
      const products = snapshot.docs
        .map(transformProduct)
        .filter((prod) => filterProductByStorefrontAndMarket(prod, storefront, market))
        .sort((a, b) => {
          const aViews = a.viewCount ?? a.metrics?.totalViews ?? 0;
          const bViews = b.viewCount ?? b.metrics?.totalViews ?? 0;
          if (aViews !== bViews) return bViews - aViews;
          const aCreated = typeof a.createdAt === 'number' ? a.createdAt : 0;
          const bCreated = typeof b.createdAt === 'number' ? b.createdAt : 0;
          if (aCreated && bCreated) return bCreated - aCreated;
          return (a.name || '').localeCompare(b.name || '');
        });
      
      const duration = Date.now() - startTime;
      console.log(`[SSR] ✅ Products fetched (fallback): ${products.length} active products (${duration}ms)`);
      return { products, hasMore: false, lastDoc: null };
    } catch (fallbackError) {
      const duration = Date.now() - startTime;
      console.error(`[SSR] ❌ Failed to fetch products server-side (${duration}ms):`, fallbackError);
      return { products: [], hasMore: false, lastDoc: null };
    }
  }
}

function transformProductDetail(doc) {
  const data = doc.data();
  const rawMetrics = data.metrics || { totalViews: 0, totalPurchases: 0 };
  const metrics = Object.entries(rawMetrics).reduce((acc, [key, value]) => {
    acc[key] = serializeTimestamp(value) ?? value;
    return acc;
  }, {});

  return {
    id: doc.id,
    name: data.name || '',
    slug: data.slug || doc.id,
    price: data.basePrice || 0, // Keep for backward compatibility
    basePrice: data.basePrice || 0, // Add basePrice field that ProductDetailPage expects
    shopifyVariantId: data.shopifyVariantId || null,
    shopifyInventoryItemId: data.shopifyInventoryItemId || null,
    attributes: data.attributes || {},
    description: data.description || '',
    descriptionHtml: data.descriptionHtml || null,
    bulletPoints: Array.isArray(data.bulletPoints) ? data.bulletPoints.filter(Boolean) : [],
    extraImages: Array.isArray(data.extraImages) ? data.extraImages.filter(Boolean) : [],
    specs: data.specs || null,
    active: data.active !== false,
    metrics,
    storefronts: Array.isArray(data.storefronts) ? data.storefronts : [],
    categoryIds: Array.isArray(data.categoryIds)
      ? data.categoryIds
      : data.categoryId
      ? [data.categoryId]
      : [],
    categoryId:
      Array.isArray(data.categoryIds) && data.categoryIds.length > 0
        ? data.categoryIds[0]
        : data.categoryId || '',
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
    sourceType: data.sourceType || 'manual',
    sourceShopifyId: data.sourceShopifyId || null,
  };
}

function transformVariant(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    size: data.size || null,
    color: data.color || null,
    type: data.type || null,
    sku: data.sku || null,
    stock: data.stock || 0,
    price: data.price ?? null, // Variant price from webhook (use ?? to preserve null values)
    priceOverride: data.priceOverride || null,
    images: Array.isArray(data.images) ? data.images.filter(Boolean) : [],
    shopifyVariantId: data.shopifyVariantId || null, // Include Shopify variant ID for checkout
    shopifyInventoryItemId: data.shopifyInventoryItemId || null, // Include inventory item ID
    attributes: data.attributes || {}, // Include flexible attributes
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}

export async function getServerSideCategoryBySlug(slug, storefront = DEFAULT_STOREFRONT) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return null;
    }

    const categoriesRef = getAdminReference(
      adminDb,
      getCollectionPath('categories', storefront)
    );
    const snapshot = await categoriesRef
      .where('slug', '==', slug)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const categoryDoc = snapshot.docs[0];
    const category = transformCategory(categoryDoc);
    return category.active ? category : null;
  } catch (error) {
    console.error(`Failed to fetch category "${slug}" server-side:`, error);
    return null;
  }
}

export async function getServerSideProductDetail(productSlug, storefront = DEFAULT_STOREFRONT) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return null;
    }

    const productsRef = getAdminReference(
      adminDb,
      getCollectionPath('products', storefront)
    );
    const snapshot = await productsRef
      .where('slug', '==', productSlug)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return null;
    }

    const productDoc = snapshot.docs[0];
    const product = transformProductDetail(productDoc);

    const variantsSnapshot = await productDoc.ref.collection('variants').get();
    const variants = variantsSnapshot.docs.map(transformVariant);

    let category = null;
    const primaryCategoryId = product.categoryIds?.[0] || null;
    if (primaryCategoryId) {
      const categoryRef = getAdminReference(
        adminDb,
        getDocumentPath('categories', primaryCategoryId, storefront)
      );
      const categoryDoc = await categoryRef.get();
      if (categoryDoc.exists) {
        category = transformCategory(categoryDoc);
      } else {
        const fallbackRef = getAdminReference(
          adminDb,
          getDocumentPath('categories', primaryCategoryId, DEFAULT_STOREFRONT)
        );
        const fallbackDoc = await fallbackRef.get();
        if (fallbackDoc.exists) {
          category = transformCategory(fallbackDoc);
        }
      }
    }

    return { product, variants, category };
  } catch (error) {
    console.error('Failed to fetch product detail server-side:', error);
    return null;
  }
}

// Fetch site info/content from {storefront}/Info (server-side)
// Language functionality removed - always returns English content
// Uses React's cache() to deduplicate requests within the same render (e.g., when generateMetadata and page both call it)
const getServerSideInfoCached = cache(async (language = 'en', storefront = DEFAULT_STOREFRONT) => {
  console.log(`[SSR] 📥 Fetching site info (language: ${language}, storefront: ${storefront})`);
  const startTime = Date.now();
  
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      console.warn(`[SSR] ⚠️  Failed to fetch site info: Firebase Admin not initialized`);
      return getDefaultInfo();
    }

    // Fetch English content from {storefront}/Info document
    console.log(`[SSR] 🔍 Querying Firestore: ${storefront}/Info`);
    const infoDoc = await adminDb.collection(storefront).doc('Info').get();
    
    if (!infoDoc.exists) {
      console.warn(`[SSR] ⚠️  ${storefront}/Info document does not exist in Firestore. Please create it at ${storefront}/Info with fields: companyName, companyTagline, heroMainHeading, heroDescription, etc.`);
      return getDefaultInfo();
    }

    const englishData = infoDoc.data();
    const formatted = formatInfoData(englishData);
    const duration = Date.now() - startTime;
    
    // Check if the document exists but has no meaningful data
    const hasData = formatted.companyName || formatted.heroMainHeading || formatted.companyTagline;
    if (!hasData) {
      console.warn(`[SSR] ⚠️  ${storefront}/Info document exists but all fields are empty. Please add data to the document.`);
    } else {
      console.log(`[SSR] ✅ Site info fetched`);
    }
    return formatted;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[SSR] ❌ Failed to fetch site info server-side (${duration}ms):`, error);
    return getDefaultInfo();
  }
});

export async function getServerSideInfo(language = 'en', storefront = DEFAULT_STOREFRONT) {
  return getServerSideInfoCached(language, storefront);
}

function formatInfoData(data) {
  // Map both old field names (from EditSiteInfoButton) and new field names
  return {
    companyName: data.companyName || data.name || '',
    companyTagline: data.companyTagline || data.slogan || '',
    companyTaglineColor: data.companyTaglineColor || 'primary',
    companyTaglineFont: data.companyTaglineFont || 'primary',
    companyTaglineFontSize: data.companyTaglineFontSize != null ? parseFloat(data.companyTaglineFontSize) || 0.75 : 0.75,
    heroMainHeading: data.heroMainHeading || '',
    heroMainHeadingColor: data.heroMainHeadingColor || 'primary',
    heroMainHeadingFont: data.heroMainHeadingFont || 'primary',
    heroMainHeadingFontSize: data.heroMainHeadingFontSize != null ? parseFloat(data.heroMainHeadingFontSize) || 4 : 4,
    heroDescription: data.heroDescription || data.heroDescr || '',
    heroDescriptionColor: data.heroDescriptionColor || 'secondary',
    heroDescriptionFont: data.heroDescriptionFont || 'primary',
    heroDescriptionFontSize: data.heroDescriptionFontSize != null ? parseFloat(data.heroDescriptionFontSize) || 1 : 1,
    heroBannerImage: data.heroBannerImage || '',
    heroBannerTextWidth: data.heroBannerTextWidth || 75,
    categorySectionHeading: data.categorySectionHeading || '',
    categorySectionDescription: data.categorySectionDescription || data.categoryDesc || '',
    allCategoriesTagline: data.allCategoriesTagline || '',
    // Category Carousel styling
    categoryCarouselColor: data.categoryCarouselColor || 'primary',
    categoryCarouselFont: data.categoryCarouselFont || 'primary',
    categoryCarouselFontSize: data.categoryCarouselFontSize != null ? parseFloat(data.categoryCarouselFontSize) || 0.875 : 0.875,
    allCategoriesTaglineColor: data.allCategoriesTaglineColor || 'secondary',
    allCategoriesTaglineFont: data.allCategoriesTaglineFont || 'primary',
    allCategoriesTaglineFontSize: data.allCategoriesTaglineFontSize != null ? parseFloat(data.allCategoriesTaglineFontSize) || 1 : 1,
    // Product Card styling
    productCardType: data.productCardType || 'minimal',
    productCardAspectRatio: data.productCardAspectRatio || '3:4',
    productCardColumnsPhone: data.productCardColumnsPhone != null ? (parseInt(data.productCardColumnsPhone, 10) || 2) : 2,
    productCardColumnsTablet: data.productCardColumnsTablet != null ? (parseInt(data.productCardColumnsTablet, 10) || 3) : 3,
    productCardColumnsLaptop: data.productCardColumnsLaptop != null ? (parseInt(data.productCardColumnsLaptop, 10) || 4) : 4,
    productCardColumnsDesktop: data.productCardColumnsDesktop != null ? (parseInt(data.productCardColumnsDesktop, 10) || 5) : 5,
    productCardGap: data.productCardGap != null ? (isNaN(parseFloat(data.productCardGap)) ? 1 : parseFloat(data.productCardGap)) : 1,
    productCardBorderRadius: data.productCardBorderRadius || 'medium',
    productCardNameColor: data.productCardNameColor || 'primary',
    productCardNameFont: data.productCardNameFont || 'primary',
    productCardNameFontSize: data.productCardNameFontSize != null ? parseFloat(data.productCardNameFontSize) || 0.65 : 0.65,
    productCardPriceColor: data.productCardPriceColor || 'primary',
    productCardPriceFont: data.productCardPriceFont || 'primary',
    productCardPriceFontSize: data.productCardPriceFontSize != null ? parseFloat(data.productCardPriceFontSize) || 1 : 1,
    productCardVatText: data.productCardVatText || 'Includes VAT',
    productCardVatColor: data.productCardVatColor || 'secondary',
    productCardVatFont: data.productCardVatFont || 'primary',
    productCardVatFontSize: data.productCardVatFontSize != null ? parseFloat(data.productCardVatFontSize) || 0.75 : 0.75,
    footerText: data.footerText || '',
    footerTextColor: data.footerTextColor || 'tertiary',
    footerTextFont: data.footerTextFont || 'primary',
    footerTextFontSize: data.footerTextFontSize != null ? parseFloat(data.footerTextFontSize) || 0.875 : 0.875,
    // Color palette (hex values)
    colorPrimary: data.colorPrimary || '#ec4899', // Default pink
    colorSecondary: data.colorSecondary || '#64748b', // Default slate-600
    colorTertiary: data.colorTertiary || '#94a3b8', // Default slate-400
    // Global Font palette
    fontPrimary: data.fontPrimary || 'inherit',
    fontSecondary: data.fontSecondary || 'inherit',
    fontTertiary: data.fontTertiary || 'inherit',
  };
}

function getDefaultInfo() {
  return {
    companyName: '',
    companyTagline: '',
    companyTaglineColor: 'primary',
    companyTaglineFont: 'primary',
    companyTaglineFontSize: 0.75,
    heroMainHeading: '', // Empty string instead of error message
    heroMainHeadingColor: 'primary',
    heroMainHeadingFont: 'primary',
    heroMainHeadingFontSize: 4,
    heroDescription: '',
    heroDescriptionColor: 'secondary',
    heroDescriptionFont: 'primary',
    heroDescriptionFontSize: 1,
    heroBannerImage: '',
    heroBannerTextWidth: 75,
    categorySectionHeading: '',
    categorySectionDescription: '',
    allCategoriesTagline: '',
    // Category Carousel styling
    categoryCarouselColor: 'primary',
    categoryCarouselFont: 'primary',
    categoryCarouselFontSize: 0.875,
    allCategoriesTaglineColor: 'secondary',
    allCategoriesTaglineFont: 'primary',
    allCategoriesTaglineFontSize: 1,
    // Product Card styling
    productCardType: 'minimal',
    productCardAspectRatio: '3:4',
    productCardColumnsPhone: 2,
    productCardColumnsTablet: 3,
    productCardColumnsLaptop: 4,
    productCardColumnsDesktop: 5,
    productCardGap: 1,
    productCardBorderRadius: 'medium',
    productCardNameColor: 'primary',
    productCardNameFont: 'primary',
    productCardNameFontSize: 0.65,
    productCardPriceColor: 'primary',
    productCardPriceFont: 'primary',
    productCardPriceFontSize: 1,
    productCardVatText: 'Includes VAT',
    productCardVatColor: 'secondary',
    productCardVatFont: 'primary',
    productCardVatFontSize: 0.75,
    footerText: '',
    footerTextColor: 'tertiary',
    footerTextFont: 'primary',
    footerTextFontSize: 0.875,
    // Color palette (hex values)
    colorPrimary: '#ec4899', // Default pink
    colorSecondary: '#64748b', // Default slate-600
    colorTertiary: '#94a3b8', // Default slate-400
    // Global Font palette
    fontPrimary: 'inherit',
    fontSecondary: 'inherit',
    fontTertiary: 'inherit',
  };
}

