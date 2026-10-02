import type { MetadataRoute } from "next";
import { getDocSlugs } from "@/lib/docs";
import { SITE_URL } from "@/lib/seo";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const docs = getDocSlugs().map((slug) => {
    const path = slug.length ? `/docs/${slug.join("/")}/` : "/docs/";
    return {
      url: `${SITE_URL}${path}`,
      changeFrequency: "weekly" as const,
      priority: slug.length ? 0.75 : 0.9,
    };
  });

  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "weekly" as const,
      priority: 1,
    },
    { url: `${SITE_URL}/privacy/`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/cookies/`, changeFrequency: "yearly", priority: 0.3 },
    ...docs,
  ];
}
