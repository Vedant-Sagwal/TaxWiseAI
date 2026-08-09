import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TaxWise AI",
  description: "Source-grounded tax document help",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

