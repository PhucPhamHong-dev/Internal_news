import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bản Tin Nội Bộ",
    short_name: "Bản Tin",
    description: "Bản tin nội bộ ACE",
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#f59e0b",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png"
      },
      {
        src: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png"
      }
    ]
  };
}
