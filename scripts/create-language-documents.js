#!/usr/bin/env node

// Load environment variables from .env.local automatically
require('dotenv').config({ path: '.env.local' });

/**
 * Create English content document in LUNERA/Info
 * Other languages (Finnish, German) are translated on-the-fly using translation API
 *
 * Usage:
 *   node scripts/create-language-documents.js
 */

const admin = require('firebase-admin');

const DEFAULT_PROJECT_ID = 'ecom-store-generator-41064';

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
const FieldValue = admin.firestore.FieldValue;

// Only English content - other languages are translated on-the-fly
const englishContent = {
  categorySectionDescription:
    "Explore different categories of clothing — all designed to bring comfort, style, and confidence.",
  categorySectionHeading: "Shop by category",
  companyName: "Lingerie Boutique",
  companyTagline: "Effortless softness for every day and night in.",
  footerText: "© 2024 Lingerie Boutique. All rights reserved.",
  heroDescription:
    "From delicate lace to active-ready comfort. Discover the pieces that make you feel confident, effortless, and beautifully yourself.",
  heroMainHeading: "Curated collections for every mood and moment.",
  storefront: "LUNERA",
};

async function createInfoDocument() {
  // Structure: LUNERA/Info (single document with English content)
  const infoDocRef = db.collection('LUNERA').doc('Info');

  console.log(`\n📝 Creating/updating English content in LUNERA/Info\n`);

  try {
    const existingDoc = await infoDocRef.get();

    const docData = {
      ...englishContent,
      updatedAtTimestamp: FieldValue.serverTimestamp(),
    };

    if (existingDoc.exists) {
      console.log(`  🔄 Updating existing document...`);
      await infoDocRef.set(docData, { merge: true });
    } else {
      console.log(`  ✅ Creating new document...`);
      await infoDocRef.set({
        ...docData,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    console.log(`     → LUNERA/Info`);
    console.log(`\n✨ English content created/updated successfully!`);
    console.log(`\n💡 Note: Finnish and German translations are done automatically via translation API.`);
    console.log(`   See docs/translation-setup.md for translation API setup.\n`);
  } catch (error) {
    console.error(`  ❌ Failed:`, error.message);
    throw error;
  }
}

createInfoDocument()
  .then(() => {
    console.log("✅ Script completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
