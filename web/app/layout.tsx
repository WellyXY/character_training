import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Character Training",
  description: "AI Character Creation and Content Generation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
