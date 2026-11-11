import type { MetadataRoute } from 'next';

// Installable app: "Add to Home Screen" on iPhone, "Install app" on Android Chrome.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Keeper HQ',
    short_name: 'Keeper HQ',
    description: 'Clubhouse, market, draft and history for our AFL Fantasy keeper league.',
    id: '/',
    start_url: '/clubhouse',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f4f6f1',
    theme_color: '#f4f6f1',
    icons: [
      { src: '/icons/icon-192.png?v=3', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png?v=3', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png?v=3', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
