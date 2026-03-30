export function twilioAuth(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) throw new Error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
  return 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
}

export function twilioAccountSid(): string {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  if (!sid) throw new Error('Missing TWILIO_ACCOUNT_SID');
  return sid;
}

export const WORKSPACE_SID = process.env.TWILIO_WORKSPACE_SID || 'WSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
