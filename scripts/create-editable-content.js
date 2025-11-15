/**
 * Seeds or updates the storefront Info document used for editable content.
 *
 * Usage:
 *   export FIREBASE_PROJECT_ID=...
 *   export FIREBASE_CLIENT_EMAIL=...
 *   export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
 *   node scripts/create-editable-content.js --storefront LUNERA
 *
 * If FIREBASE_* env vars are not supplied, the script falls back to Application
 * Default Credentials (e.g., gcloud auth application-default login).
 */

const admin = require('firebase-admin');

const DEFAULT_PROJECT_ID = 'ecommerce-generator-4c007';
const DEFAULT_STOREFRONT = 'LUNERA';

const DEFAULT_CONTENT = {
  companyName: 'Lingerie Boutique',
  companyTagline: 'Effortless softness for every day and night in.',
  heroMainHeading: 'Curated collections for every mood and moment.',
  heroDescription:
    'From delicate lace to active-ready comfort. Discover the pieces that make you feel confident, effortless, and beautifully yourself.',
  categorySectionHeading: 'Shop by category',
  categorySectionDescription: "Choose a category to explore this week's top four bestsellers, refreshed daily.",
  footerText: '© 2024 Lingerie Boutique. All rights reserved.',
};

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    storefront: DEFAULT_STOREFRONT,
    force: false,
    projectId: process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--storefront' && args[i + 1]) {
      options.storefront = args[i + 1];
      i += 1;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--project' && args[i + 1]) {
      options.projectId = args[i + 1];
      i += 1;
    }
  }

  return options;
}

function initializeAdmin(projectId) {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  } else {
    admin.initializeApp({
      projectId,
    });
  }

  return admin.app();
}

async function ensureInfoDoc(db, storefront, force) {
  const docRef = db.collection(storefront).doc('Info');
  const snapshot = await docRef.get();

  if (snapshot.exists && !force) {
    console.log(
      `ℹ️  Document "${storefront}/Info" already exists. Use --force to overwrite specific fields. Merging default fields instead.`,
    );
  }

  const payload = {
    ...DEFAULT_CONTENT,
    storefront,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (!snapshot.exists) {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
  }

  await docRef.set(payload, { merge: true });
  console.log(`✅  Stored editable content for storefront "${storefront}" at ${storefront}/Info`);
}

async function main() {
  const { storefront, force, projectId } = parseArgs();

  if (!storefront) {
    console.error('❌  Storefront name is required. Provide via --storefront <NAME>.');
    process.exit(1);
  }

  initializeAdmin(projectId);
  const db = admin.firestore();

  try {
    await ensureInfoDoc(db, storefront, force);
    process.exit(0);
  } catch (error) {
    console.error('❌  Failed to create editable content document:', error);
    process.exit(1);
  }
}

main();

