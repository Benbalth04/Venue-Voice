import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

type ChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const now = new Date();

  const paths: { path: string; changeFrequency: ChangeFrequency; priority: number }[] = [
    { path: "/", changeFrequency: "weekly", priority: 1 },
    { path: "/subscribe", changeFrequency: "weekly", priority: 0.9 },
    { path: "/signup", changeFrequency: "monthly", priority: 0.8 },
    { path: "/login", changeFrequency: "monthly", priority: 0.7 },
    { path: "/verify-email", changeFrequency: "monthly", priority: 0.5 },
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
