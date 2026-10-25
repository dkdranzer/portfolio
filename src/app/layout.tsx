import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dinesh Kumar G — Software Engineer",
  description: "Software Engineer at HealthFoundry.ai building event-driven, multi-agent AI systems for healthcare.",
  openGraph: {
    title: "Dinesh Kumar G — Software Engineer",
    description: "Ride through my work: multi-agent AI systems for healthcare.",
    type: "website",
  },
};

export const viewport: Viewport = { themeColor: "#1a1114" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600&family=Space+Grotesk:wght@400;500;600&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
