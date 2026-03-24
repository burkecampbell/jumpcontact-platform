import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCodeForTokens,
  TOKEN_COOKIE,
  REFRESH_COOKIE,
} from '@/lib/auth/cognito';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
  }

  // Build redirect URI that matches the one registered in Cognito
  const redirectUri = `${req.nextUrl.origin}/api/auth/callback`;

  try {
    const tokens = await exchangeCodeForTokens(code, redirectUri);

    const response = NextResponse.redirect(new URL('/', req.url));

    // Set ID token as HttpOnly cookie
    response.cookies.set(TOKEN_COOKIE, tokens.id_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: tokens.expires_in,
    });

    // Store refresh token if provided
    if (tokens.refresh_token) {
      response.cookies.set(REFRESH_COOKIE, tokens.refresh_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });
    }

    return response;
  } catch (err) {
    console.error('Cognito callback error:', err);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 },
    );
  }
}
