/** @type {import('next').NextConfig} */

// Standard browser protections on every page: no framing by other sites (clickjacking), no content-type guessing,
// only the site name sent to links you click, and no camera/mic/location access.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()' },
];

const nextConfig = {
  // Keep pages the browser has already loaded for 30s (dynamic) / 3 min (static), so back, forward and tab switches are
  // instant. Any server action or refresh after a change still fetches fresh.
  experimental: { staleTimes: { dynamic: 30, static: 180 } },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
