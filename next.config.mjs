/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep pages the browser has already loaded for 30s (dynamic) / 3 min (static), so back, forward and tab switches are
  // instant. Any server action or refresh after a change still fetches fresh.
  experimental: { staleTimes: { dynamic: 30, static: 180 } },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }],
  },
};

export default nextConfig;
