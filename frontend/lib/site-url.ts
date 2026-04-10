/**
 * Canonical public site origin for sitemap, robots, and absolute URLs at build/runtime.
 * Order matches docker-compose (APP_ORIGIN → NEXT_PUBLIC_FRONTEND_ORIGIN) and local .env patterns.
 */
export function getSiteUrl(): string {
  const normalize = (value: string | undefined): string | undefined => {
    const v = value?.trim().replace(/\/$/, "");
    return v || undefined;
  };

  const explicit =
    normalize(process.env.NEXT_PUBLIC_FRONTEND_ORIGIN) ??
    normalize(process.env.NEXT_PUBLIC_APP_ORIGIN);
  if (explicit) return explicit;

  const vercel = process.env.VERCEL_URL?.trim().replace(/\/$/, "");
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "");
    return `https://${host}`;
  }

  return "http://localhost:3000";
}
