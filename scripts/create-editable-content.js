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
    // Company branding
    companyName: '',
    companyTagline: 'Effortless softness for every day and night in.',
    companyTaglineColor: 'primary',
    companyTaglineFont: 'primary',
    companyTaglineFontSize: 0.75,
    logoPath: null, // Optional: null means use static mapping

    // Hero Section
    heroMainHeading: 'Curated collections for every mood and moment.',
    heroMainHeadingColor: 'primary',
    heroMainHeadingFont: 'primary',
    heroMainHeadingFontSize: 4,
    heroDescription:
      'From delicate lace to active-ready comfort. Discover the pieces that make you feel confident, effortless, and beautifully yourself.',
    heroDescriptionColor: 'secondary',
    heroDescriptionFont: 'primary',
    heroDescriptionFontSize: 1,
    heroBannerImage: '',
    heroBannerTextWidth: 75,

    // Category Carousel styling
    categoryCarouselColor: 'primary',
    categoryCarouselFont: 'primary',
    categoryCarouselFontSize: 0.875,

    // All Categories Tagline
    allCategoriesTagline: "Choose a category to explore this week's top four bestsellers, refreshed daily.",
    allCategoriesTaglineColor: 'secondary',
    allCategoriesTaglineFont: 'primary',
    allCategoriesTaglineFontSize: 1,

    // Product Card styling
    productCardType: 'minimal',
    productCardAspectRatio: '3:4',
    productCardColumnsPhone: 2,
    productCardColumnsTablet: 3,
    productCardColumnsLaptop: 4,
    productCardColumnsDesktop: 5,
    productCardGap: 1,
    productCardBorderRadius: 'medium',
    productCardNameColor: 'primary',
    productCardNameFont: 'primary',
    productCardNameFontSize: 0.65,
    productCardPriceColor: 'primary',
    productCardPriceFont: 'primary',
    productCardPriceFontSize: 1,
    productCardVatText: 'Includes VAT',
    productCardVatColor: 'secondary',
    productCardVatFont: 'primary',
    productCardVatFontSize: 0.75,

    // Footer
    footerText: '© 2024 Lingerie Boutique. All rights reserved.',
    footerTextColor: 'tertiary',
    footerTextFont: 'primary',
    footerTextFontSize: 0.875,

    // Color palette (hex values)
    colorPrimary: '#ec4899',
    colorSecondary: '#64748b',
    colorTertiary: '#94a3b8',

    // Global Font palette
    fontPrimary: 'inherit',
    fontSecondary: 'inherit',
    fontTertiary: 'inherit',
  },
  FIVESTARFINDS: {
    // Company branding
    companyName: '',
    companyTagline: 'Top Rated. Always.',
    companyTaglineColor: 'primary',
    companyTaglineFont: 'primary',
    companyTaglineFontSize: 0.75,
    logoPath: null, // Optional: null means use static mapping

    // Hero Section
    heroMainHeading: 'Shop the Internet\'s Top Rated & Trending Products',
    heroMainHeadingColor: 'primary',
    heroMainHeadingFont: 'primary',
    heroMainHeadingFontSize: 4,
    heroDescription:
      'Discover viral best sellers, five-star favorites, and the hottest items people love — all curated in one place.',
    heroDescriptionColor: 'secondary',
    heroDescriptionFont: 'primary',
    heroDescriptionFontSize: 1,
    heroBannerImage: '',
    heroBannerTextWidth: 75,

    // Category Carousel styling
    categoryCarouselColor: 'primary',
    categoryCarouselFont: 'primary',
    categoryCarouselFontSize: 0.875,

    // All Categories Tagline
    allCategoriesTagline: 'Explore top-rated products, trending finds, and viral best sellers — updated daily with the hottest items.',
    allCategoriesTaglineColor: 'secondary',
    allCategoriesTaglineFont: 'primary',
    allCategoriesTaglineFontSize: 1,

    // Product Card styling
    productCardType: 'minimal',
    productCardAspectRatio: '3:4',
    productCardColumnsPhone: 2,
    productCardColumnsTablet: 3,
    productCardColumnsLaptop: 4,
    productCardColumnsDesktop: 5,
    productCardGap: 1,
    productCardBorderRadius: 'medium',
    productCardNameColor: 'primary',
    productCardNameFont: 'primary',
    productCardNameFontSize: 0.65,
    productCardPriceColor: 'primary',
    productCardPriceFont: 'primary',
    productCardPriceFontSize: 1,
    productCardVatText: 'Includes VAT',
    productCardVatColor: 'secondary',
    productCardVatFont: 'primary',
    productCardVatFontSize: 0.75,

    // Footer
    footerText: '© 2024 Five-Star Finds. All rights reserved.',
    footerTextColor: 'tertiary',
    footerTextFont: 'primary',
    footerTextFontSize: 0.875,

    // Color palette (hex values)
    colorPrimary: '#ec4899',
    colorSecondary: '#64748b',
    colorTertiary: '#94a3b8',

    // Global Font palette
    fontPrimary: 'inherit',
    fontSecondary: 'inherit',
    fontTertiary: 'inherit',
  },
};

