import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Refreshes the Supabase session on every request and keeps signed-out visitors on the landing page.
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getClaims checks the signed session locally (no trip to the auth server) and refreshes it when it's about to expire.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;
  const path = request.nextUrl.pathname;
  const isPublic = path === '/' || path.startsWith('/auth');

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Run next to the database (Tokyo) instead of at the edge near the visitor, so session refreshes are quick.
  runtime: 'nodejs',
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|landing/|.*\\.(?:png|jpg|svg|webp)$).*)'],
};
