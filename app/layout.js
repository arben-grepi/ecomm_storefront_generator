import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
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

export const metadata = {
  title: "Ecommerce Admin",
  description: "Lightweight dashboard overview for the ecommerce platform",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <PageTransitionBar />
        <UnderConstructionBanner />
        {children}
      </body>
    </html>
  );
}
