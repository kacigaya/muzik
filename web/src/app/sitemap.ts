import type { MetadataRoute } from "next";
import { getDocSlugs } from "@/lib/docs";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const docs = getDocSlugs().map((slug) => {
    const path = slug.length ? `/docs/${slug.join("/")}/` : "/docs/";
    return {
      url: `${SITE_URL}${path}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: slug.length ? 0.75 : 0.9,
    };
  });

  return [
    {
      url: `${SITE_URL}/`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 1,
    },
    ...docs,
  ];
}
