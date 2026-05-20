import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Security response headers applied to every route.
  // - CSP: prevents XSS by restricting where scripts/styles/connections can come from.
  //   Next.js needs 'unsafe-inline' (hydration) and 'unsafe-eval' (some dev paths);
  //   connect-src whitelists Supabase project subdomains for client-side auth/data calls.
  // - X-Frame-Options DENY: defense against clickjacking (CSP frame-ancestors does the
  //   same thing in modern browsers; both kept for legacy coverage).
  // - X-Content-Type-Options nosniff: prevents MIME-type confusion attacks.
  // - Referrer-Policy: limits how much URL info leaks to third-party resources.
  // - Permissions-Policy: explicitly denies sensor APIs the app doesn't use.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self' https://*.supabase.co",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
