/**
 * Cognito JWT verification for Jump Contact internal dashboards.
 *
 * Uses aws-jwt-verify to validate ID tokens from the Cognito hosted UI.
 * Env vars (non-AWS_ prefix for Amplify compatibility):
 *   COGNITO_POOL_ID, COGNITO_CLIENT_ID, COGNITO_DOMAIN
 */

import { CognitoJwtVerifier } from 'aws-jwt-verify';

/* ------------------------------------------------------------------ */
/*  Configuration                                                      */
/* ------------------------------------------------------------------ */

export const COGNITO_POOL_ID = process.env.COGNITO_POOL_ID ?? '';
export const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID ?? '';
export const COGNITO_DOMAIN = process.env.COGNITO_DOMAIN ?? '';
export const COGNITO_REGION = COGNITO_POOL_ID.split('_')[0] || 'us-east-1';

/** Name of the HttpOnly cookie that holds the ID token */
export const TOKEN_COOKIE = 'jc_id_token';
/** Name of the refresh-token cookie */
export const REFRESH_COOKIE = 'jc_refresh_token';

/* ------------------------------------------------------------------ */
/*  Verifier singleton                                                 */
/* ------------------------------------------------------------------ */

let _verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier() {
  if (!_verifier) {
    _verifier = CognitoJwtVerifier.create({
      userPoolId: COGNITO_POOL_ID,
      tokenUse: 'id',
      clientId: COGNITO_CLIENT_ID,
    });
  }
  return _verifier;
}

/* ------------------------------------------------------------------ */
/*  Token helpers                                                      */
/* ------------------------------------------------------------------ */

export interface CognitoTokenSet {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

/** Exchange an authorization code for tokens via the Cognito token endpoint. */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
): Promise<CognitoTokenSet> {
  const tokenUrl = `https://${COGNITO_DOMAIN}/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: COGNITO_CLIENT_ID,
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cognito token exchange failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<CognitoTokenSet>;
}

/** Refresh tokens using a refresh_token grant. */
export async function refreshTokens(
  refreshToken: string,
): Promise<CognitoTokenSet> {
  const tokenUrl = `https://${COGNITO_DOMAIN}/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: COGNITO_CLIENT_ID,
    refresh_token: refreshToken,
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Cognito token refresh failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<CognitoTokenSet>;
}

/** Verify a Cognito ID token. Returns the payload on success, null on failure. */
export async function verifyToken(token: string) {
  try {
    return await getVerifier().verify(token);
  } catch {
    return null;
  }
}

/** Build the Cognito hosted UI login URL. */
export function buildLoginUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: COGNITO_CLIENT_ID,
    response_type: 'code',
    scope: 'openid email profile',
    redirect_uri: redirectUri,
  });
  return `https://${COGNITO_DOMAIN}/login?${params.toString()}`;
}

/** Build the Cognito hosted UI logout URL. */
export function buildLogoutUrl(redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: COGNITO_CLIENT_ID,
    logout_uri: redirectUri,
  });
  return `https://${COGNITO_DOMAIN}/logout?${params.toString()}`;
}
