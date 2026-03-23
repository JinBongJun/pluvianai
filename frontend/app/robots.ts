import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/internal/", "/test/"],
    },
    sitemap: "https://www.pluvianai.com/sitemap.xml",
    host: "https://www.pluvianai.com",
  };
}
