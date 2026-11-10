
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/account", "/checkout"],
    },
    sitemap: "https://brewlite-sgu.duckdns.org/sitemap.xml",
  };
}
