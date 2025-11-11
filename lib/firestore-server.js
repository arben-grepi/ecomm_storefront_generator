import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

function getAdminDb() {
  if (db) return db;

  // Check if already initialized
  if (getApps().length === 0) {
    try {
      // On Firebase Hosting/Cloud Functions, Application Default Credentials are automatically available
      // For local development and CI/CD builds, we need explicit setup
      
      // Option 1: Try explicit credentials from environment variables (for local dev or CI/CD)
      if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        initializeApp({
          credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
          }),
        });
      } 
      // Option 2: Use Application Default Credentials
      // This works automatically on Firebase Hosting/Cloud Functions
      // For local dev: run `gcloud auth application-default login`
      // For CI/CD: credentials are provided by Firebase deployment action
      else {
        initializeApp({
          projectId: 'ecommerce-2f366',
        });
      }
      
      db = getFirestore();
      return db;
    } catch (error) {
      // If initialization fails (e.g., no credentials), return null
      // The calling functions will handle this gracefully
      if (process.env.NODE_ENV === 'development') {
        console.warn('Firebase Admin SDK initialization failed (no credentials found):', error.message);
      }
      return null;
    }
  }

  db = getFirestore();
  return db;
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

  return {
    id: doc.id,
    name: data.name || '',
    slug: data.slug || doc.id,
    price: data.basePrice || 0,
    image: data.images && data.images.length > 0 ? data.images[0] : null,
    category: data.categoryId || '',
    categoryId: data.categoryId || '',
    description: data.description || '',
    active: data.active !== false,
    metrics,
    createdAt: serializeTimestamp(data.createdAt),
  };
}

// Fetch active categories (server-side)
export async function getServerSideCategories() {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      // Credentials not available, return empty array (will fallback to client-side)
      return [];
    }
    
    const snapshot = await adminDb
      .collection('categories')
      .orderBy('name', 'asc')
      .get();

    const categories = snapshot.docs
      .map(transformCategory)
      .filter((cat) => cat.active);

    return categories;
  } catch (error) {
    console.error('Failed to fetch categories server-side:', error);
    // Return empty array on error to prevent page crash
    return [];
  }
}

// Fetch all active products (server-side)
export async function getServerSideProducts() {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return [];
    }
    const snapshot = await adminDb.collection('products').get();

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

    return products;
  } catch (error) {
    console.error('Failed to fetch products server-side:', error);
    // Return empty array on error to prevent page crash
    return [];
  }
}

// Fetch products by category ID (server-side)
export async function getServerSideProductsByCategory(categoryId) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return [];
    }
    const snapshot = await adminDb
      .collection('products')
      .where('categoryId', '==', categoryId)
      .get();

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

    return products;
  } catch (error) {
    console.error('Failed to fetch products by category server-side:', error);
    // Return empty array on error to prevent page crash
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
    categoryId: data.categoryId || '',
    supplierId: data.supplierId || null,
    basePrice: data.basePrice || 0,
    description: data.description || '',
    careInstructions: data.careInstructions || '',
    images: Array.isArray(data.images) ? data.images.filter(Boolean) : [],
    active: data.active !== false,
    metrics,
    stock: typeof data.stock === 'number' ? data.stock : null,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}

function transformVariant(doc) {
  const data = doc.data();
  const rawMetrics = data.metrics || {};
  const metrics = Object.entries(rawMetrics).reduce((acc, [key, value]) => {
    acc[key] = serializeTimestamp(value) ?? value;
    return acc;
  }, {});

  // Support both `images` (array) and `image` (string) for backward compatibility
  let images = [];
  if (Array.isArray(data.images) && data.images.length > 0) {
    images = data.images.filter(Boolean);
  } else if (data.image) {
    // Backward compatibility: convert single image to array
    images = [data.image];
  }

  return {
    id: doc.id,
    size: data.size || null,
    color: data.color || null,
    sku: data.sku || null,
    stock: typeof data.stock === 'number' ? data.stock : 0,
    priceOverride: typeof data.priceOverride === 'number' ? data.priceOverride : null,
    images: images.length > 0 ? images : [],
    metrics,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
  };
}

export async function getServerSideCategoryBySlug(slug) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return null;
    }

    const snapshot = await adminDb
      .collection('categories')
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

export async function getServerSideProductDetail(categorySlug, productSlug) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return null;
    }

    const category = await getServerSideCategoryBySlug(categorySlug);
    if (!category) {
      return null;
    }

    const productSnapshot = await adminDb
      .collection('products')
      .where('slug', '==', productSlug)
      .limit(1)
      .get();

    if (productSnapshot.empty) {
      return null;
    }

    const productDoc = productSnapshot.docs[0];
    const productData = transformProductDetail(productDoc);

    if (productData.categoryId !== category.id || productData.active === false) {
      return null;
    }

    const variantsSnapshot = await adminDb
      .collection('products')
      .doc(productDoc.id)
      .collection('variants')
      .get();

    const variants = variantsSnapshot.docs
      .map(transformVariant)
      .filter((variant) => variant != null)
      .sort((a, b) => {
        const keyA = `${a.size ?? ''}-${a.color ?? ''}`.toLowerCase();
        const keyB = `${b.size ?? ''}-${b.color ?? ''}`.toLowerCase();
        return keyA.localeCompare(keyB);
      });

    return {
      category,
      product: productData,
      variants,
    };
  } catch (error) {
    console.error(
      `Failed to fetch product detail for category "${categorySlug}" and product "${productSlug}":`,
      error
    );
    return null;
  }
}

