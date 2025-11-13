// Default website (fallback)
export const DEFAULT_STORE_ROOT_COLLECTION = 'LUNERA';
export const STORE_ITEMS_SUBCOLLECTION = 'items';

const STORE_SEGMENTS = {
  categories: 'categories',
  products: 'products',
  promotions: 'promotions',
  suppliers: 'suppliers',
  userEvents: 'userEvents',
};

export const getStoreSegment = (name) => STORE_SEGMENTS[name] || name;

// Client-side: Use website from context
// Server-side: Use default or passed website parameter
export const getStoreCollectionPath = (name, website = null, ...additionalSegments) => {
  const rootCollection = website || DEFAULT_STORE_ROOT_COLLECTION;
  return [
    rootCollection,
    getStoreSegment(name),
    STORE_ITEMS_SUBCOLLECTION,
    ...additionalSegments,
  ];
};

export const getStoreDocPath = (name, docId, website = null, ...additionalSegments) => [
  ...getStoreCollectionPath(name, website),
  docId,
  ...additionalSegments,
];

// Server-side admin functions (use default or passed website)
export const getAdminStoreCollection = (db, name, website = null) => {
  const rootCollection = website || DEFAULT_STORE_ROOT_COLLECTION;
  return db.collection(rootCollection).doc(getStoreSegment(name)).collection(STORE_ITEMS_SUBCOLLECTION);
};

export const getAdminStoreDoc = (db, name, docId, website = null) =>
  getAdminStoreCollection(db, name, website).doc(docId);

