export const STORE_ROOT_COLLECTION = 'LUNERA';
export const STORE_ITEMS_SUBCOLLECTION = 'items';

const STORE_SEGMENTS = {
  categories: 'categories',
  products: 'products',
  promotions: 'promotions',
  suppliers: 'suppliers',
  userEvents: 'userEvents',
};

export const getStoreSegment = (name) => STORE_SEGMENTS[name] || name;

export const getStoreCollectionPath = (name, ...additionalSegments) => [
  STORE_ROOT_COLLECTION,
  getStoreSegment(name),
  STORE_ITEMS_SUBCOLLECTION,
  ...additionalSegments,
];

export const getStoreDocPath = (name, docId, ...additionalSegments) => [
  ...getStoreCollectionPath(name),
  docId,
  ...additionalSegments,
];

export const getAdminStoreCollection = (db, name) =>
  db.collection(STORE_ROOT_COLLECTION).doc(getStoreSegment(name)).collection(STORE_ITEMS_SUBCOLLECTION);

export const getAdminStoreDoc = (db, name, docId) =>
  getAdminStoreCollection(db, name).doc(docId);

