import type { MetadataRoute } from 'next';

// Installable app: "Add to Home Screen" on iPhone, "Install app" on Android Chrome.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'G-Train Fantasy Keeper',
    short_name: 'G-Train',
    description: 'Clubhouse, market, draft and history for the G-Train keeper league.',
    id: '/',
    start_url: '/clubhouse',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#17241c',
    theme_color: '#17241c',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
