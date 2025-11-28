import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getCollectionPath, getDocumentPath } from './store-collections';

const DEFAULT_STOREFRONT = 'LUNERA';

// Initialize Firebase Admin (only on server)
let db = null;

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
      // - No explicit credentials needed (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY)
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      
      if (!projectId) {
        throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID environment variable is required');
      }
      
      console.log(`[Firebase Admin] Initializing with ADC (projectId: ${projectId}, NODE_ENV: ${process.env.NODE_ENV})`);
      
      initializeApp({
        projectId,
      });
      
      // Verify initialization succeeded
      const app = getApps()[0];
      if (!app) {
        throw new Error('Firebase Admin app initialization returned null');
      }
      
      console.log(`[Firebase Admin] ✅ App initialized successfully`);
      
      // Use default database
      const databaseId = process.env.FIRESTORE_DATABASE_ID;
      db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
      
      console.log(`[Firebase Admin] ✅ Firestore instance created (database: ${databaseId || 'default'})`);
      return db;
    } catch (error) {
      // Always log errors (both development and production) to diagnose connection issues
      console.error('❌ Firebase Admin SDK initialization failed:', error.message);
      console.error('Error details:', {
        name: error.name,
        code: error.code,
        stack: error.stack,
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Missing',
        nodeEnv: process.env.NODE_ENV,
      });
      
      if (process.env.NODE_ENV === 'development') {
        console.warn('For local development, run: gcloud auth application-default login');
        console.warn('Make sure NEXT_PUBLIC_FIREBASE_PROJECT_ID is set in your environment');
      } else {
        console.error('Production error: Firebase Admin SDK cannot initialize.');
        console.error('Check that Application Default Credentials are available in Firebase App Hosting.');
        console.error('Verify NEXT_PUBLIC_FIREBASE_PROJECT_ID is set in Firebase App Hosting secrets.');
      }
      
      // Return null so calling functions can handle gracefully
      return null;
    }
  }

  // App already initialized, get existing instance
  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  const app = getApps()[0];
  if (!app) {
    console.error('[Firebase Admin] ⚠️  App was marked as initialized but getApps()[0] returned null');
    return null;
  }
  db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
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
export async function getServerSideCategories(storefront = DEFAULT_STOREFRONT, market = 'FI', products = null) {
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
  
  return true;
}

