import { StorefrontProvider } from '@/lib/storefront-context';

export default function CartLayout({ children }) {
  return (
    <StorefrontProvider>
      {children}
    </StorefrontProvider>
  );
}

