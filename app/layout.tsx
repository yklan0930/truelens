import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import SWRegister from "./sw-register";
import PwaInstallPrompt from "@/components/PwaInstallPrompt";
import I18nProvider from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://truelens.top"),
  title: "TrueLens — AI Image Authenticity Detection | AI 图片真伪检测",
  description:
    "Upload an image and instantly determine if it's a real photo or AI-generated. Based on deep learning + EXIF metadata analysis. 上传图片即可检测是真人拍摄还是 AI 生成。",
  keywords: [
    "AI detection",
    "image authenticity",
    "deepfake",
    "AI-generated",
    "TrueLens",
    "AI image recognition",
    "fake image detector",
    "AI photo detection",
    "is this AI generated",
    "AI检测",
    "图片真伪",
    "AI生成检测",
    "AI图片识别",
    "假图检测",
    "深度伪造检测",
  ],
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "TrueLens",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "TrueLens — AI Image Authenticity Detection",
    description:
      "Instantly determine if an image is real or AI-generated, with probability scores and evidence.",
    type: "website",
    locale: "en_US",
    alternateLocale: ["zh_CN"],
    siteName: "TrueLens",
    url: "https://truelens.top",
  },
  twitter: {
    card: "summary_large_image",
    title: "TrueLens — AI Image Authenticity Detection",
    description:
      "Instantly determine if an image is real or AI-generated, with probability scores and evidence.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://truelens.top",
    languages: {
      "en": "https://truelens.top",
      "zh": "https://truelens.top",
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#4f46e5",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "TrueLens",
  description:
    "AI image authenticity detection platform. Determine if an image is real or AI-generated using deep learning and metadata analysis.",
  url: "https://truelens.top",
  applicationCategory: "UtilityApplication",
  operatingSystem: "Web",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  featureList: [
    "AI-generated image detection",
    "EXIF metadata analysis",
    "Probability scoring",
    "Evidence-based results",
    "Multi-language support",
  ],
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.5",
    ratingCount: "100",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <I18nProvider>
          {children}
          <PwaInstallPrompt />
        </I18nProvider>
        <SWRegister />
        <Analytics />
      </body>
    </html>
  );
}
