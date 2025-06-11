import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EasyV - Virtuals Token Launch Clone",
  description: "Create and trade tokens on the bonding curve, purchase enough to graduate to Uniswap",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
