import type { Metadata, Viewport } from "next";
import "./globals.css";
import SWRegister from "./sw-register";
import I18nProvider from "./providers";

export const metadata: Metadata = {
  title: "TrueLens — AI Image Authenticity Detection",
  description:
    "Upload an image and instantly determine if it's a real photo or AI-generated. Based on deep learning + EXIF metadata analysis.",
  keywords: [
    "AI detection",
    "image authenticity",
    "deepfake",
    "AI-generated",
    "TrueLens",
    "AI image recognition",
    "AI检测",
    "图片真伪",
    "AI生成检测",
    "AI图片识别",
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
    siteName: "TrueLens",
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
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#4f46e5",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <I18nProvider>{children}</I18nProvider>
        <SWRegister />
      </body>
    </html>
  );
}
