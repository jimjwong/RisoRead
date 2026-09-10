import { NextResponse } from "next/server";

/**
 * The web app manifest, as a route rather than a static file.
 *
 * The icons are generated below rather than shipped as PNGs, so there is no
 * binary in the repository that has to be regenerated when the mark changes.
 *
 * `display: "standalone"` is what removes the browser chrome once this is added
 * to a home screen, which is most of what makes it feel like an app on a phone.
 * `orientation` is deliberately unset: a book is read in portrait and a
 * two-column PDF is read in landscape, and pinning either would be wrong for
 * half the shelf.
 */
export function GET() {
  return NextResponse.json(
    {
      name: "RisoRead",
      short_name: "RisoRead",
      description: "Your shelf, on whatever you are holding.",
      start_url: "/books",
      // The shelf rather than "/", so opening from a home screen skips the
      // redirect the root does — one fewer request before anything is on screen.
      scope: "/",
      display: "standalone",
      background_color: "#fbfbfa",
      theme_color: "#fbfbfa",
      icons: [
        { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
      ],
      shortcuts: [
        { name: "Your shelf", url: "/books" },
        { name: "Settings", url: "/settings" },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