// Fetch all active products (server-side)
export async function getServerSideProducts(storefront = DEFAULT_STOREFRONT, market = 'FI') {
  console.log(`[SSR] 📥 Fetching products for storefront: ${storefront}, market: ${market}`);
  const startTime = Date.now();
  
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      console.warn(`[SSR] ⚠️  No admin DB available for products`);
      return [];
    }

    const productsPath = getCollectionPath('products', storefront);
    const productsRef = getAdminReference(adminDb, productsPath);
    console.log(`[SSR] 🔍 Querying Firestore: ${productsPath.join('/')}`);
    
    const snapshot = await productsRef.get();
    console.log(`[SSR] ✅ Received ${snapshot.docs.length} product documents from Firestore`);

    const products = snapshot.docs
      .map(transformProduct)
      .filter((prod) => filterProductByStorefrontAndMarket(prod, storefront, market))
      .sort((a, b) => {
        const aCreated = typeof a.createdAt === 'number' ? a.createdAt : 0;
        const bCreated = typeof b.createdAt === 'number' ? b.createdAt : 0;
        if (aCreated && bCreated) {
          return bCreated - aCreated;
        }
        return (a.name || '').localeCompare(b.name || '');
      });

    const duration = Date.now() - startTime;
    console.log(`[SSR] ✅ Products fetched: ${products.length} active products (filtered by storefront: ${storefront}, market: ${market}) (${duration}ms)`);
    return products;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[SSR] ❌ Failed to fetch products server-side (${duration}ms):`, error);
    return [];
  }
}

// Fetch products by category ID (server-side)
export async function getServerSideProductsByCategory(categoryId, storefront = DEFAULT_STOREFRONT, market = 'FI') {
  console.log(`[SSR] 📥 Fetching products for category: ${categoryId}, storefront: ${storefront}, market: ${market}`);
  const startTime = Date.now();
  
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      console.warn(`[SSR] ⚠️  No admin DB available for category products`);
      return [];
    }

    // Query products filtered by categoryId using array-contains
    // This is more efficient than fetching all products and filtering client-side
    const productsPath = getCollectionPath('products', storefront);
    const productsRef = getAdminReference(adminDb, productsPath);
    
    // Try to query with array-contains filter (more efficient)
    // If this fails due to missing index, fall back to fetching all and filtering
    let snapshot;
    try {
      console.log(`[SSR] 🔍 Querying Firestore with category filter: ${productsPath.join('/')} (categoryId: ${categoryId})`);
      snapshot = await productsRef.where('categoryIds', 'array-contains', categoryId).get();
      console.log(`[SSR] ✅ Received ${snapshot.docs.length} product documents from Firestore (filtered by category)`);
    } catch (error) {
      // Fallback: fetch all products if array-contains query fails (missing index)
      console.warn(`[SSR] ⚠️  Category filter query failed (may need index), falling back to fetch all: ${error.message}`);
      console.log(`[SSR] 🔍 Querying Firestore: ${productsPath.join('/')}`);
      snapshot = await productsRef.get();
      console.log(`[SSR] ✅ Received ${snapshot.docs.length} product documents from Firestore`);
    }

    const products = snapshot.docs
      .map(transformProduct)
      .filter((prod) => {
        // Filter by categoryId
        if (!prod.categoryIds?.includes(categoryId)) return false;
        // Filter by storefront, market, and availability
        return filterProductByStorefrontAndMarket(prod, storefront, market);
      })
      .sort((a, b) => {
        const aCreated = typeof a.createdAt === 'number' ? a.createdAt : 0;
        const bCreated = typeof b.createdAt === 'number' ? b.createdAt : 0;
        if (aCreated && bCreated) {
          return bCreated - aCreated;
        }
        return (a.name || '').localeCompare(b.name || '');
      });

    const duration = Date.now() - startTime;
    console.log(`[SSR] ✅ Category products fetched: ${products.length} products for category "${categoryId}" (filtered by storefront: ${storefront}, market: ${market}) (${duration}ms)`);
    return products;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[SSR] ❌ Failed to fetch products by category server-side (${duration}ms):`, error);
    return [];
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
    price: data.basePrice || 0,
    shopifyVariantId: data.shopifyVariantId || null,
    shopifyInventoryItemId: data.shopifyInventoryItemId || null,
    attributes: data.attributes || {},
    shopifyVariantId: data.shopifyVariantId || null, // Include Shopify variant ID for checkout
    shopifyInventoryItemId: data.shopifyInventoryItemId || null, // Include inventory item ID
    attributes: data.attributes || {}, // Include flexible attributes
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
export async function getServerSideInfo(language = 'en', storefront = DEFAULT_STOREFRONT) {
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
      console.warn(`[SSR] ⚠️  ${storefront}/Info document does not exist, returning defaults`);
      return getDefaultInfo();
    }

    const englishData = infoDoc.data();
    const duration = Date.now() - startTime;
    console.log(`[SSR] ✅ Site info fetched successfully (${duration}ms)`);
    return formatInfoData(englishData);
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[SSR] ❌ Failed to fetch site info server-side (${duration}ms):`, error);
    return getDefaultInfo();
  }
}

function formatInfoData(data) {
  // Map both old field names (from EditSiteInfoButton) and new field names
  return {
    companyName: data.companyName || data.name || '',
    companyTagline: data.companyTagline || data.slogan || '',
    heroMainHeading: data.heroMainHeading || '',
    heroDescription: data.heroDescription || data.heroDescr || '',
    categorySectionHeading: data.categorySectionHeading || '',
    categorySectionDescription: data.categorySectionDescription || data.categoryDesc || '',
    footerText: data.footerText || '',
  };
}

function getDefaultInfo() {
  return {
    companyName: '',
    companyTagline: '',
    heroMainHeading: '', // Empty string instead of error message
    heroDescription: '',
    categorySectionHeading: '',
    categorySectionDescription: '',
    footerText: '',
  };
}

