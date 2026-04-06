import type { MetadataRoute } from "next";

function getBaseUrl(): string {
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN?.replace(/\/$/, "");
  if (origin) return origin;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getBaseUrl();
  const now = new Date();

  const paths: { path: string; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]; priority: number }[] = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/subscribe", changeFrequency: "weekly", priority: 0.9 },
    { path: "/signup", changeFrequency: "monthly", priority: 0.8 },
    { path: "/login", changeFrequency: "monthly", priority: 0.7 },
    { path: "/legal/privacy", changeFrequency: "yearly", priority: 0.4 },
    { path: "/legal/terms", changeFrequency: "yearly", priority: 0.4 },
  ];

  return paths.map(({ path, changeFrequency, priority }) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }));
}
