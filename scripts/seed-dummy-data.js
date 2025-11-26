#!/usr/bin/env node

/**
 * Seed Firestore with demo categories, products (with variants), and promotions.
 *
 * Usage:
 *   export FIREBASE_PROJECT_ID=ecom-store-generator-41064
 *   export FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@ecom-store-generator-41064.iam.gserviceaccount.com
 *   export FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
 *   npm run seed:dummy
 *
 * The script is idempotent: re-running it updates existing docs and creates any that are missing.
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
    // Fallback to ADC. Inject the known project ID so Firestore doesn't complain when ADC omits it.
    admin.initializeApp({
      projectId: DEFAULT_PROJECT_ID,
    });
  }

  return admin.app();
}

const db = initializeAdmin().firestore();
const FieldValue = admin.firestore.FieldValue;

const STORE_ROOT = 'LUNERA';
const STORE_ITEMS_COLLECTION = 'items';
const storeCollection = (name) => db.collection(STORE_ROOT).doc(name).collection(STORE_ITEMS_COLLECTION);

const categories = [
  {
    slug: 'lingerie',
    name: 'Lingerie',
    description: 'Romantic lace, effortless silhouettes, and everyday comfort.',
    imageUrl:
      'https://images.pexels.com/photos/7679657/pexels-photo-7679657.jpeg?auto=compress&cs=tinysrgb&w=800',
    previewProductIds: [],
  },
  {
    slug: 'underwear',
    name: 'Underwear',
    description: 'Soft essentials designed for daily wear.',
    imageUrl:
      'https://images.pexels.com/photos/1030895/pexels-photo-1030895.jpeg?auto=compress&cs=tinysrgb&w=800',
    previewProductIds: [],
  },
  {
    slug: 'sports',
    name: 'Activewear',
    description: 'Performance fabrics with studio-to-street styling.',
    imageUrl:
      'https://images.pexels.com/photos/6453399/pexels-photo-6453399.jpeg?auto=compress&cs=tinysrgb&w=800',
    previewProductIds: [],
  },
  {
    slug: 'dresses',
    name: 'Dresses',
    description: 'Elevated silhouettes for events, evenings, and weekends.',
    imageUrl:
      'https://images.unsplash.com/photo-1524502397800-2eeaad7c3fe5?auto=format&fit=crop&w=800&q=80',
    previewProductIds: [],
  },
  {
    slug: 'accessories',
    name: 'Accessories',
    description: 'Finish every look with curated jewelry and accents.',
    imageUrl:
      'https://images.pexels.com/photos/179909/pexels-photo-179909.jpeg?auto=compress&cs=tinysrgb&w=800',
    previewProductIds: [],
  },
];

const productCatalog = [
  {
    slug: 'blush-lace-bralette-set',
    name: 'Blush Lace Bralette Set',
    category: 'Lingerie',
    basePrice: 78,
    description:
      'A romantic lace bralette paired with a high-waist brief. Soft stretch mesh with supportive seams.',
    careInstructions: 'Hand wash cold. Lay flat to dry.',
    images: [
      'https://images.pexels.com/photos/7679657/pexels-photo-7679657.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/7679688/pexels-photo-7679688.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: 'S',
        color: 'Blush',
        stock: 12,
        sku: 'BLB-S-BLUSH',
        images: [
          'https://images.pexels.com/photos/7679657/pexels-photo-7679657.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/7679688/pexels-photo-7679688.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Blush',
        stock: 18,
        sku: 'BLB-M-BLUSH',
        // Example: Multiple images per variant (2-3 images)
        images: [
          'https://images.pexels.com/photos/7679688/pexels-photo-7679688.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/7679657/pexels-photo-7679657.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'L',
        color: 'Ivory',
        stock: 10,
        priceOverride: 82,
        sku: 'BLB-L-IVORY',
        images: [
          'https://images.pexels.com/photos/774860/pexels-photo-774860.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/7679657/pexels-photo-7679657.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  {
    slug: 'everyday-modal-brief',
    name: 'Everyday Modal Brief',
    category: 'Underwear',
    basePrice: 18,
    description:
      'Ultra-soft modal brief with bonded seams for a barely-there feel. Available in five core hues.',
    careInstructions: 'Machine wash cold. Tumble dry low.',
    images: [
      'https://images.pexels.com/photos/3757043/pexels-photo-3757043.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/3757044/pexels-photo-3757044.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: 'S',
        color: 'Fog',
        stock: 25,
        sku: 'MODALBRIEF-S-FOG',
        images: [
          'https://images.pexels.com/photos/3757043/pexels-photo-3757043.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/3757044/pexels-photo-3757044.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Fog',
        stock: 33,
        sku: 'MODALBRIEF-M-FOG',
        images: [
          'https://images.pexels.com/photos/3757043/pexels-photo-3757043.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/3757044/pexels-photo-3757044.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Midnight',
        stock: 18,
        sku: 'MODALBRIEF-M-MID',
        images: [
          'https://images.pexels.com/photos/3757044/pexels-photo-3757044.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/3757045/pexels-photo-3757045.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'L',
        color: 'Petal',
        stock: 14,
        sku: 'MODALBRIEF-L-PET',
        images: [
          'https://images.pexels.com/photos/3757045/pexels-photo-3757045.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/3757043/pexels-photo-3757043.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  {
    slug: 'soft-jersey-bralette',
    name: 'Soft Jersey Bralette',
    category: 'Underwear',
    basePrice: 32,
    description:
      'Supportive jersey bralette with adjustable straps and removable cups. Perfect for lounge days.',
    careInstructions: 'Machine wash cold in lingerie bag. Lay flat to dry.',
    images: [
      'https://images.pexels.com/photos/3738395/pexels-photo-3738395.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/3756042/pexels-photo-3756042.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: 'XS',
        color: 'Charcoal',
        stock: 9,
        sku: 'JERBRA-XS-CHAR',
        images: [
          'https://images.pexels.com/photos/3738298/pexels-photo-3738298.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/3738395/pexels-photo-3738395.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'S',
        color: 'Charcoal',
        stock: 15,
        sku: 'JERBRA-S-CHAR',
        images: [
          'https://images.pexels.com/photos/3738298/pexels-photo-3738298.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/3756042/pexels-photo-3756042.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Mauve',
        stock: 12,
        sku: 'JERBRA-M-MAUV',
        images: [
          'https://images.pexels.com/photos/3738298/pexels-photo-3738298.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/3738395/pexels-photo-3738395.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/3756042/pexels-photo-3756042.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'L',
        color: 'Mauve',
        stock: 8,
        sku: 'JERBRA-L-MAUV',
        images: [
          'https://images.pexels.com/photos/3738395/pexels-photo-3738395.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/3756042/pexels-photo-3756042.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  {
    slug: 'mesh-panel-leggings',
    name: 'Mesh Panel Compression Leggings',
    category: 'Activewear',
    basePrice: 96,
    description:
      'High-rise legging with targeted compression and breathable mesh panels. 4-way stretch fabric.',
    careInstructions: 'Machine wash cold. Do not tumble dry.',
    images: [
      'https://images.pexels.com/photos/6453399/pexels-photo-6453399.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/6453404/pexels-photo-6453404.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: 'XS',
        color: 'Nightfall',
        stock: 8,
        sku: 'LEGGINGS-XS-NIGHT',
        images: [
          'https://images.pexels.com/photos/6453399/pexels-photo-6453399.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6453404/pexels-photo-6453404.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'S',
        color: 'Nightfall',
        stock: 14,
        sku: 'LEGGINGS-S-NIGHT',
        images: [
          'https://images.pexels.com/photos/6453399/pexels-photo-6453399.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6453404/pexels-photo-6453404.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Nightfall',
        stock: 22,
        sku: 'LEGGINGS-M-NIGHT',
        images: [
          'https://images.pexels.com/photos/6453399/pexels-photo-6453399.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6453404/pexels-photo-6453404.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Sage',
        stock: 17,
        sku: 'LEGGINGS-M-SAGE',
        images: [
          'https://images.pexels.com/photos/6453404/pexels-photo-6453404.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6453399/pexels-photo-6453399.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'L',
        color: 'Sage',
        stock: 10,
        sku: 'LEGGINGS-L-SAGE',
        priceOverride: 99,
        images: [
          'https://images.pexels.com/photos/6453404/pexels-photo-6453404.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6453399/pexels-photo-6453399.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  {
    slug: 'satin-slip-dress',
    name: 'Satin Bias Slip Dress',
    category: 'Dresses',
    basePrice: 148,
    description:
      'Luxurious midi slip dress cut on the bias for a flattering drape. Adjustable straps and silk-blend satin.',
    careInstructions: 'Dry clean only.',
    images: [
      'https://images.pexels.com/photos/949670/pexels-photo-949670.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/1027130/pexels-photo-1027130.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: 'XS',
        color: 'Champagne',
        stock: 6,
        sku: 'SATINSLIP-XS-CHAMP',
        images: [
          'https://images.pexels.com/photos/949670/pexels-photo-949670.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/1027130/pexels-photo-1027130.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'S',
        color: 'Champagne',
        stock: 10,
        sku: 'SATINSLIP-S-CHAMP',
        images: [
          'https://images.pexels.com/photos/949670/pexels-photo-949670.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/1027130/pexels-photo-1027130.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Midnight',
        stock: 9,
        sku: 'SATINSLIP-M-MID',
        images: [
          'https://images.pexels.com/photos/1027130/pexels-photo-1027130.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/949670/pexels-photo-949670.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'L',
        color: 'Emerald',
        stock: 5,
        sku: 'SATINSLIP-L-EMR',
        priceOverride: 158,
        images: [
          'https://images.pexels.com/photos/1027130/pexels-photo-1027130.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/949670/pexels-photo-949670.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  {
    slug: 'pleated-wrap-dress',
    name: 'Pleated Wrap Dress',
    category: 'Dresses',
    basePrice: 168,
    description:
      'Statement wrap dress with pleated skirt and tie waist. Perfect for garden parties and celebrations.',
    careInstructions: 'Machine wash gentle. Line dry.',
    images: [
      'https://images.pexels.com/photos/2065200/pexels-photo-2065200.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/2065201/pexels-photo-2065201.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: 'S',
        color: 'Rose',
        stock: 7,
        sku: 'WRAPDRESS-S-ROSE',
        images: [
          'https://images.pexels.com/photos/2065200/pexels-photo-2065200.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/2065201/pexels-photo-2065201.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Rose',
        stock: 12,
        sku: 'WRAPDRESS-M-ROSE',
        images: [
          'https://images.pexels.com/photos/2065200/pexels-photo-2065200.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/2065201/pexels-photo-2065201.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Slate',
        stock: 11,
        sku: 'WRAPDRESS-M-SLATE',
        images: [
          'https://images.pexels.com/photos/2065201/pexels-photo-2065201.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/2065200/pexels-photo-2065200.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'L',
        color: 'Slate',
        stock: 8,
        priceOverride: 172,
        sku: 'WRAPDRESS-L-SLATE',
        images: [
          'https://images.pexels.com/photos/2065201/pexels-photo-2065201.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/2065200/pexels-photo-2065200.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  {
    slug: 'gemstone-drop-earrings',
    name: 'Gemstone Drop Earrings',
    category: 'Accessories',
    basePrice: 58,
    description:
      'Faceted gemstone drops on a 14k gold-plated hook. Available in moonstone, aquamarine, and garnet.',
    careInstructions: 'Store in pouch. Avoid water and perfume.',
    images: [
      'https://images.pexels.com/photos/1454172/pexels-photo-1454172.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/1454171/pexels-photo-1454171.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: null,
        color: 'Moonstone',
        stock: 20,
        sku: 'EARRINGS-MOON',
        images: [
          'https://images.pexels.com/photos/1454172/pexels-photo-1454172.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/1454171/pexels-photo-1454171.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: null,
        color: 'Aquamarine',
        stock: 16,
        sku: 'EARRINGS-AQUA',
        images: [
          'https://images.pexels.com/photos/1454171/pexels-photo-1454171.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/1454172/pexels-photo-1454172.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: null,
        color: 'Garnet',
        stock: 18,
        sku: 'EARRINGS-GARN',
        images: [
          'https://images.pexels.com/photos/1454172/pexels-photo-1454172.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/1454171/pexels-photo-1454171.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  {
    slug: 'layered-gold-necklace',
    name: 'Layered Gold Necklace',
    category: 'Accessories',
    basePrice: 72,
    description:
      'Three delicate chains with removable pendants for effortless layering.',
    careInstructions: 'Wipe clean with a soft cloth.',
    images: [
      'https://images.pexels.com/photos/1454173/pexels-photo-1454173.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/1454174/pexels-photo-1454174.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: null,
        color: 'Gold',
        stock: 30,
        sku: 'NECKLACE-LAYER-GOLD',
        images: [
          'https://images.pexels.com/photos/1454173/pexels-photo-1454173.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/1454174/pexels-photo-1454174.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: null,
        color: 'Rose Gold',
        stock: 18,
        priceOverride: 76,
        sku: 'NECKLACE-LAYER-ROSE',
        images: [
          'https://images.pexels.com/photos/1454174/pexels-photo-1454174.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/1454173/pexels-photo-1454173.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  {
    slug: 'cashmere-lounge-set',
    name: 'Cashmere Lounge Set',
    category: 'Lingerie',
    basePrice: 220,
    description:
      'Luxurious cashmere blend lounge set featuring a relaxed pullover and tapered pant.',
    careInstructions: 'Dry clean or hand wash cold. Lay flat to dry.',
    images: [
      'https://images.pexels.com/photos/6311666/pexels-photo-6311666.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/6311657/pexels-photo-6311657.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: 'XS',
        color: 'Oatmeal',
        stock: 4,
        sku: 'CASHSET-XS-OAT',
        images: [
          'https://images.pexels.com/photos/6311666/pexels-photo-6311666.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6311657/pexels-photo-6311657.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'S',
        color: 'Oatmeal',
        stock: 9,
        sku: 'CASHSET-S-OAT',
        images: [
          'https://images.pexels.com/photos/6311666/pexels-photo-6311666.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6311657/pexels-photo-6311657.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Gray',
        stock: 7,
        sku: 'CASHSET-M-GRAY',
        images: [
          'https://images.pexels.com/photos/6311657/pexels-photo-6311657.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6311666/pexels-photo-6311666.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'L',
        color: 'Gray',
        stock: 5,
        sku: 'CASHSET-L-GRAY',
        images: [
          'https://images.pexels.com/photos/6311657/pexels-photo-6311657.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6311666/pexels-photo-6311666.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  {
    slug: 'silk-eye-mask',
    name: 'Silk Eye Mask',
    category: 'Accessories',
    basePrice: 32,
    description:
      'Pure mulberry silk eye mask with adjustable strap for restful sleep.',
    careInstructions: 'Hand wash cold. Lay flat to dry.',
    images: [
      'https://images.pexels.com/photos/4492040/pexels-photo-4492040.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/4492041/pexels-photo-4492041.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: null,
        color: 'Ivory',
        stock: 25,
        sku: 'EYEMASK-IVORY',
        images: [
          'https://images.pexels.com/photos/4492040/pexels-photo-4492040.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/4492041/pexels-photo-4492041.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: null,
        color: 'Midnight',
        stock: 20,
        sku: 'EYEMASK-MID',
        images: [
          'https://images.pexels.com/photos/4492041/pexels-photo-4492041.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/4492040/pexels-photo-4492040.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: null,
        color: 'Rose',
        stock: 18,
        sku: 'EYEMASK-ROSE',
        images: [
          'https://images.pexels.com/photos/4492040/pexels-photo-4492040.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/4492041/pexels-photo-4492041.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  {
    slug: 'organic-cotton-robe',
    name: 'Organic Cotton Robe',
    category: 'Lingerie',
    basePrice: 98,
    description:
      'Lightweight organic cotton robe with a relaxed drape and detachable belt.',
    careInstructions: 'Machine wash cold. Tumble dry low.',
    images: [
      'https://images.pexels.com/photos/6311658/pexels-photo-6311658.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/6311659/pexels-photo-6311659.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: 'S/M',
        color: 'Cloud',
        stock: 16,
        sku: 'ROBE-SM-CLOUD',
        images: [
          'https://images.pexels.com/photos/6311658/pexels-photo-6311658.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6311659/pexels-photo-6311659.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M/L',
        color: 'Cloud',
        stock: 14,
        sku: 'ROBE-ML-CLOUD',
        images: [
          'https://images.pexels.com/photos/6311658/pexels-photo-6311658.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6311659/pexels-photo-6311659.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M/L',
        color: 'Seafoam',
        stock: 12,
        sku: 'ROBE-ML-SEA',
        priceOverride: 104,
        images: [
          'https://images.pexels.com/photos/6311659/pexels-photo-6311659.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6311658/pexels-photo-6311658.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  {
    slug: 'seamless-high-rise-brief',
    name: 'Seamless High-Rise Brief',
    category: 'Underwear',
    basePrice: 24,
    description:
      'Smoothing seamless brief with high-rise waist. Invisible under clothing.',
    careInstructions: 'Machine wash cold. Tumble dry low.',
    images: [
      'https://images.pexels.com/photos/6476006/pexels-photo-6476006.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/6476007/pexels-photo-6476007.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: 'S',
        color: 'Sand',
        stock: 30,
        sku: 'SEAMBRIEF-S-SAND',
        images: [
          'https://images.pexels.com/photos/6476006/pexels-photo-6476006.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6476007/pexels-photo-6476007.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Sand',
        stock: 34,
        sku: 'SEAMBRIEF-M-SAND',
        images: [
          'https://images.pexels.com/photos/6476006/pexels-photo-6476006.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6476007/pexels-photo-6476007.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'L',
        color: 'Cocoa',
        stock: 28,
        sku: 'SEAMBRIEF-L-COCOA',
        images: [
          'https://images.pexels.com/photos/6476007/pexels-photo-6476007.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6476006/pexels-photo-6476006.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'XL',
        color: 'Cocoa',
        stock: 19,
        sku: 'SEAMBRIEF-XL-COCOA',
        images: [
          'https://images.pexels.com/photos/6476007/pexels-photo-6476007.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6476006/pexels-photo-6476006.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  {
    slug: 'travel-jewelry-case',
    name: 'Travel Jewelry Case',
    category: 'Accessories',
    basePrice: 42,
    description:
      'Compact jewelry storage with compartments for rings, bracelets, and necklaces.',
    careInstructions: 'Wipe clean with a damp cloth.',
    images: [
      'https://images.pexels.com/photos/1454174/pexels-photo-1454174.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/1454175/pexels-photo-1454175.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: null,
        color: 'Blush',
        stock: 22,
        sku: 'JEWELCASE-BLUSH',
        images: [
          'https://images.pexels.com/photos/1454174/pexels-photo-1454174.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/1454175/pexels-photo-1454175.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: null,
        color: 'Ivory',
        stock: 18,
        sku: 'JEWELCASE-IVORY',
        images: [
          'https://images.pexels.com/photos/1454175/pexels-photo-1454175.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/1454174/pexels-photo-1454174.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  // New products with multiple variants and images
  {
    slug: 'lace-teddy-bodysuit',
    name: 'Lace Teddy Bodysuit',
    category: 'Lingerie',
    basePrice: 88,
    description:
      'Romantic lace teddy with adjustable straps and snap closure. Delicate floral pattern with comfortable fit.',
    careInstructions: 'Hand wash cold. Lay flat to dry.',
    images: [
      'https://images.pexels.com/photos/7679657/pexels-photo-7679657.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/7679688/pexels-photo-7679688.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/774860/pexels-photo-774860.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: 'S',
        color: 'Black',
        stock: 15,
        sku: 'TEDDY-S-BLK',
        images: [
          'https://images.pexels.com/photos/7679657/pexels-photo-7679657.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/7679688/pexels-photo-7679688.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Black',
        stock: 20,
        sku: 'TEDDY-M-BLK',
        images: [
          'https://images.pexels.com/photos/7679688/pexels-photo-7679688.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/7679657/pexels-photo-7679657.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Ivory',
        stock: 12,
        sku: 'TEDDY-M-IVORY',
        images: [
          'https://images.pexels.com/photos/774860/pexels-photo-774860.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/7679657/pexels-photo-7679657.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'L',
        color: 'Ivory',
        stock: 10,
        sku: 'TEDDY-L-IVORY',
        priceOverride: 92,
        images: [
          'https://images.pexels.com/photos/774860/pexels-photo-774860.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/7679688/pexels-photo-7679688.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  {
    slug: 'sports-bra-high-support',
    name: 'High-Support Sports Bra',
    category: 'Activewear',
    basePrice: 68,
    description:
      'Maximum support sports bra with wide straps and racerback design. Moisture-wicking fabric for intense workouts.',
    careInstructions: 'Machine wash cold. Air dry.',
    images: [
      'https://images.pexels.com/photos/6453399/pexels-photo-6453399.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/6453404/pexels-photo-6453404.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: 'XS',
        color: 'Black',
        stock: 12,
        sku: 'SPORTSBRA-XS-BLK',
        images: [
          'https://images.pexels.com/photos/6453399/pexels-photo-6453399.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6453404/pexels-photo-6453404.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'S',
        color: 'Black',
        stock: 18,
        sku: 'SPORTSBRA-S-BLK',
        images: [
          'https://images.pexels.com/photos/6453399/pexels-photo-6453399.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6453404/pexels-photo-6453404.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Navy',
        stock: 16,
        sku: 'SPORTSBRA-M-NAVY',
        images: [
          'https://images.pexels.com/photos/6453404/pexels-photo-6453404.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6453399/pexels-photo-6453399.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'L',
        color: 'Navy',
        stock: 14,
        sku: 'SPORTSBRA-L-NAVY',
        images: [
          'https://images.pexels.com/photos/6453404/pexels-photo-6453404.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6453399/pexels-photo-6453399.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  {
    slug: 'midi-floral-dress',
    name: 'Midi Floral Print Dress',
    category: 'Dresses',
    basePrice: 128,
    description:
      'Flowing midi dress with delicate floral print and wrap-style front. Perfect for brunch or garden parties.',
    careInstructions: 'Machine wash gentle. Line dry.',
    images: [
      'https://images.pexels.com/photos/2065200/pexels-photo-2065200.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/2065201/pexels-photo-2065201.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: 'S',
        color: 'Rose Print',
        stock: 10,
        sku: 'FLORAL-S-ROSE',
        images: [
          'https://images.pexels.com/photos/2065200/pexels-photo-2065200.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/2065201/pexels-photo-2065201.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Rose Print',
        stock: 15,
        sku: 'FLORAL-M-ROSE',
        images: [
          'https://images.pexels.com/photos/2065200/pexels-photo-2065200.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/2065201/pexels-photo-2065201.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Lavender Print',
        stock: 12,
        sku: 'FLORAL-M-LAV',
        images: [
          'https://images.pexels.com/photos/2065201/pexels-photo-2065201.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/2065200/pexels-photo-2065200.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'L',
        color: 'Lavender Print',
        stock: 8,
        sku: 'FLORAL-L-LAV',
        priceOverride: 135,
        images: [
          'https://images.pexels.com/photos/2065201/pexels-photo-2065201.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/2065200/pexels-photo-2065200.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  {
    slug: 'cotton-boy-short',
    name: 'Cotton Boy Short',
    category: 'Underwear',
    basePrice: 22,
    description:
      'Comfortable cotton boy short with wide elastic waistband. Perfect for everyday wear.',
    careInstructions: 'Machine wash cold. Tumble dry low.',
    images: [
      'https://images.pexels.com/photos/3757043/pexels-photo-3757043.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/3757044/pexels-photo-3757044.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: 'S',
        color: 'Nude',
        stock: 28,
        sku: 'BOYSHORT-S-NUDE',
        images: [
          'https://images.pexels.com/photos/3757043/pexels-photo-3757043.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/3757044/pexels-photo-3757044.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Nude',
        stock: 32,
        sku: 'BOYSHORT-M-NUDE',
        images: [
          'https://images.pexels.com/photos/3757043/pexels-photo-3757043.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/3757044/pexels-photo-3757044.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Charcoal',
        stock: 20,
        sku: 'BOYSHORT-M-CHAR',
        images: [
          'https://images.pexels.com/photos/3757044/pexels-photo-3757044.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/3757045/pexels-photo-3757045.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'L',
        color: 'Charcoal',
        stock: 16,
        sku: 'BOYSHORT-L-CHAR',
        images: [
          'https://images.pexels.com/photos/3757044/pexels-photo-3757044.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/3757045/pexels-photo-3757045.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  {
    slug: 'delicate-gold-bracelet',
    name: 'Delicate Gold Chain Bracelet',
    category: 'Accessories',
    basePrice: 48,
    description:
      'Fine gold-plated chain bracelet with adjustable clasp. Minimalist design for everyday elegance.',
    careInstructions: 'Store in pouch. Avoid water and chemicals.',
    images: [
      'https://images.pexels.com/photos/1454172/pexels-photo-1454172.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/1454171/pexels-photo-1454171.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: null,
        color: 'Gold',
        stock: 35,
        sku: 'BRACELET-GOLD',
        images: [
          'https://images.pexels.com/photos/1454172/pexels-photo-1454172.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/1454171/pexels-photo-1454171.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: null,
        color: 'Rose Gold',
        stock: 28,
        sku: 'BRACELET-ROSE',
        images: [
          'https://images.pexels.com/photos/1454171/pexels-photo-1454171.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/1454172/pexels-photo-1454172.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: null,
        color: 'Silver',
        stock: 30,
        sku: 'BRACELET-SILVER',
        priceOverride: 52,
        images: [
          'https://images.pexels.com/photos/1454172/pexels-photo-1454172.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/1454171/pexels-photo-1454171.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  {
    slug: 'silk-cami-top',
    name: 'Silk Cami Top',
    category: 'Lingerie',
    basePrice: 65,
    description:
      'Luxurious silk-blend cami top with adjustable straps and delicate lace trim. Perfect for layering or sleep.',
    careInstructions: 'Hand wash cold. Lay flat to dry.',
    images: [
      'https://images.pexels.com/photos/7679657/pexels-photo-7679657.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/7679688/pexels-photo-7679688.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: 'S',
        color: 'Ivory',
        stock: 14,
        sku: 'CAMITOP-S-IVORY',
        images: [
          'https://images.pexels.com/photos/774860/pexels-photo-774860.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/7679657/pexels-photo-7679657.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Ivory',
        stock: 18,
        sku: 'CAMITOP-M-IVORY',
        images: [
          'https://images.pexels.com/photos/774860/pexels-photo-774860.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/7679688/pexels-photo-7679688.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Black',
        stock: 16,
        sku: 'CAMITOP-M-BLK',
        images: [
          'https://images.pexels.com/photos/7679657/pexels-photo-7679657.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/7679688/pexels-photo-7679688.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'L',
        color: 'Black',
        stock: 12,
        sku: 'CAMITOP-L-BLK',
        images: [
          'https://images.pexels.com/photos/7679688/pexels-photo-7679688.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/7679657/pexels-photo-7679657.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
  {
    slug: 'yoga-shorts',
    name: 'High-Waist Yoga Shorts',
    category: 'Activewear',
    basePrice: 52,
    description:
      'Comfortable high-waist yoga shorts with built-in brief. Perfect for yoga, pilates, or lounging.',
    careInstructions: 'Machine wash cold. Air dry.',
    images: [
      'https://images.pexels.com/photos/6453399/pexels-photo-6453399.jpeg?auto=compress&cs=tinysrgb&w=900',
      'https://images.pexels.com/photos/6453404/pexels-photo-6453404.jpeg?auto=compress&cs=tinysrgb&w=900',
    ],
    variants: [
      {
        size: 'XS',
        color: 'Black',
        stock: 10,
        sku: 'YOGASHORT-XS-BLK',
        images: [
          'https://images.pexels.com/photos/6453399/pexels-photo-6453399.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6453404/pexels-photo-6453404.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'S',
        color: 'Black',
        stock: 15,
        sku: 'YOGASHORT-S-BLK',
        images: [
          'https://images.pexels.com/photos/6453399/pexels-photo-6453399.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6453404/pexels-photo-6453404.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'M',
        color: 'Sage',
        stock: 13,
        sku: 'YOGASHORT-M-SAGE',
        images: [
          'https://images.pexels.com/photos/6453404/pexels-photo-6453404.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6453399/pexels-photo-6453399.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
      {
        size: 'L',
        color: 'Sage',
        stock: 11,
        sku: 'YOGASHORT-L-SAGE',
        images: [
          'https://images.pexels.com/photos/6453404/pexels-photo-6453404.jpeg?auto=compress&cs=tinysrgb&w=900',
          'https://images.pexels.com/photos/6453399/pexels-photo-6453399.jpeg?auto=compress&cs=tinysrgb&w=900',
        ],
      },
    ],
  },
];

const promotions = [
  {
    code: 'WELCOME15',
    description: '15% off your first order.',
    type: 'percentage',
    value: 15,
    appliesTo: {
      categories: [],
      products: [],
    },
    startDate: new Date(),
    endDate: null,
  },
  {
    code: 'SPRINGSET25',
    description: 'Save $25 on lingerie sets.',
    type: 'amount',
    value: 25,
    appliesTo: {
      categories: ['Lingerie'],
      products: ['blush-lace-bralette-set', 'cashmere-lounge-set'],
    },
    startDate: new Date(),
    endDate: null,
  },
];

async function seedCategories() {
  console.log('Seeding categories…');
  for (const category of categories) {
    const ref = storeCollection('categories').doc(category.name);
    await ref.set(
      {
        name: category.name,
        slug: category.slug,
        description: category.description,
        imageUrl: category.imageUrl,
        previewProductIds: category.previewProductIds,
        active: true,
        metrics: {
          totalViews: 0,
          lastViewedAt: null,
        },
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
}

async function seedProducts() {
  console.log('Seeding products and variants…');
  for (const product of productCatalog) {
    const productRef = storeCollection('products').doc(product.slug);
    const existing = await productRef.get();

    const timestamps = existing.exists
      ? { updatedAt: FieldValue.serverTimestamp() }
      : {
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };

    await productRef.set(
      {
        name: product.name,
        slug: product.slug,
        categoryId: product.category,
        supplierId: null,
        basePrice: product.basePrice,
        description: product.description,
        careInstructions: product.careInstructions,
        images: product.images,
        active: true,
        metrics: {
          totalViews: 0,
          totalPurchases: 0,
          lastViewedAt: null,
        },
        ...timestamps,
      },
      { merge: true }
    );

    // Seed variants - ensure every color has images
    const variantsCollection = productRef.collection('variants');
    
    // Group variants by color to assign images per color
    const variantsByColor = new Map();
    for (const variant of product.variants) {
      const colorKey = variant.color || 'default';
      if (!variantsByColor.has(colorKey)) {
        variantsByColor.set(colorKey, []);
      }
      variantsByColor.get(colorKey).push(variant);
    }
    
    // Assign images to each color (reuse product images or variant-specific images)
    let imageIndex = 0;
    for (const [colorKey, colorVariants] of variantsByColor.entries()) {
      // Get variant images (support both `image` and `images` for backward compatibility)
      // Priority: variant.images > variant.image > product images
      const firstVariantWithImages = colorVariants.find(v => v.images || v.image);
      let colorImages = [];
      
      if (firstVariantWithImages) {
        // Use images array if provided, otherwise convert single image to array
        colorImages = Array.isArray(firstVariantWithImages.images)
          ? firstVariantWithImages.images.filter(Boolean)
          : firstVariantWithImages.image
          ? [firstVariantWithImages.image]
          : [];
      }
      
      // Fallback to product images if no variant-specific images
      if (colorImages.length === 0 && product.images && product.images.length > 0) {
        colorImages = [product.images[imageIndex % product.images.length]];
      }
      
      // Assign the same image(s) to all variants of this color
      for (const variant of colorVariants) {
        const variantId =
          variant.sku ||
          [
            variant.size ? variant.size.toLowerCase() : 'onesize',
            variant.color ? variant.color.toLowerCase() : 'standard',
          ].join('-');

        const variantRef = variantsCollection.doc(variantId);
        const variantExisting = await variantRef.get();
        const variantTimestamps = variantExisting.exists
          ? { updatedAt: FieldValue.serverTimestamp() }
          : {
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            };

        // Determine variant images: use variant.images if provided, otherwise variant.image, otherwise color's images
        let variantImages = [];
        if (Array.isArray(variant.images) && variant.images.length > 0) {
          variantImages = variant.images.filter(Boolean);
        } else if (variant.image) {
          variantImages = [variant.image];
        } else if (colorImages.length > 0) {
          variantImages = colorImages;
        }

        await variantRef.set(
          {
            size: variant.size || null,
            color: variant.color || null,
            stock: typeof variant.stock === 'number' ? variant.stock : 0,
            priceOverride:
              typeof variant.priceOverride === 'number'
                ? variant.priceOverride
                : null,
            sku: variant.sku || null,
            images: variantImages.length > 0 ? variantImages : null,
            metrics: {
              totalViews: 0,
              totalAddedToCart: 0,
              totalPurchases: 0,
            },
            ...variantTimestamps,
          },
          { merge: true }
        );
      }
      
      imageIndex++;
    }
  }
}

async function seedPromotions() {
  console.log('Seeding promotions…');
  for (const promo of promotions) {
    const promoRef = storeCollection('promotions').doc(promo.code);
    await promoRef.set(
      {
        code: promo.code,
        description: promo.description,
        type: promo.type,
        value: promo.value,
        appliesTo: promo.appliesTo,
        startDate: promo.startDate
          ? admin.firestore.Timestamp.fromDate(new Date(promo.startDate))
          : null,
        endDate: promo.endDate
          ? admin.firestore.Timestamp.fromDate(new Date(promo.endDate))
          : null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
}

async function updateCategoryPreviews() {
  console.log('Updating category preview product IDs…');
  const productsSnapshot = await storeCollection('products').get();

  const categoryMap = new Map();
  for (const doc of productsSnapshot.docs) {
    const data = doc.data();
    if (!data.categoryId || !data.active) continue;

    if (!categoryMap.has(data.categoryId)) {
      categoryMap.set(data.categoryId, []);
    }

    if (data.images && data.images.length > 0) {
      categoryMap.get(data.categoryId).push({
        id: doc.id,
        image: data.images[0],
      });
    }
  }

  for (const category of categories) {
    const previewProducts = categoryMap.get(category.name) || [];
    const previewIds = previewProducts.slice(0, 4).map((item) => item.id);
    await db
      .collection('categories')
      .doc(category.name)
      .set(
        {
          previewProductIds: previewIds,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
  }
}

async function main() {
  try {
    await seedCategories();
    await seedProducts();
    // Note: previewProductIds are left empty - admins manually select products via category management UI
    await seedPromotions();

    console.log('✅ Dummy data seeded successfully.');
    console.log('💡 Tip: Use the category management UI to manually select which products appear in category card previews.');
  } catch (error) {
    console.error('❌ Failed to seed dummy data:', error);
    process.exitCode = 1;
  } finally {
    await admin.app().delete().catch(() => {});
  }
}

main();

