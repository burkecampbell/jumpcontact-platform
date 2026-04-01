/**
 * Recording Backfill — Pull ALL recordings from Twilio, map to clients
 *
 * Twilio retains recordings based on account settings (default: unlimited).
 * This script paginates through ALL recordings on the account, maps each
 * to a call SID, identifies the client via from/to phone numbers, and
 * outputs:
 *   1. A new recording-map.ts with ALL CA→RE pairs
 *   2. A JSON manifest with full metadata (date, client, duration, URL)
 *   3. A summary report
 *
 * Usage: node scripts/backfill-recordings.cjs
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────────────────────
const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

if (!ACCOUNT_SID || !AUTH_TOKEN) {
  console.error('Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN env vars');
  process.exit(1);
}

const AUTH = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64');
const clients = require(path.resolve(__dirname, '../src/data/clients.json'));

// Build phone→client lookup from clients.json
const phoneToClient = {};
const phoneToBrand = {};
for (const [phone, name] of Object.entries(clients.clients)) {
  phoneToClient[phone] = name;
  phoneToBrand[phone] = clients.brands[phone] || clients.clientBrands[name] || 'jc';
}

// ── Twilio API helper ───────────────────────────────────────────────────
function twilioGet(urlPath, retries = 3) {
  return new Promise((resolve, reject) => {
    const isFullUrl = urlPath.startsWith('https://');
    const options = isFullUrl ? {
      hostname: new URL(urlPath).hostname,
      path: new URL(urlPath).pathname + new URL(urlPath).search,
      headers: { Authorization: `Basic ${AUTH}` },
    } : {
      hostname: 'api.twilio.com',
      path: urlPath,
      headers: { Authorization: `Basic ${AUTH}` },
    };

    const req = https.get(options, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode === 429 || res.statusCode >= 500) {
          if (retries > 0) {
            const delay = res.statusCode === 429 ? 5000 : 2000;
            console.log(`  ⏳ ${res.statusCode} — retrying in ${delay/1000}s...`);
            setTimeout(() => twilioGet(urlPath, retries - 1).then(resolve).catch(reject), delay);
            return;
          }
          reject(new Error(`Twilio ${res.statusCode}: ${data.substring(0, 200)}`));
          return;
        }
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`Parse error: ${data.substring(0, 200)}`)); }
      });
    });
    req.on('error', (e) => {
      if (retries > 0) {
        setTimeout(() => twilioGet(urlPath, retries - 1).then(resolve).catch(reject), 2000);
      } else reject(e);
    });
    req.end();
  });
}

// ── Phase 1: Pull ALL recordings ────────────────────────────────────────
async function fetchAllRecordings() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  RECORDING BACKFILL — Full Twilio Account Scan');
  console.log('═══════════════════════════════════════════════════════\n');

  // First, get the oldest recording to know our date range
  console.log('Phase 1: Discovering recording date range...');
  const probe = await twilioGet(
    `/2010-04-01/Accounts/${ACCOUNT_SID}/Recordings.json?PageSize=1`
  );
  console.log(`  Total recordings in Twilio (estimated from first page): scanning...`);

  // Now fetch ALL recordings, paginating forward
  const allRecordings = [];
  let nextUrl = `/2010-04-01/Accounts/${ACCOUNT_SID}/Recordings.json?PageSize=1000`;
  let page = 0;

  while (nextUrl) {
    page++;
    const res = await twilioGet(nextUrl);
    const recs = res.recordings || [];
    allRecordings.push(...recs);

    if (page % 5 === 0 || recs.length < 1000) {
      const oldest = recs.length > 0 ? recs[recs.length - 1].date_created : 'n/a';
      console.log(`  Page ${page}: ${allRecordings.length} total recordings so far (oldest on page: ${oldest})`);
    }

    nextUrl = res.next_page_uri || null;
  }

  console.log(`\n✓ Fetched ${allRecordings.length} total recordings from Twilio`);

  if (allRecordings.length === 0) {
    console.log('No recordings found. Exiting.');
    process.exit(0);
  }

  const oldest = allRecordings[allRecordings.length - 1].date_created;
  const newest = allRecordings[0].date_created;
  console.log(`  Date range: ${oldest} → ${newest}`);

  return allRecordings;
}

// ── Phase 2: Look up call details to map to clients ─────────────────────
async function mapRecordingsToClients(recordings) {
  console.log('\nPhase 2: Mapping recordings to clients via call SIDs...');

  // Build CA→RE map immediately (no API calls needed)
  const caReMap = {};
  for (const rec of recordings) {
    if (rec.call_sid) {
      caReMap[rec.call_sid] = rec.sid;
    }
  }
  console.log(`  Built CA→RE map: ${Object.keys(caReMap).length} pairs`);

  // Get unique call SIDs we need to look up
  const uniqueCallSids = [...new Set(recordings.map(r => r.call_sid).filter(Boolean))];
  console.log(`  Unique call SIDs to resolve: ${uniqueCallSids.length}`);

  // Batch lookup calls to get from/to phone numbers
  const callDetails = {};
  const BATCH = 20; // concurrent lookups
  let resolved = 0;
  let errors = 0;

  for (let i = 0; i < uniqueCallSids.length; i += BATCH) {
    const batch = uniqueCallSids.slice(i, i + BATCH);
    const promises = batch.map(sid =>
      twilioGet(`/2010-04-01/Accounts/${ACCOUNT_SID}/Calls/${sid}.json`)
        .then(call => {
          callDetails[sid] = {
            from: call.from,
            to: call.to,
            direction: call.direction,
            duration: parseInt(call.duration) || 0,
            dateCreated: call.date_created,
            startTime: call.start_time,
            parentCallSid: call.parent_call_sid || null,
          };
          resolved++;
        })
        .catch(e => {
          errors++;
          // Call might have been deleted — skip it
        })
    );
    await Promise.all(promises);

    if ((i + BATCH) % 200 === 0 || i + BATCH >= uniqueCallSids.length) {
      console.log(`  Resolved ${resolved}/${uniqueCallSids.length} calls (${errors} errors)`);
    }
  }

  // For calls that are child legs (direction=outbound-dial), look up the parent
  const childCalls = Object.entries(callDetails)
    .filter(([_, d]) => d.parentCallSid && d.direction === 'outbound-dial');

  if (childCalls.length > 0) {
    console.log(`\n  Resolving ${childCalls.length} parent calls for child legs...`);
    const parentSids = [...new Set(childCalls.map(([_, d]) => d.parentCallSid))];

    for (let i = 0; i < parentSids.length; i += BATCH) {
      const batch = parentSids.slice(i, i + BATCH);
      const promises = batch.map(sid => {
        if (callDetails[sid]) return Promise.resolve(); // already have it
        return twilioGet(`/2010-04-01/Accounts/${ACCOUNT_SID}/Calls/${sid}.json`)
          .then(call => {
            callDetails[sid] = {
              from: call.from,
              to: call.to,
              direction: call.direction,
              duration: parseInt(call.duration) || 0,
              dateCreated: call.date_created,
              startTime: call.start_time,
              parentCallSid: call.parent_call_sid || null,
            };
          })
          .catch(() => {});
      });
      await Promise.all(promises);
    }
  }

  // Now map each recording to a client
  const manifest = [];
  let mapped = 0, unmapped = 0;

  for (const rec of recordings) {
    const callSid = rec.call_sid;
    const call = callDetails[callSid];

    let clientName = null;
    let brand = null;
    let trunkPhone = null;

    if (call) {
      // For inbound calls, the trunk phone is the "to" field
      // For outbound-dial (child leg), check the parent call
      if (call.direction === 'inbound') {
        trunkPhone = call.to;
      } else if (call.direction === 'outbound-dial' && call.parentCallSid) {
        const parent = callDetails[call.parentCallSid];
        if (parent) {
          trunkPhone = parent.to || parent.from;
        }
      } else if (call.direction === 'outbound-api') {
        trunkPhone = call.from;
      }

      // Try to match trunk phone to client
      if (trunkPhone && phoneToClient[trunkPhone]) {
        clientName = phoneToClient[trunkPhone];
        brand = phoneToBrand[trunkPhone];
        mapped++;
      } else {
        // Try the other phone number
        const altPhone = call.direction === 'inbound' ? call.from : call.to;
        if (phoneToClient[altPhone]) {
          clientName = phoneToClient[altPhone];
          brand = phoneToBrand[altPhone];
          trunkPhone = altPhone;
          mapped++;
        } else {
          unmapped++;
        }
      }
    } else {
      unmapped++;
    }

    manifest.push({
      recordingSid: rec.sid,
      callSid: callSid,
      date: rec.date_created ? rec.date_created.split('T')[0] : null,
      dateCreated: rec.date_created,
      duration: parseInt(rec.duration) || 0,
      channels: rec.channels,
      client: clientName,
      brand: brand,
      trunkPhone: trunkPhone,
      direction: call ? call.direction : null,
      from: call ? call.from : null,
      to: call ? call.to : null,
    });
  }

  console.log(`\n✓ Mapping complete: ${mapped} mapped, ${unmapped} unmapped`);
  return { caReMap, manifest };
}

// ── Phase 3: Generate outputs ───────────────────────────────────────────
function generateOutputs(caReMap, manifest) {
  console.log('\nPhase 3: Generating output files...\n');

  const outputDir = path.resolve(__dirname, '../scripts/output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  // 1. Full manifest JSON
  const manifestPath = path.join(outputDir, 'recording-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`  ✓ Manifest: ${manifestPath} (${manifest.length} recordings)`);

  // 2. New recording-map.ts
  const mapEntries = Object.entries(caReMap)
    .sort(([a], [b]) => a.localeCompare(b));

  let mapTs = `// Auto-generated recording map — full Twilio backfill\n`;
  mapTs += `// Generated: ${new Date().toISOString()}\n`;
  mapTs += `// Total: ${mapEntries.length} recordings\n`;
  mapTs += `export const RECORDING_MAP: Record<string, string> = {\n`;
  for (const [ca, re] of mapEntries) {
    mapTs += `  '${ca}': '${re}',\n`;
  }
  mapTs += `};\n`;

  const mapPath = path.join(outputDir, 'recording-map-full.ts');
  fs.writeFileSync(mapPath, mapTs);
  console.log(`  ✓ Recording map: ${mapPath} (${mapEntries.length} pairs)`);

  // 3. Summary report
  const byMonth = {};
  const byClient = {};
  const byBrand = { jc: 0, msc: 0, unknown: 0 };
  let oldestDate = null, newestDate = null;

  for (const rec of manifest) {
    const date = rec.date || 'unknown';
    const month = date.length >= 7 ? date.substring(0, 7) : 'unknown';
    byMonth[month] = (byMonth[month] || 0) + 1;

    const client = rec.client || 'Unmapped';
    byClient[client] = (byClient[client] || 0) + 1;

    if (rec.brand) byBrand[rec.brand]++;
    else byBrand.unknown++;

    if (!oldestDate || date < oldestDate) oldestDate = date;
    if (!newestDate || date > newestDate) newestDate = date;
  }

  let report = '';
  report += '═══════════════════════════════════════════════════════\n';
  report += '  RECORDING BACKFILL REPORT\n';
  report += '═══════════════════════════════════════════════════════\n\n';
  report += `Date range:      ${oldestDate} → ${newestDate}\n`;
  report += `Total recordings: ${manifest.length}\n`;
  report += `Mapped to client: ${manifest.filter(r => r.client).length}\n`;
  report += `Unmapped:         ${manifest.filter(r => !r.client).length}\n`;
  report += `JC brand:         ${byBrand.jc}\n`;
  report += `MSC brand:        ${byBrand.msc}\n`;
  report += `Unknown brand:    ${byBrand.unknown}\n\n`;

  report += '── By Month ───────────────────────────────────────────\n';
  const sortedMonths = Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b));
  for (const [month, count] of sortedMonths) {
    report += `  ${month}:  ${String(count).padStart(6)} recordings\n`;
  }

  report += '\n── By Client (top 30) ─────────────────────────────────\n';
  const sortedClients = Object.entries(byClient)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 30);
  for (const [client, count] of sortedClients) {
    report += `  ${client.padEnd(35)} ${String(count).padStart(6)}\n`;
  }

  const reportPath = path.join(outputDir, 'backfill-report.txt');
  fs.writeFileSync(reportPath, report);
  console.log(`  ✓ Report: ${reportPath}`);
  console.log('\n' + report);

  // 4. Save progress checkpoint (in case we need to resume)
  const checkpointPath = path.join(outputDir, 'backfill-checkpoint.json');
  fs.writeFileSync(checkpointPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalRecordings: manifest.length,
    dateRange: { oldest: oldestDate, newest: newestDate },
    caReMapCount: Object.keys(caReMap).length,
  }));
  console.log(`  ✓ Checkpoint: ${checkpointPath}`);

  return { byMonth, byClient, byBrand, oldestDate, newestDate };
}

// ── Main ────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();

  const recordings = await fetchAllRecordings();
  const { caReMap, manifest } = await mapRecordingsToClients(recordings);
  const summary = generateOutputs(caReMap, manifest);

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\nDone in ${elapsed} minutes.`);
  console.log(`\nNext steps:`);
  console.log(`  1. Copy recording-map-full.ts → client-dashboard/lib/recording-map.ts`);
  console.log(`  2. Deploy client-dashboard to pick up new recordings`);
  console.log(`  3. Verify recordings play on dashboard`);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
