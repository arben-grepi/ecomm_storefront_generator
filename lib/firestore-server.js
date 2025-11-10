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
    const snapshot = await adminDb.collection('products').get();

    const products = snapshot.docs
      .map(transformProduct)
      .filter((prod) => prod.active)
      .sort((a, b) => {
        // Sort by createdAt if available, otherwise by name
        // Note: createdAt might be a Timestamp object, handle both cases
        const aCreated = a.createdAt?.toMillis?.() || a.createdAt?.seconds || 0;
        const bCreated = b.createdAt?.toMillis?.() || b.createdAt?.seconds || 0;
        if (aCreated && bCreated) {
          return bCreated - aCreated; // Newest first
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
    const snapshot = await adminDb
      .collection('products')
      .where('categoryId', '==', categoryId)
      .get();

    const products = snapshot.docs
      .map(transformProduct)
      .filter((prod) => prod.active)
      .sort((a, b) => {
        const aCreated = a.createdAt?.toMillis?.() || a.createdAt?.seconds || 0;
        const bCreated = b.createdAt?.toMillis?.() || b.createdAt?.seconds || 0;
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

