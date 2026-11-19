import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "第一印象实验室",
  description: "中文网页第一印象与摄像头眼动实验",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
