/**
 * Twilio authentication and workspace config.
 */

export const WORKSPACE_SID = process.env.TWILIO_WORKSPACE_SID || '';

export function twilioAuth(): string | null {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}
