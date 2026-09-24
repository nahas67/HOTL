import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Everyday — A HOTL storefront",
  description:
    "Thoughtfully chosen objects for your everyday. HOTL commerce demonstration.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
