import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // The exam page loads the SDK from this app. A short cache keeps
        // policy fixes rolling out within minutes of a deploy.
        source: "/sdk/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=300, must-revalidate" }],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
