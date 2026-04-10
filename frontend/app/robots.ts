import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site-url";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/auth",
        "/billing",
        "/survey",
        "/r/",
        "/onboarding",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