// Only LUNERA and FIVESTARFINDS are supported

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    storefront: null,
    projectId: process.env.FIREBASE_PROJECT_ID || DEFAULT_PROJECT_ID,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--storefront' && args[i + 1]) {
      options.storefront = args[i + 1];
      i += 1;
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

async function ensureInfoDoc(db, storefront) {
  const docRef = db.collection(storefront).doc('Info');
  const snapshot = await docRef.get();

  // Delete existing document if it exists
  if (snapshot.exists) {
    console.log(`🗑️  Deleting existing "${storefront}/Info" document...`);
    await docRef.delete();
    console.log(`   ✅ Deleted`);
  }

  // Get storefront-specific content
  const content = STOREFRONT_CONTENT[storefront];
  if (!content) {
    throw new Error(`No content template found for storefront: ${storefront}`);
  }

  console.log(`📝 Creating new "${storefront}/Info" document with all default values...`);

  // Create payload with all default properties
  const payload = {
    ...content,
    storefront,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Create document (without merge to ensure clean slate)
  await docRef.set(payload);
  console.log(`✅  Created "${storefront}/Info" document with all default properties`);
  console.log(`   Tagline: ${content.companyTagline}`);
  console.log(`   Properties set: ${Object.keys(content).length} total`);
}

async function main() {
  const { storefront, projectId } = parseArgs();

  // Validate storefront - only allow LUNERA or FIVESTARFINDS
  const allowedStorefronts = ['LUNERA', 'FIVESTARFINDS'];
  if (!storefront) {
    console.error('❌  Storefront name is required. Provide via --storefront <NAME>.');
    console.error(`   Allowed values: ${allowedStorefronts.join(', ')}`);
    process.exit(1);
  }

  if (!allowedStorefronts.includes(storefront)) {
    console.error(`❌  Invalid storefront: "${storefront}"`);
    console.error(`   Allowed values: ${allowedStorefronts.join(', ')}`);
    process.exit(1);
  }

  console.log('\n🔍 Configuration:');
  console.log(`  Project ID: ${projectId}`);
  console.log(`  Storefront: ${storefront}`);
  console.log(`  Using ADC: ${!(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)}`);
  
  const app = initializeAdmin(projectId);
  console.log(`  Firebase App Project ID: ${app.options.projectId || 'NOT SET'}`);
  
  // Use default database
  let db;
  const databaseId = process.env.FIRESTORE_DATABASE_ID;
  console.log(`  Database ID: ${databaseId || '(default)'}`);
  console.log(`  Target: ${storefront}/Info`);
  
  try {
    if (databaseId) {
      // For named databases
      db = admin.firestore(app, databaseId);
    } else {
      // Use default database
      db = admin.firestore(app);
    }
    
    console.log('\n🔍 Testing Firestore connection...');
    // Just test connection by accessing the storefront collection
    const storefrontRef = db.collection(storefront);
    await storefrontRef.limit(1).get();
    console.log(`  ✅ Connected to Firestore`);
    
    await ensureInfoDoc(db, storefront);
    console.log('\n✅  Script completed successfully!');
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

