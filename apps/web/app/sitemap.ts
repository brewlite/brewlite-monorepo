
import type { MetadataRoute } from "next";

const baseUrl = "https://brewlite-sgu.duckdns.org";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${baseUrl}/`,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/menu`,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  ];
}
