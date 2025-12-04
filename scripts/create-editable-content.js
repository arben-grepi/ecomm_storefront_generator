/**
 * Seeds or updates the storefront Info document used for editable content.
 *
 * Usage:
 *   export FIREBASE_PROJECT_ID=...
 *   export FIREBASE_CLIENT_EMAIL=...
 *   export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
 *   node scripts/create-editable-content.js --storefront LUNERA
 *   node scripts/create-editable-content.js --storefront FIVESTARFINDS
 *
 * If FIREBASE_* env vars are not supplied, the script falls back to Application
 * Default Credentials (e.g., gcloud auth application-default login).
 */

const admin = require('firebase-admin');

const DEFAULT_PROJECT_ID = 'ecom-store-generator-41064';
const DEFAULT_STOREFRONT = 'LUNERA';

// Storefront-specific default content
const STOREFRONT_CONTENT = {
  LUNERA: {
    companyTagline: 'Effortless softness for every day and night in.',
    heroMainHeading: 'Curated collections for every mood and moment.',
    heroDescr: '',
    heroDescription:
      'From delicate lace to active-ready comfort. Discover the pieces that make you feel confident, effortless, and beautifully yourself.',
    categorySectionHeading: 'Shop by category',
    categorySectionDescription: "Choose a category to explore this week's top four bestsellers, refreshed daily.",
    footerText: '© 2024 Lingerie Boutique. All rights reserved.',
  },
  FIVESTARFINDS: {
    companyTagline: 'Top Rated. Always.',
    heroMainHeading: 'Shop the Internet\'s Top Rated & Trending Products',
    heroDescr: '',
    heroDescription:
      'Discover viral best sellers, five-star favorites, and the hottest items people love — all curated in one place.',
    categorySectionHeading: 'Shop by category',
    categorySectionDescription: 'Explore top-rated products, trending finds, and viral best sellers — updated daily with the hottest items.',
    footerText: '© 2024 Five-Star Finds. All rights reserved.',
  },
};

// Fallback default content (used if storefront not found in STOREFRONT_CONTENT)
const DEFAULT_CONTENT = STOREFRONT_CONTENT.LUNERA;

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
    // Always explicitly set projectId when using ADC
    admin.initializeApp({
      projectId: projectId || DEFAULT_PROJECT_ID,
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

  // Get storefront-specific content or fallback to default
  const content = STOREFRONT_CONTENT[storefront] || DEFAULT_CONTENT;
  console.log(`📝 Using content template for storefront: ${storefront}`);

  const payload = {
    ...content,
    storefront,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (!snapshot.exists) {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
  }

  await docRef.set(payload, { merge: true });
  console.log(`✅  Stored editable content for storefront "${storefront}" at ${storefront}/Info`);
  console.log(`   Tagline: ${content.companyTagline}`);
}

async function main() {
  const { storefront, force, projectId } = parseArgs();

  if (!storefront) {
    console.error('❌  Storefront name is required. Provide via --storefront <NAME>.');
    process.exit(1);
  }

  console.log('\n🔍 Debug Information:');
  console.log(`  Project ID: ${projectId}`);
  console.log(`  Storefront: ${storefront}`);
  console.log(`  Using ADC: ${!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)}`);
  
  const app = initializeAdmin(projectId);
  console.log(`  Firebase App Name: ${app.name}`);
  console.log(`  Firebase App Project ID: ${app.options.projectId || 'NOT SET'}`);
  
  // Use default database
  // For named databases in Firebase Admin SDK, use: admin.firestore(app, 'database-id')
  let db;
  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  console.log(`  Database ID: ${databaseId || '(default)'}`);
  console.log(`  Collection Path: ${storefront}/Info`);
  
  try {
    if (databaseId) {
      // For named databases
      db = admin.firestore(app, databaseId);
    } else {
      // Use default database
      db = admin.firestore(app);
    }
    
    // Test connection by listing collections
    console.log('\n🔍 Testing Firestore connection...');
    console.log(`  Attempting to list collections in "${databaseId || '(default)'}" database...`);
    const collections = await db.listCollections();
    console.log(`  ✅ Connected! Found ${collections.length} root collection(s):`);
    collections.forEach(coll => console.log(`    - ${coll.id}`));
    
    // Check if LUNERA collection exists
    const storefrontRef = db.collection(storefront);
    const storefrontSnapshot = await storefrontRef.limit(1).get();
    console.log(`  Collection "${storefront}" exists: ${storefrontSnapshot.size > 0 ? 'Yes' : 'No (will be created)'}`);
    
    await ensureInfoDoc(db, storefront, force);
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error Details:');
    console.error(`  Code: ${error.code}`);
    console.error(`  Message: ${error.message}`);
    console.error(`  Details: ${error.details || 'N/A'}`);
    if (error.errorInfoMetadata) {
      console.error(`  Consumer: ${error.errorInfoMetadata.consumer || 'N/A'}`);
      console.error(`  Container: ${error.errorInfoMetadata.containerInfo || 'N/A'}`);
      console.error(`  Service: ${error.errorInfoMetadata.service || 'N/A'}`);
    }
    console.error(`  Full error stack:`, error.stack);
    process.exit(1);
  }
}

main();

