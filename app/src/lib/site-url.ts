/**
 * The canonical browser origin used in links that leave the app, such as the
 * password-recovery email. Keeping this configuration-based avoids trusting a
 * forged Host header to choose where an authentication link sends a user.
 */
export function getSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const siteUrl = configured || "http://localhost:3000";

  try {
    const url = new URL(siteUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    return url.origin;
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL must be a valid http(s) origin");
  }
}
