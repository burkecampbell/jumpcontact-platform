import { NextRequest, NextResponse } from 'next/server';
import {
  buildLogoutUrl,
  TOKEN_COOKIE,
  REFRESH_COOKIE,
} from '@/lib/auth/cognito';

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const logoutUrl = buildLogoutUrl(origin);

  const response = NextResponse.redirect(logoutUrl);

  // Clear auth cookies
  response.cookies.set(TOKEN_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  response.cookies.set(REFRESH_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });

  return response;
}
