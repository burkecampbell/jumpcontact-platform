/**
 * Twilio Recordings — fetch recording SIDs for a given date.
 * Shared between the dashboard orchestrator and the /api/calls route.
 */

/**
 * Fetch all recordings for a date from Twilio and return a Set of CallSids that have recordings.
 */
export async function fetchRecordingSids(date: Date, auth: string): Promise<Set<string>> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const ds = date.toISOString().slice(0, 10);
  const sids = new Set<string>();

  let url: string | null =
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Recordings.json?DateCreated=${ds}&PageSize=1000`;

  while (url) {
    try {
      const res = await fetch(url, { headers: { Authorization: auth } });
      if (!res.ok) break;
      const data = await res.json() as {
        recordings?: { call_sid: string }[];
        next_page_uri?: string;
      };
      if (data.recordings) {
        for (const r of data.recordings) sids.add(r.call_sid);
      }
      url = data.next_page_uri ? `https://api.twilio.com${data.next_page_uri}` : null;
    } catch {
      break;
    }
  }
  return sids;
}
