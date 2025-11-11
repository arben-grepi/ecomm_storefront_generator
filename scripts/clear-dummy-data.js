#!/usr/bin/env node

/**
 * Clear the dummy data seeded by scripts/seed-dummy-data.js.
 *
 * Usage:
 *   # Using env vars (same as seeder)
 *   export FIREBASE_PROJECT_ID=ecommerce-2f366
 *   export FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@ecommerce-2f366.iam.gserviceaccount.com
 *   export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
 *   npm run seed:clear
 *
 *   # Or rely on gcloud ADC (requires gcloud auth application-default login)
 *   npm run seed:clear
 */

const admin = require('firebase-admin');

const DEFAULT_PROJECT_ID = 'ecommerce-2f366';

function initializeAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  if (
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  ) {
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
    });
  } else {
    admin.initializeApp({
      projectId: DEFAULT_PROJECT_ID,
    });
  }

  return admin.app();
}

const db = initializeAdmin().firestore();

const seededCategoryIds = [
  'Lingerie',
  'Underwear',
  'Activewear',
  'Dresses',
  'Accessories',
];

const seededProductSlugs = [
  'blush-lace-bralette-set',
  'everyday-modal-brief',
  'soft-jersey-bralette',
  'mesh-panel-leggings',
  'satin-slip-dress',
  'pleated-wrap-dress',
  'gemstone-drop-earrings',
  'layered-gold-necklace',
  'cashmere-lounge-set',
  'silk-eye-mask',
  'organic-cotton-robe',
  'seamless-high-rise-brief',
  'travel-jewelry-case',
  // New products
  'lace-teddy-bodysuit',
  'sports-bra-high-support',
  'midi-floral-dress',
  'cotton-boy-short',
  'delicate-gold-bracelet',
  'silk-cami-top',
  'yoga-shorts',
];

const seededPromotionCodes = ['WELCOME15', 'SPRINGSET25'];

async function deleteDocumentAndSubcollection(docRef, subcollectionName) {
  const subcollectionRef = docRef.collection(subcollectionName);
  const subDocs = await subcollectionRef.listDocuments();
  if (subDocs.length > 0) {
    console.log(
      `  • Deleting ${subDocs.length} docs from subcollection ${docRef.path}/${subcollectionName}`
    );
  }
  for (const subDoc of subDocs) {
    await subDoc.delete();
  }
  await docRef.delete();
  console.log(`  • Deleted ${docRef.path}`);
}

async function clearCategories() {
  console.log('Removing seeded categories…');
  for (const id of seededCategoryIds) {
    const docRef = db.collection('categories').doc(id);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      await docRef.delete();
      console.log(`  • Deleted categories/${id}`);
    }
  }
}

async function clearProducts() {
  console.log('Removing seeded products and variant subcollections…');
  for (const slug of seededProductSlugs) {
    const productRef = db.collection('products').doc(slug);
    const productSnap = await productRef.get();
    if (!productSnap.exists) continue;

    await deleteDocumentAndSubcollection(productRef, 'variants');
  }
}

async function clearPromotions() {
  console.log('Removing seeded promotions…');
  for (const code of seededPromotionCodes) {
    const promoRef = db.collection('promotions').doc(code);
    const promoSnap = await promoRef.get();
    if (promoSnap.exists) {
      await promoRef.delete();
      console.log(`  • Deleted promotions/${code}`);
    }
  }
}

async function main() {
  try {
    await clearProducts();
    await clearCategories();
    await clearPromotions();

    console.log('✅ Dummy data cleared.');
  } catch (error) {
    console.error('❌ Failed to clear dummy data:', error);
    process.exitCode = 1;
  } finally {
    await admin.app().delete().catch(() => {});
  }
}

main();

