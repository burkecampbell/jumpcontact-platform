#!/usr/bin/env npx tsx
/**
 * verify-env.ts — Backend Health Checker
 *
 * Verifies that all required env vars exist AND that the services they
 * connect to are actually responding. Run this after every deploy,
 * env var change, or new Vercel project setup.
 *
 * Usage:
 *   npx tsx scripts/verify-env.ts              # check local .env
 *   npx tsx scripts/verify-env.ts --url <url>  # check a deployed URL
 *
 * Exit codes:
 *   0 = all checks passed
 *   1 = one or more checks failed
 */

const REQUIRED_VARS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_WORKSPACE_SID',
  'GOOGLE_SERVICE_ACCOUNT_EMAIL',
  'GOOGLE_PRIVATE_KEY',
] as const;

const DEPLOY_URLS: Record<string, string> = {
  'current':  'https://morning-dashboard-gilt-six.vercel.app',
  'stable':   'https://morning-dashboard-stable.vercel.app',
  'platform': 'https://jumpcontact-platform.vercel.app',
};

// ── Colors ──────────────────────────────────────────────────────────────
const R = '\x1b[31m';
const G = '\x1b[32m';
const Y = '\x1b[33m';
const C = '\x1b[36m';
const D = '\x1b[0m';

const ok   = (msg: string) => console.log(`  ${G}✓${D} ${msg}`);
const fail = (msg: string) => console.log(`  ${R}✗${D} ${msg}`);
const warn = (msg: string) => console.log(`  ${Y}⚠${D} ${msg}`);
const info = (msg: string) => console.log(`  ${C}→${D} ${msg}`);

let failures = 0;

// ── 1. Check env vars exist ─────────────────────────────────────────────
async function checkEnvVars(): Promise<void> {
  console.log(`\n${C}[ENV VARS]${D} Checking required environment variables...\n`);

  for (const key of REQUIRED_VARS) {
    const val = process.env[key];
    if (!val) {
      fail(`${key} — MISSING`);
      failures++;
    } else if (val.trim() !== val) {
      warn(`${key} — has leading/trailing whitespace (${val.length} chars)`);
      // Trailing newlines in emails cause Google API to fail
      if (key === 'GOOGLE_SERVICE_ACCOUNT_EMAIL' && val.includes('\n')) {
        fail(`${key} — contains newline character! This WILL break Google API auth.`);
        failures++;
      }
    } else {
      const preview = key.includes('KEY') || key.includes('TOKEN')
        ? `${val.slice(0, 8)}...${val.slice(-4)}`
        : val;
      ok(`${key} = ${preview}`);
    }
  }
}

// ── 2. Test Twilio API ──────────────────────────────────────────────────
async function checkTwilio(): Promise<void> {
  console.log(`\n${C}[TWILIO]${D} Testing Twilio API connection...\n`);

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const wsSid = process.env.TWILIO_WORKSPACE_SID;

  if (!sid || !token) {
    fail('Cannot test Twilio — missing SID or AUTH_TOKEN');
    failures++;
    return;
  }

  const auth = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');

  // Test account API
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
      headers: { Authorization: auth },
    });
    if (res.ok) {
      const data = await res.json() as { friendly_name?: string; status?: string };
      ok(`Account: ${data.friendly_name} (${data.status})`);
    } else {
      fail(`Account API returned ${res.status}: ${res.statusText}`);
      failures++;
    }
  } catch (err) {
    fail(`Account API error: ${err instanceof Error ? err.message : err}`);
    failures++;
  }

  // Test TaskRouter (workspace)
  if (wsSid) {
    try {
      const res = await fetch(
        `https://taskrouter.twilio.com/v1/Workspaces/${wsSid}`,
        { headers: { Authorization: auth } },
      );
      if (res.ok) {
        const data = await res.json() as { friendly_name?: string };
        ok(`Workspace: ${data.friendly_name}`);
      } else {
        fail(`TaskRouter API returned ${res.status}`);
        failures++;
      }
    } catch (err) {
      fail(`TaskRouter error: ${err instanceof Error ? err.message : err}`);
      failures++;
    }
  }
}

