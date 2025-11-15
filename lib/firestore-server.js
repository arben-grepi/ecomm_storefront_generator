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

function getAdminDb() {
  if (db) return db;

  // Check if already initialized
  if (getApps().length === 0) {
    try {
      // On Firebase Hosting/Cloud Functions, Application Default Credentials are automatically available
      // For local development and CI/CD builds, we need explicit setup
      
      const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
      if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
        throw new Error('Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.');
      }

      initializeApp({
        credential: cert({
          projectId: FIREBASE_PROJECT_ID,
          clientEmail: FIREBASE_CLIENT_EMAIL,
          private_key: FIREBASE_PRIVATE_KEY,
        }),
      });
      
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

function getAdminReference(adminDb, pathSegments) {
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
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return [];
    }

    const categoriesRef = getAdminReference(
      adminDb,
      getCollectionPath('categories', storefront)
    );
    const snapshot = await categoriesRef.get();

    const categories = snapshot.docs
      .map(transformCategory)
      .filter((cat) => cat.active)
      .sort((a, b) => (a.label || '').localeCompare(b.label || ''));

    return categories;
  } catch (error) {
    console.error('Failed to fetch categories server-side:', error);
    return [];
  }
}

// Fetch all active products (server-side)
export async function getServerSideProducts(storefront = DEFAULT_STOREFRONT) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return [];
    }

    const productsRef = getAdminReference(
      adminDb,
      getCollectionPath('products', storefront)
    );
    const snapshot = await productsRef.get();

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
    return [];
  }
}

// Fetch products by category ID (server-side)
export async function getServerSideProductsByCategory(categoryId, storefront = DEFAULT_STOREFRONT) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      return [];
    }

    // Query products from storefront folder, filter categoryIds client-side
    const productsRef = getAdminReference(
      adminDb,
      getCollectionPath('products', storefront)
    );
    const snapshot = await productsRef.get();

    const products = snapshot.docs
      .map(transformProduct)
      .filter((prod) => {
        // Filter by categoryId and active status client-side
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

    return products;
  } catch (error) {
    console.error('Failed to fetch products by category server-side:', error);
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
    images: Array.isArray(data.images) ? data.images.filter(Boolean) : [],
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

// Fetch site info/content from LUNERA/info (server-side)
export async function getServerSideInfo() {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) {
      console.error('⚠️  Failed to fetch site info: Firebase Admin not initialized');
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

    const infoDoc = await adminDb.collection('LUNERA').doc('Info').get();
    
    if (!infoDoc.exists) {
      console.error('⚠️  Failed to fetch site info: LUNERA/Info document does not exist');
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

    const data = infoDoc.data();
    
    return {
      companyName: data.companyName || '',
      companyTagline: data.companyTagline || '',
      heroMainHeading: data.heroMainHeading || '',
      heroDescription: data.heroDescription || '',
      categorySectionHeading: data.categorySectionHeading || '',
      categorySectionDescription: data.categorySectionDescription || '',
      footerText: data.footerText || '',
    };
  } catch (error) {
    console.error('⚠️  Failed to fetch site info server-side:', error);
    // Return empty strings on error, except hero banner with error message
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
}

