import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SolarSwap — XRPL Energy Marketplace",
  description: "P2P solar energy trading powered by XRPL MPT, DEX, and AMM",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="stylesheet" href="https://use.typekit.net/jcx4jvw.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