// ── 3. Test Google Sheets API ───────────────────────────────────────────
async function checkGoogle(): Promise<void> {
  console.log(`\n${C}[GOOGLE]${D} Testing Google Sheets API connection...\n`);

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !key) {
    fail('Cannot test Google — missing SERVICE_ACCOUNT_EMAIL or PRIVATE_KEY');
    failures++;
    return;
  }

  try {
    // Import jose for JWT creation
    const { SignJWT, importPKCS8 } = await import('jose');

    const now = Math.floor(Date.now() / 1000);
    const cleanKey = key.replace(/\\n/g, '\n');
    const privateKey = await importPKCS8(cleanKey, 'RS256');

    const jwt = await new SignJWT({
      iss: email,
      scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
      .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
      .sign(privateKey);

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });

    if (tokenRes.ok) {
      ok(`Google OAuth token obtained successfully`);

      // Try to read the conversions sheet as a real test
      const tokenData = await tokenRes.json() as { access_token: string };
      const sheetId = 'YOUR_SHEET_ID';
      const sheetRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title`,
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
      );
      if (sheetRes.ok) {
        const sheet = await sheetRes.json() as { properties?: { title?: string } };
        ok(`Sheets API: "${sheet.properties?.title}" accessible`);
      } else {
        warn(`Sheets API returned ${sheetRes.status} (token works, sheet access issue)`);
      }
    } else {
      const err = await tokenRes.json() as { error_description?: string };
      fail(`Google OAuth failed: ${err.error_description || tokenRes.status}`);
      failures++;
    }
  } catch (err) {
    fail(`Google auth error: ${err instanceof Error ? err.message : err}`);
    failures++;
  }
}

// ── 4. Test deployed URLs ───────────────────────────────────────────────
async function checkDeployedUrl(url: string): Promise<void> {
  console.log(`\n${C}[DEPLOY]${D} Testing deployed URL: ${url}\n`);

  // Check API endpoint
  const apiUrl = url.includes('morning-dashboard')
    ? `${url}/api/dashboard`
    : `${url}/api/calls?date=2026-03-09`;

  try {
    const res = await fetch(apiUrl);
    const data = await res.json() as Record<string, unknown>;

    if (data.error) {
      fail(`API returned error: ${data.error}`);
      failures++;
    } else if (res.ok) {
      if (data.todayConversions !== undefined) {
        ok(`Morning Dashboard API — ${data.todayConversions} conversions today, ${data.mtdConversions} MTD`);
      } else if (data.calls !== undefined) {
        ok(`Calls API — ${(data.calls as unknown[]).length} calls returned`);
      } else {
        ok(`API responded with ${Object.keys(data).length} fields`);
      }
    } else {
      fail(`API returned status ${res.status}`);
      failures++;
    }
  } catch (err) {
    fail(`Fetch error: ${err instanceof Error ? err.message : err}`);
    failures++;
  }
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${C}JumpContact Backend Health Check${D}`);
  console.log(`${'═'.repeat(60)}`);

  const args = process.argv.slice(2);
  const urlArg = args.indexOf('--url');

  if (urlArg !== -1 && args[urlArg + 1]) {
    // Remote check mode — just hit the URL
    const url = args[urlArg + 1];
    const resolved = DEPLOY_URLS[url] || url;
    await checkDeployedUrl(resolved);
  } else if (args.includes('--all-deploys')) {
    // Check all known deployments
    for (const [name, url] of Object.entries(DEPLOY_URLS)) {
      info(`Checking ${name}...`);
      await checkDeployedUrl(url);
    }
  } else {
    // Full local check
    await checkEnvVars();
    await checkTwilio();
    await checkGoogle();

    // Also check deployed URLs if requested
    if (args.includes('--deployed')) {
      for (const [name, url] of Object.entries(DEPLOY_URLS)) {
        info(`Checking ${name}...`);
        await checkDeployedUrl(url);
      }
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  if (failures === 0) {
    console.log(`  ${G}ALL CHECKS PASSED${D} ✓\n`);
    process.exit(0);
  } else {
    console.log(`  ${R}${failures} CHECK(S) FAILED${D} ✗\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
