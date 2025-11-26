import { initializeApp, getApps, cert } from 'firebase-admin/app';
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
      // Firebase App Hosting (Cloud Run) provides Application Default Credentials automatically
      // Try ADC first, then fall back to explicit credentials for local development
      
      const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
      
      if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
        // Use explicit credentials (for local development or when ADC is not available)
        initializeApp({
          credential: cert({
            projectId: FIREBASE_PROJECT_ID,
            clientEmail: FIREBASE_CLIENT_EMAIL,
            privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n').trim(),
          }),
        });
      } else {
        // Use Application Default Credentials (automatically available in Firebase App Hosting/Cloud Run)
        // Also works locally if you run: gcloud auth application-default login
        initializeApp({
          projectId: FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        });
      }
      
      // Use default database
      const databaseId = process.env.FIRESTORE_DATABASE_ID;
      const app = getApps()[0];
      db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
      return db;
    } catch (error) {
      // If initialization fails (e.g., no credentials), return null
      // The calling functions will handle this gracefully
      if (process.env.NODE_ENV === 'development') {
        console.warn('Firebase Admin SDK initialization failed (no credentials found):', error.message);
        console.warn('For local development, set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env.local');
        console.warn('Or run: gcloud auth application-default login');
      }
      return null;
    }
  }

  // Use default database
  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  const app = getApps()[0];
  db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
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
    createdAt: serializeTimestamp(data.createdAt),
  };
}

// Fetch active categories (server-side)
export async function getServerSideCategories(storefront = DEFAULT_STOREFRONT) {
  console.log(`[SSR] 📥 Fetching categories for storefront: ${storefront}`);
  const startTime = Date.now();
  
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      console.warn(`[SSR] ⚠️  No admin DB available for categories`);
      return [];
    }

    const categoriesRef = getAdminReference(
      adminDb,
      getCollectionPath('categories', storefront)
    );
    console.log(`[SSR] 🔍 Querying Firestore: ${getCollectionPath('categories', storefront).join('/')}`);
    
    const snapshot = await categoriesRef.get();
    console.log(`[SSR] ✅ Received ${snapshot.docs.length} category documents from Firestore`);

    const categories = snapshot.docs
      .map(transformCategory)
      .filter((cat) => cat.active)
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''));

    const duration = Date.now() - startTime;
    console.log(`[SSR] ✅ Categories fetched: ${categories.length} active categories (${duration}ms)`);
    return categories;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[SSR] ❌ Failed to fetch categories server-side (${duration}ms):`, error);
    return [];
  }
}

// Fetch all active products (server-side)
export async function getServerSideProducts(storefront = DEFAULT_STOREFRONT) {
  console.log(`[SSR] 📥 Fetching products for storefront: ${storefront}`);
  const startTime = Date.now();
  
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      console.warn(`[SSR] ⚠️  No admin DB available for products`);
      return [];
    }

    const productsRef = getAdminReference(
      adminDb,
      getCollectionPath('products', storefront)
    );
    console.log(`[SSR] 🔍 Querying Firestore: ${getCollectionPath('products', storefront).join('/')}`);
    
    const snapshot = await productsRef.get();
    console.log(`[SSR] ✅ Received ${snapshot.docs.length} product documents from Firestore`);

    const products = snapshot.docs
      .map(transformProduct)
      .filter((prod) => prod.active)
      .sort((a, b) => {
        const aCreated = typeof a.createdAt === 'number' ? a.createdAt : 0;
        const bCreated = typeof b.createdAt === 'number' ? b.createdAt : 0;
        if (aCreated && bCreated) {
          return bCreated - aCreated;
        }
        return (a.name || '').localeCompare(b.name || '');
      });

    const duration = Date.now() - startTime;
    console.log(`[SSR] ✅ Products fetched: ${products.length} active products (${duration}ms)`);
    return products;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[SSR] ❌ Failed to fetch products server-side (${duration}ms):`, error);
    return [];
  }
}

// Fetch products by category ID (server-side)
export async function getServerSideProductsByCategory(categoryId, storefront = DEFAULT_STOREFRONT) {
  console.log(`[SSR] 📥 Fetching products for category: ${categoryId}, storefront: ${storefront}`);
  const startTime = Date.now();
  
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      console.warn(`[SSR] ⚠️  No admin DB available for category products`);
      return [];
    }

    // Query products filtered by categoryId using array-contains
    // This is more efficient than fetching all products and filtering client-side
    const productsRef = getAdminReference(
      adminDb,
      getCollectionPath('products', storefront)
    );
    
    // Try to query with array-contains filter (more efficient)
    // If this fails due to missing index, fall back to fetching all and filtering
    let snapshot;
    try {
      console.log(`[SSR] 🔍 Querying Firestore with category filter: ${getCollectionPath('products', storefront).join('/')} (categoryId: ${categoryId})`);
      snapshot = await productsRef.where('categoryIds', 'array-contains', categoryId).get();
      console.log(`[SSR] ✅ Received ${snapshot.docs.length} product documents from Firestore (filtered by category)`);
    } catch (error) {
      // Fallback: fetch all products if array-contains query fails (missing index)
      console.warn(`[SSR] ⚠️  Category filter query failed (may need index), falling back to fetch all: ${error.message}`);
      console.log(`[SSR] 🔍 Querying Firestore: ${getCollectionPath('products', storefront).join('/')}`);
      snapshot = await productsRef.get();
      console.log(`[SSR] ✅ Received ${snapshot.docs.length} product documents from Firestore`);
    }

    const products = snapshot.docs
      .map(transformProduct)
      .filter((prod) => {
        // Filter by categoryId and active status (always filter active, category filter may have been applied in query)
        return prod.active && prod.categoryIds?.includes(categoryId);
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
    console.log(`[SSR] ✅ Category products fetched: ${products.length} products for category "${categoryId}" (${duration}ms)`);
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

// Fetch site info/content from LUNERA/Info (server-side)
// Language functionality removed - always returns English content
export async function getServerSideInfo(language = 'en') {
  console.log(`[SSR] 📥 Fetching site info (language: ${language})`);
  const startTime = Date.now();
  
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      console.warn(`[SSR] ⚠️  Failed to fetch site info: Firebase Admin not initialized`);
      return getDefaultInfo();
    }

    // Fetch English content from LUNERA/Info document
    console.log(`[SSR] 🔍 Querying Firestore: LUNERA/Info`);
    const infoDoc = await adminDb.collection('LUNERA').doc('Info').get();
    
    if (!infoDoc.exists) {
      console.warn(`[SSR] ⚠️  LUNERA/Info document does not exist, returning defaults`);
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
    heroMainHeading: 'Something went wrong. Please refresh the page.',
    heroDescription: '',
    categorySectionHeading: '',
    categorySectionDescription: '',
    footerText: '',
  };
}

