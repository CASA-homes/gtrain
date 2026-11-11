import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Keeper HQ',
  description: 'Clubhouse, market, draft and history for our AFL Fantasy keeper league.',
  applicationName: 'Keeper HQ',
  appleWebApp: { capable: true, title: 'Keeper HQ', statusBarStyle: 'default' },
  icons: {
    icon: [{ url: '/icons/favicon-32.png?v=3', sizes: '32x32', type: 'image/png' }, { url: '/icons/icon-192.png?v=3', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png?v=3', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#f4f6f1',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800;900&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
