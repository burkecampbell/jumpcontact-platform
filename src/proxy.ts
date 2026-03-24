import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * JumpContact Platform middleware — Cognito auth for pages, CORS for /api/*.
 * Auth callback/logout routes are always public.
 */

const TOKEN_COOKIE = 'jc_id_token';
const REFRESH_COOKIE = 'jc_refresh_token';

const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID ?? '';
const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN ?? '';

function isPublicRoute(pathname: string): boolean {
  return pathname.startsWith('/api/auth/');
}

function buildLoginRedirect(req: NextRequest): string {
  const redirectUri = `${req.nextUrl.origin}/api/auth/callback`;
  const params = new URLSearchParams({
    client_id: COGNITO_CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: redirectUri,
  });
  return `https://${COGNITO_DOMAIN}/login?${params.toString()}`;
}

function withCors(request: NextRequest, response: NextResponse): NextResponse {
  if (!request.nextUrl.pathname.startsWith('/api/')) return response;
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

export default async function middleware(req: NextRequest): Promise<NextResponse> {
  // CORS preflight
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

  // Public auth routes — no auth check
  if (isPublicRoute(req.nextUrl.pathname)) {
    return withCors(req, NextResponse.next());
  }

  // API data routes get CORS headers, no page-level auth
  if (req.nextUrl.pathname.startsWith('/api/')) {
    return withCors(req, NextResponse.next());
  }

  // Skip auth if Cognito isn't configured (local dev)
  if (!COGNITO_CLIENT_ID || !COGNITO_DOMAIN) {
    return NextResponse.next();
  }

  const token = req.cookies.get(TOKEN_COOKIE)?.value;

  if (!token) {
    return NextResponse.redirect(buildLoginRedirect(req));
  }

  // Lightweight expiry check
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('malformed');
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      const refreshToken = req.cookies.get(REFRESH_COOKIE)?.value;
      if (!refreshToken) {
        return NextResponse.redirect(buildLoginRedirect(req));
      }

      try {
        const tokenUrl = `https://${COGNITO_DOMAIN}/oauth2/token`;
        const body = new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: COGNITO_CLIENT_ID,
          refresh_token: refreshToken,
        });
        const refreshRes = await fetch(tokenUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString(),
        });

        if (!refreshRes.ok) {
          return NextResponse.redirect(buildLoginRedirect(req));
        }

        const newTokens = await refreshRes.json();
        const response = NextResponse.next();
        response.cookies.set(TOKEN_COOKIE, newTokens.id_token, {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
          maxAge: newTokens.expires_in,
        });
        return response;
      } catch {
        return NextResponse.redirect(buildLoginRedirect(req));
      }
    }
  } catch {
    return NextResponse.redirect(buildLoginRedirect(req));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
