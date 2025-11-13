# Database Schema Overview

This document captures the initial Firestore data model for the ecommerce platform. It is meant to be a living reference—update it whenever collections change.

## Contents

- [Collections](#collections)
  - [categories](#categories)
  - [products](#products)
  - [suppliers](#suppliers)
  - [carts](#carts)
  - [orders](#orders)
  - [promotions](#promotions)
  - [users](#users)
  - [userEvents](#userevents)
- [Indexes](#indexes)
- [Security Considerations](#security-considerations)

---

## Collections

All application data lives under the root collection `LUNERA`. Each logical collection (categories, products, promotions, etc.) is stored as a subcollection at the path:

```
LUNERA/{collectionName}/items/{documentId}
```

For example, categories are stored at `LUNERA/categories/items/{categoryId}` and products at `LUNERA/products/items/{productId}`. Product variants remain subcollections of the product document (`.../items/{productId}/variants/{variantId}`).

### categories
Stores merchandising metadata for each category.

| Field            | Type      | Notes                                         |
|------------------|-----------|-----------------------------------------------|
| `name`           | string    | Display name                                  |
| `slug`           | string    | URL-safe identifier                           |
| `description`    | string    | Short descriptive copy                        |
| `imageUrl`       | string    | Hero/cover image                              |
| `createdAt`      | timestamp | Auto-set on insert                            |
| `updatedAt`      | timestamp | Auto-set on update                            |
| `metrics`        | map       | `{ totalViews: number, lastViewedAt: timestamp }` |

### products
Top-level product metadata. Per-variant data lives in the `variants` subcollection.

| Field            | Type      | Notes                                                                    |
|------------------|-----------|--------------------------------------------------------------------------|
| `name`           | string    |                                                                          |
| `slug`           | string    |                                                                          |
| `categoryId`     | reference | Reference to `categories/{id}`                                           |
| `supplierId`     | reference | Reference to `suppliers/{id}`                                            |
| `basePrice`      | number    | Default price when no override on variant                                |
| `description`    | string    | Plain-text summary shown in cards                                         |
| `descriptionHtml`| string    | Sanitized rich text rendered on detail pages                              |
| `images`         | array     | Array of primary image URLs                                               |
| `extraImages`    | array     | Additional images parsed from rich content                                |
| `careInstructions` | string  | Optional long-form field                                                  |
| `tags`           | array     | Search/filter tags                                                        |
| `specs`          | map       | Structured specs parsed from product description                          |
| `active`         | boolean   | Whether product is visible                                                |
| `metrics`        | map       | `{ totalViews, lastViewedAt, totalPurchases }`                            |
| `createdAt`      | timestamp |                                                                            |
| `updatedAt`      | timestamp |                                                                            |

#### products/{productId}/variants

| Field             | Type    | Notes                                                          |
|-------------------|---------|----------------------------------------------------------------|
| `size`            | string  | Nullable—some items may not have size                          |
| `color`           | string  | Nullable                                                       |
| `sku`             | string  | Optional identifier                                            |
| `stock`           | number  | Inventory count for this variant                               |
| `priceOverride`   | number  | Optional override; falls back to `basePrice` if null          |
| `images`          | array   | Optional variant-specific image URLs (e.g., for color variants). Array of strings, typically 2-3 images per variant. |
| `metrics`         | map     | `{ totalViews, totalAddedToCart, totalPurchases }`             |
| `createdAt`       | timestamp |                                                              |
| `updatedAt`       | timestamp |                                                              |

### suppliers
Minimal supplier registry.

| Field          | Type      | Notes                   |
|----------------|-----------|-------------------------|
| `name`         | string    |                         |
| `contactEmail` | string    |                         |
| `phone`        | string    | Optional                 |
| `address`      | map       | `{ street, city, state, zip, country }` |
| `notes`        | string    | Internal notes           |
| `createdAt`    | timestamp |                         |

### carts
Tracks active shopping carts (guest or authenticated).

| Field        | Type      | Notes                                                                      |
|--------------|-----------|----------------------------------------------------------------------------|
| `userId`     | string    | UID for authenticated users; null for guests                               |
| `sessionId`  | string    | Identifier for guest sessions (cookie-based, etc.)                         |
| `items`      | array     | Array of `{ productId, variantId, quantity, priceAtAdd, addedAt }`         |
| `status`     | string    | `'active'`, `'converted'`, `'abandoned'`                                   |
| `lastUpdated`| timestamp | Updated whenever the cart mutates                                          |

### orders
Immutable order records capturing purchases.

| Field             | Type      | Notes                                                                     |
|-------------------|-----------|---------------------------------------------------------------------------|
| `userId`          | string    | UID for authenticated users; null for guest orders                        |
| `status`          | string    | `'pending'`, `'paid'`, `'shipped'`, `'cancelled'`                          |
| `items`           | array     | `{ productId, variantId, quantity, unitPrice, subtotal }`                 |
| `totals`          | map       | `{ subtotal, discounts, tax, shipping, grandTotal }`                      |
| `shippingAddress` | map       | `{ name, address1, address2?, city, state, zip, country, phone }`         |
| `paymentSummary`  | map       | `{ provider, transactionId, last4? }`                                     |
| `placedAt`        | timestamp |                                                                           |
| `fulfillment`     | map       | `{ shippedAt?, trackingNumber? }`                                         |

### promotions
Stores discount codes / campaign metadata.

| Field           | Type      | Notes                                                         |
|-----------------|-----------|---------------------------------------------------------------|
| `code`          | string    | Unique coupon code                                            |
| `description`   | string    |                                                               |
| `type`          | string    | `'percentage'` or `'amount'`                                  |
| `value`         | number    | Discount value                                                |
| `appliesTo`     | map       | Optional `{ categories: [ids], products: [ids] }`             |
| `startDate`     | timestamp |                                                               |
| `endDate`       | timestamp |                                                               |
| `maxRedemptions`| number    | Optional cap                                                  |
| `createdAt`     | timestamp |                                                               |

### users
Profile info for authenticated customers.

| Field                 | Type      | Notes                                        |
|-----------------------|-----------|----------------------------------------------|
| `email`               | string    | Canonical email                              |
| `displayName`         | string    |                                              |
| `photoUrl`            | string    |                                              |
| `marketingOptIn`      | boolean   |                                              |
| `savedAddresses`      | array     | Stored shipping addresses                    |
| `marketingPreferences`| map       | `{ categoriesInterestedIn: [] }`             |
| `createdAt`           | timestamp |                                              |

### userEvents
Raw analytics events for personalization.

| Field       | Type      | Notes                                                            |
|-------------|-----------|------------------------------------------------------------------|
| `userId`    | string    | UID                                                           |
| `eventType` | string    | `'view_category'`, `'view_product'`, `'add_to_cart'`, etc.      |
| `entityId`  | string    | Corresponding category/product ID                               |
| `metadata`  | map       | Optional `{ variantId, source }`                                |
| `timestamp` | timestamp |                                                                  |

---

## Indexes

Initial composite indexes to consider:

- Queries on products by `categoryId` and `active`.
- Sorting products by `metrics.totalViews` or `createdAt` within a category.
- Filtering variants by `productId` + `color` + `size` (if loaded via subcollection queries).
- Orders by `userId` sorted by `placedAt`.
- userEvents by `userId` sorted by `timestamp`.

Define these once patterns emerge to stay under Firestore index limits.

---

## Security Considerations

- `products`, `categories`, and `promotions` read access: public.
- Write access restricted to admin users (by UID list or role claim).
- `carts` write access: owner user or session token; reads limited accordingly.
- `orders` read access: owner user only; writes via Cloud Functions or authenticated actions.
- `userEvents` writes: authenticated users only; no public reads.
- Consider Cloud Functions to validate promotion redemption and inventory decrements.

Update this document whenever collections or access patterns change.
