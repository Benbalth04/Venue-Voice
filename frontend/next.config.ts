import type { NextConfig } from "next";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const backendBaseUrl = process.env.NEXT_PUBLIC_BACKEND_BASE_URL ?? "";

function supabaseOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function supabaseWss(origin: string): string {
  try {
    return `wss://${new URL(origin + "/").hostname}`;
  } catch {
    return "";
  }
}

const SUPABASE_ORIGIN = supabaseOrigin(supabaseUrl);
const SUPABASE_WSS = supabaseWss(SUPABASE_ORIGIN);
const BACKEND_ORIGIN = supabaseOrigin(backendBaseUrl);

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=(), magnetometer=()",
  },
  {
    key: "X-Permitted-Cross-Domain-Policies",
    value: "none",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'none'",
      // 'unsafe-inline' required by Next.js inline hydration scripts
      `script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://*.crisp.chat`,
      // 'unsafe-inline' required by Tailwind CSS runtime class injection
      `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://*.crisp.chat`,
      `font-src 'self' https://fonts.gstatic.com https://*.crisp.chat`,
      `img-src 'self' data: blob: https://*.crisp.chat${
        SUPABASE_ORIGIN ? ` ${SUPABASE_ORIGIN}` : ""
      }`,
      [
        "connect-src 'self'",
        BACKEND_ORIGIN ? BACKEND_ORIGIN : "",
        SUPABASE_ORIGIN ? SUPABASE_ORIGIN : "",
        SUPABASE_WSS ? SUPABASE_WSS : "",
        "https://*.crisp.chat",
        "wss://*.crisp.chat",
        "https://api.stripe.com",
        "https://vitals.vercel-insights.com",
      ]
        .filter(Boolean)
        .join(" "),
      // js.stripe.com iframes are used for Stripe 3DS challenges
      `frame-src 'self' https://js.stripe.com https://*.crisp.chat`,
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
