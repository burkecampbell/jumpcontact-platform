// ── Telegram Alert Utility ──────────────────────────────────────────

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export interface Alert {
  title: string;
  message: string;
  severity: 'warning' | 'critical';
}

/**
 * Send a single alert to Telegram.
 * No-ops gracefully if env vars aren't set.
 */
export async function sendAlert(alert: Alert): Promise<boolean> {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn('[Telegram] No TELEGRAM_BOT_TOKEN/CHAT_ID configured — skipping:', alert.title);
    return false;
  }

  const icon = alert.severity === 'critical' ? '\u{1F534}' : '\u{1F7E1}';
  const text = `${icon} <b>${escapeHtml(alert.title)}</b>\n\n${escapeHtml(alert.message)}\n\n<i>JC Platform Health Check</i>`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_notification: alert.severity !== 'critical',
      }),
    });
    if (!res.ok) {
      console.error('[Telegram] Send failed:', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Telegram] Send error:', err);
    return false;
  }
}

/**
 * Send multiple alerts. Returns count of successfully sent.
 */
export async function sendAlerts(alerts: Alert[]): Promise<number> {
  let sent = 0;
  for (const alert of alerts) {
    if (await sendAlert(alert)) sent++;
  }
  return sent;
}

/**
 * Send an all-clear summary (optional, called when no alerts).
 */
export async function sendAllClear(checks: Record<string, string>): Promise<boolean> {
  if (!BOT_TOKEN || !CHAT_ID) return false;

  const lines = Object.entries(checks).map(([k, v]) => `  ${k}: ${v}`).join('\n');
  const text = `\u{2705} <b>All Systems Healthy</b>\n\n<pre>${escapeHtml(lines)}</pre>\n\n<i>JC Platform Health Check</i>`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_notification: true,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
