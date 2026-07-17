import type { Metadata, Viewport } from "next";
import "./globals.css";
import SWRegister from "./sw-register";

export const metadata: Metadata = {
  title: "TrueLens — AI 图片真伪检测",
  description:
    "上传图片，秒级判断是真人拍摄还是 AI 生成。基于深度学习模型 + EXIF 元数据分析，给出概率评分和证据。",
  keywords: ["AI检测", "图片真伪", "deepfake", "AI生成检测", "TrueLens", "AI图片识别"],
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
    title: "TrueLens — AI 图片真伪检测",
    description: "秒级判断图片是真人拍摄还是 AI 生成，给出概率评分和证据。",
    type: "website",
    locale: "zh_CN",
    siteName: "TrueLens",
  },
  twitter: {
    card: "summary_large_image",
    title: "TrueLens — AI 图片真伪检测",
    description: "秒级判断图片是真人拍摄还是 AI 生成，给出概率评分和证据。",
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
    <html lang="zh-CN">
      <body>
        {children}
        <SWRegister />
      </body>
    </html>
  );
}
