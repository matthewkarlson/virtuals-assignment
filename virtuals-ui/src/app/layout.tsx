import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Virtuals Protocol - AI Agent Trading",
  description: "Create and trade AI agents with bonding curves",
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
