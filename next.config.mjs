/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  reactCompiler: true,
  // Enable standalone output for Firebase App Hosting
  // This creates a minimal server bundle with only necessary dependencies
  output: 'standalone',
  // Ensure firebase-admin is included in standalone build
  // This is needed for scripts that run separately from the Next.js server
  // Note: In Next.js 16+, serverComponentsExternalPackages moved to serverExternalPackages
  serverExternalPackages: ['firebase-admin'],
  // Suppress favicon.ico 404 errors in development
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  images: {
    // Allow images from Shopify CDN and other common sources
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.shopify.com',
      },
      {
        protocol: 'https',
        hostname: '**.myshopify.com',
      },
      {
        protocol: 'https',
        hostname: 'images.pexels.com',
      },
      {
        protocol: 'https',
        hostname: 'picsum.photos',
      },
      // Firebase Storage (for uploaded banner images)
      {
        protocol: 'https',
        hostname: '**.firebasestorage.googleapis.com',
      },
      {
        protocol: 'https',
        hostname: 'firebasestorage.googleapis.com',
      },
      // Add your Shopify store domain if using custom CDN
      // {
      //   protocol: 'https',
      //   hostname: 'your-store.myshopify.com',
      // },
    ],
    // Optimize images for better performance
    formats: ['image/avif', 'image/webp'],
  },
};

export default nextConfig;
