import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import NextTopLoader from 'nextjs-toploader';

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MiBx Dispatch v3",
    template: "%s | MiBx Dispatch v3",
  },
  description: "Shopify × Pathao Dispatch ERP — manage orders and dispatch parcels",
  robots: "noindex, nofollow", // Internal tool — don't index
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#09090b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" data-scroll-behavior="smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="icon" type="image/png" href="/favicon-96x96.png" sizes="96x96" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="shortcut icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-title" content="MiBx Dispatch" />
        <link rel="manifest" href="/site.webmanifest" />
      </head>
      <body className={`${inter.variable} font-sans antialiased bg-zinc-950 text-zinc-50`}>
        <NextTopLoader color="#6366f1" showSpinner={false} height={3} />
        {children}
        <Toaster
          theme="dark"
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            style: {
              background: "#18181b",
              border: "1px solid #27272a",
              color: "#fafafa",
            },
          }}
        />
      </body>
    </html>
  );
}
