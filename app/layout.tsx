import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/react";
import { headers } from "next/headers";
import "./globals.css";
import SWRegister from "./sw-register";
import I18nProvider from "./providers";
import { detectLocale } from "@/lib/i18n/server";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#4f46e5",
};

const METADATA: Record<string, { title: string; description: string; ogTitle: string; ogDescription: string; twTitle: string; twDescription: string }> = {
  zh: {
    title: "TrueLens — 免费 AI 图片/视频真伪检测，一秒看穿深度伪造",
    description:
      "TrueLens 免费在线 AI 图片/视频真伪检测：上传图片或视频，秒级给出「AI 味」评分与证据，识破 AI 假图、深度伪造与假新闻。",
    ogTitle: "TrueLens — 免费 AI 图片/视频真伪检测，一秒看穿深度伪造",
    ogDescription:
      "上传图片或视频，秒级给出「AI 味」评分与看得懂的证据，帮你识破 AI 假图与深度伪造。",
    twTitle: "TrueLens — 免费 AI 图片/视频真伪检测",
    twDescription:
      "上传图片或视频，秒级给出「AI 味」评分与证据，识破 AI 假图与深度伪造。",
  },
  en: {
    title: "TrueLens — Spot AI Fakes in Seconds. Free AI Image & Video Authenticity Detection",
    description:
      "TrueLens is a free online AI image & video authenticity detector. Upload a photo or video and get an \"AI Likelihood\" score with clear evidence in seconds — catch AI-generated images, deepfakes and fake-news media.",
    ogTitle: "TrueLens — Free AI Image & Video Authenticity Detection",
    ogDescription:
      "Upload a photo or video and get an \"AI Likelihood\" score with clear evidence in seconds. Catch deepfakes, verify sources, stop getting fooled.",
    twTitle: "TrueLens — Free AI Image & Video Authenticity Detection",
    twDescription:
      "Upload a photo or video, get an AI Likelihood score with evidence in seconds. Catch AI fakes & deepfakes.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const locale = detectLocale(h.get("accept-language"));
  const m = METADATA[locale] || METADATA.en;

  return {
    metadataBase: new URL("https://truelens.top"),
    title: m.title,
    description: m.description,
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
      "AI video detection",
      "deepfake detection",
      "fake news",
      "content verification",
      "image forensics",
      "AI假图",
      "深度伪造",
      "假新闻核查",
      "内容核查",
      "图片鉴真",
    ],
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: "TrueLens",
      statusBarStyle: "default",
    },
    icons: {
      icon: [
        { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
        { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    openGraph: {
      title: m.ogTitle,
      description: m.ogDescription,
      type: "website",
      locale: locale === "zh" ? "zh_CN" : "en_US",
      alternateLocale: locale === "zh" ? ["en_US"] : ["zh_CN"],
      siteName: "TrueLens",
      url: "https://truelens.top",
    },
    twitter: {
      card: "summary_large_image",
      title: m.twTitle,
      description: m.twDescription,
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
        en: "https://truelens.top",
        zh: "https://truelens.top",
      },
    },
  };
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "TrueLens",
  description:
    "AI image & video authenticity detection. Upload a photo or video to get an AI-likelihood score with evidence.",
  url: "https://truelens.top",
  applicationCategory: "UtilityApplication",
  operatingSystem: "Web",
  featureList: [
    "AI-generated image & video detection",
    "EXIF / C2PA metadata analysis",
    "Watermark OCR",
    "Probability scoring with evidence",
    "Multi-language support",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <I18nProvider>
          {children}
        </I18nProvider>
        <SWRegister />
        <Analytics />
      </body>
    </html>
  );
}
