'use client';

/**
 * ProductCardContainer - Wrapper for product cards with responsive sizing
 * Uses CSS custom properties for responsive width based on breakpoints
 */
export default function ProductCardContainer({ 
  children, 
  cardSizePhone, 
  cardSizeSmall, 
  cardSizeLaptop, 
  cardSizeLarge 
}) {
  return (
    <div
      style={{
        width: `${cardSizePhone}rem`,
        '@media (min-width: 640px)': {
          width: `${cardSizeSmall}rem`,
        },
        '@media (min-width: 1024px)': {
          width: `${cardSizeLaptop}rem`,
        },
        '@media (min-width: 1536px)': {
          width: `${cardSizeLarge}rem`,
        },
      }}
      className="product-card-container"
    >
      <style jsx>{`
        .product-card-container {
          width: ${cardSizePhone}rem;
        }
        @media (min-width: 640px) {
          .product-card-container {
            width: ${cardSizeSmall}rem;
          }
        }
        @media (min-width: 1024px) {
          .product-card-container {
            width: ${cardSizeLaptop}rem;
          }
        }
        @media (min-width: 1536px) {
          .product-card-container {
            width: ${cardSizeLarge}rem;
          }
        }
      `}</style>
      {children}
    </div>
  );
}

