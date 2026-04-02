import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * JumpContact Platform middleware — Clerk auth for pages, CORS for /api/*.
 * Sign-in/sign-up and API routes are public; everything else requires auth.
 */

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api(.*)',
]);

/** Allowed CORS origins — deployment domain + localhost for dev */
const ALLOWED_ORIGINS = new Set([
  'https://jumpcontact-platform.vercel.app',
  'https://jump-contact-dashboard-burke-5005s-projects.vercel.app',
  process.env.NEXT_PUBLIC_APP_URL,
  'http://localhost:3003',
].filter(Boolean));

function getCorsOrigin(request: NextRequest): string | null {
  const origin = request.headers.get('origin');
  if (!origin) return null;
  // Allow any *.vercel.app preview deployment
  if (origin.endsWith('.vercel.app')) return origin;
  return ALLOWED_ORIGINS.has(origin) ? origin : null;
}

function withCors(request: NextRequest, response: NextResponse): NextResponse {
  if (!request.nextUrl.pathname.startsWith('/api/')) return response;
  const origin = getCorsOrigin(request);
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Vary', 'Origin');
  }
  return response;
}

export default clerkMiddleware(async (auth, req) => {
  // CORS preflight
  if (req.method === 'OPTIONS' && req.nextUrl.pathname.startsWith('/api/')) {
    const origin = getCorsOrigin(req);
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': origin || '',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin',
      },
    });
  }

  // Public routes — no auth
  if (isPublicRoute(req)) {
    return withCors(req, NextResponse.next());
  }

  // Protected routes — redirect to sign-in if unauthenticated
  await auth.protect({
    unauthenticatedUrl: new URL('/sign-in', req.url).toString(),
  });

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
