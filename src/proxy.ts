import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Clerk is optional — when CLERK_SECRET_KEY is missing (Amplify), skip auth.
const HAS_CLERK = !!(process.env.CLERK_SECRET_KEY);

function corsOnly(req: NextRequest): NextResponse {
  if (req.method === 'OPTIONS' && req.nextUrl.pathname.startsWith('/api/')) {
    return new NextResponse(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }
  const res = NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/api/')) {
    res.headers.set('Access-Control-Allow-Origin', '*');
    res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  return res;
}

let handler: (req: NextRequest) => NextResponse | Promise<NextResponse>;

if (HAS_CLERK) {
  const { clerkMiddleware, createRouteMatcher } = await import('@clerk/nextjs/server');
  const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/api/(.*)']);

  handler = clerkMiddleware(async (auth, req) => {
    if (req.method === 'OPTIONS' && req.nextUrl.pathname.startsWith('/api/')) {
      return corsOnly(req);
    }
    if (!isPublicRoute(req)) {
      await auth.protect();
    }
    return NextResponse.next();
  }) as unknown as typeof handler;
} else {
  handler = corsOnly;
}

export default handler;

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
