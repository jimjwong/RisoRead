import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RisoRead",
  description:
    "Your shelf, on whatever you are holding. PDFs and EPUBs in the cloud, open at the page you left.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "RisoRead",
    // Not "default": a translucent bar leaves the reader's own tint showing
    // through the status area, which is the point of having tints at all.
    statusBarStyle: "black-translucent",
  },
};

/**
 * The viewport, which for a reader is not boilerplate.
 *
 * `viewportFit: "cover"` is what puts the page under the notch and the home
 * indicator on a phone, and it is why the reader's footer pads itself with
 * `env(safe-area-inset-bottom)` rather than a guessed number.
 *
 * `themeColor` is answered twice so the browser chrome follows the same
 * light/dark the stylesheet does, instead of pinning one of them.
 */
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfbfa" },
    { media: "(prefers-color-scheme: dark)", color: "#16171a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
