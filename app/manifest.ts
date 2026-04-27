import type { MetadataRoute } from "next";

// PWA / "Add to Home Screen" manifest. Next.js picks `app/apple-icon.png`
// up automatically for iOS — this manifest covers Android Chrome and
// gives the home-screen tile an app-like name and theme color.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CK Ref.",
    short_name: "CK Ref.",
    description: "Mass-symmetry graphic design reference archive.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/apple-icon.jpeg",
        sizes: "180x180",
        type: "image/jpeg",
      },
      {
        src: "/apple-icon.jpeg",
        sizes: "512x512",
        type: "image/jpeg",
      },
    ],
  };
}
