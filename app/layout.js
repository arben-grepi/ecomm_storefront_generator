import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./LUNERA/globals.css";
import PageTransitionBar from "@/components/PageTransitionBar";
import UnderConstructionBanner from "@/components/UnderConstructionBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata = {
  title: "Ecommerce Admin",
  description: "Lightweight dashboard overview for the ecommerce platform",
  // Note: robots meta tag is handled per-route in storefront layouts
  // Storefront routes (e.g., /LUNERA/*) should allow indexing
  // Admin routes should block indexing (handled in admin layout)
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} antialiased`}
      >
        <PageTransitionBar />
        <UnderConstructionBanner />
        {children}
      </body>
    </html>
  );
}


