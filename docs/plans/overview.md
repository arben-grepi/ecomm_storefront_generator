# Admin Overview Plan

This document captures desired widgets, metrics, and actions for the admin dashboard landing page.

## Goals

- Quick snapshot of store performance (sales, orders, inventory alerts).
- Access points to common admin tasks (add product, manage promotions, view catalog).
- Surface engagement signals (top viewed products/categories).

## Sections to Implement

1. **Key Metrics Cards**
   - Daily/weekly revenue
   - Orders count
   - Conversion rate / cart abandonment (future)
   - Low-stock variants

2. **Recent Orders Feed**
   - Latest 5–10 orders
   - Status chips (paid/shipped/pending)
   - CTA to view full orders list

3. **Inventory Alerts**
   - Variants with stock below threshold
   - Link to product detail editor

4. **Engagement Highlights**
   - Top viewed products this week
   - Top categories by views
   - Promotion performance snapshot (if active)

5. **Quick Actions**
   - Add new product
   - Manage promotions
   - View full product catalog
   - Review carts (optional)

## UI Considerations

- Use cards/grids consistent with existing styling.
- Provide responsive layout (desktop focus, workable on tablet).
- Buttons should navigate to dedicated admin routes (`/admin/products`, `/admin/promotions`, etc.).

## Data Dependencies

- Aggregated metrics collections or Cloud Function stats (to be defined).
- Orders collection for recent activity.
- Products/variants for stock levels and engagement metrics.
- Promotions for active campaign performance.

## Next Steps

- Define data contracts for widgets (temporary mock data acceptable during UI build).
- Build placeholder components with navigation buttons.
- Wire to real data once aggregation logic is in place.
