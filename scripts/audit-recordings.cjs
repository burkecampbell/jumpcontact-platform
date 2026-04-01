/**
 * Recording Audit — Full Picture from Spreadsheets
 * NO API calls. Sources:
 *   1. Clients Yesterday (62).xlsx — Flex Insights: calls + IB/OB minutes per client
 *   2. Sub-Accounts List-2026-04-01.csv — GHL outbound calls/minutes per sub-account
 *   3. recording-map.ts — 2,988 CA→RE static pairs
 *   4. jc_client_recordings.xlsx, msc_client_recordings.xlsx, all_client_recordings.xlsx
 *   5. clients.json — phone→client + brand mapping
 *
 * Usage: node scripts/audit-recordings.cjs
 */

var XLSX = require('xlsx');
var fs = require('fs');
var path = require('path');

var clients = require(path.resolve(__dirname, '../src/data/clients.json'));

// ── Parse talk time strings from Flex ───────────────────────────────────
function pm(t) {
  if (!t) return 0;
  var s = String(t);
  var m = s.match(/^(\d+)h\s+(\d+):(\d+)$/);
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / 60;
  m = s.match(/^(\d+):(\d+)$/);
  if (m) return parseInt(m[1]) + parseInt(m[2]) / 60;
  return 0;
}

function pad(s, w) { return String(s).substring(0, w).padEnd(w); }
function rpad(s, w) { return String(s).padStart(w); }

// ── 1. Parse Flex Insights ──────────────────────────────────────────────
console.log('RECORDING & MINUTES AUDIT — March 2026 (Full Month)');
console.log('Sources: Flex Insights, GHL Sub-Accounts CSV, Recording XLSX files\n');

console.log('1. Parsing Flex Insights (Clients Yesterday 62)...');
var flexPath = 'C:/Users/fuzzy/Downloads/Clients Yesterday (62).xlsx';
var wb1 = XLSX.readFile(flexPath);
var ws1 = wb1.Sheets[wb1.SheetNames[0]];
var flexData = XLSX.utils.sheet_to_json(ws1, { header: 1 });

var byClient = {};

for (var i = 3; i < flexData.length; i++) {
  var row = flexData[i];
  var phone = row[0];
  if (!phone || !String(phone).startsWith('+')) continue;
  var name = clients.clients[String(phone)] || 'Unknown (' + phone + ')';
  var brand = clients.brands[String(phone)] || clients.clientBrands[name] || '?';
  var totalMin = pm(row[1]);
  var totalCalls = parseInt(row[4]) || 0;
  var avgIB = pm(row[8]);
  var avgOB = pm(row[9]);

  // Split IB/OB using algebra
  var ibC = 0, obC = 0, ibM = 0, obM = 0;
  if (avgIB > 0 && avgOB > 0 && totalCalls > 0 && Math.abs(avgOB - avgIB) > 0.001) {
    obC = Math.round((totalMin - totalCalls * avgIB) / (avgOB - avgIB));
    obC = Math.max(0, Math.min(totalCalls, obC));
    ibC = totalCalls - obC;
    ibM = ibC * avgIB;
    obM = obC * avgOB;
  } else if (avgOB > 0 && avgIB === 0) { obC = totalCalls; obM = totalMin; }
  else { ibC = totalCalls; ibM = totalMin; }

  if (!byClient[name]) byClient[name] = { brand: brand, ibCalls: 0, ibMin: 0, obCalls: 0, obMin: 0, ghlObCalls: 0, ghlObMin: 0, recordings: 0 };
  byClient[name].ibCalls += ibC;
  byClient[name].ibMin += ibM;
  byClient[name].obCalls += obC;
  byClient[name].obMin += obM;
}

var flexClients = Object.keys(byClient).filter(function(n) { return !n.startsWith('Unknown'); });
console.log('  Clients matched: ' + flexClients.length);

// ── 2. Parse GHL Sub-Accounts CSV ───────────────────────────────────────
console.log('\n2. Parsing GHL Sub-Accounts CSV (8:39 PM March 31)...');

var ghlMap = {
  'ImageLab Med Spa (CST)': 'Image Lab Medspa',
  'Bella Med Spa': 'Bella Med Spa ATL',
  'Vida Weight Loss & Aesthetics | EST': 'Vida Weight Loss & Aesthetics',
  'Gambhir Cosmetic Medicine': 'Gambhir',
  'Bella NYC Aesthetics': 'Bella NYC Aesthetics',
  'Luminate Clinic | CST': 'Luminate Clinic',
  'Shelbi Aesthetics and Wellness': 'Shelbi Aesthetics & Wellness',
  'Hibiscus MedSpa': 'Hibiscus MedSpa',
  'House Call Hydration': 'House Call Hydration',
  'Rejuvenate Austin': 'Rejuvenate Austin',
  'Vital Balance 10 | EST': 'Vital Balance 10',
  'Esteem Medspa': 'Esteem Medspa',
  '6 Day Medical Weight Loss & Aesthetics | PST': '6 Day Medical Weight Loss',
  'Nava Med Spa': 'Nava Med Spa',
  'Zvia Weight Loss & Medspa': 'Zvia Weight Loss & Medspa',
  'Luxe Beauty Medspa': 'Luxe Beauty Medspa',
  'Med Spa Communications': 'Med Spa Communications',
  'I AM Wellness MD': 'I AM Medical Spas',
  'LuLu Aesthetics And Wellness': 'Lulu Aesthetics & Wellness',
  'On The Glow | PST': 'On The Glow',
  'K Beauty Xperience': 'K Beauty Xperience',
};

var csvPath = 'C:/Users/fuzzy/Downloads/Sub-Accounts List-2026-04-01.csv';
var csv = fs.readFileSync(csvPath, 'utf8');
var csvLines = csv.split('\n');

function parseCSVLine(line) {
  var r = [], c = '', q = false;
  for (var j = 0; j < line.length; j++) {
    if (line[j] === '"') { q = !q; }
    else if (line[j] === ',' && !q) { r.push(c.trim()); c = ''; }
    else { c += line[j]; }
  }
  r.push(c.trim());
  return r;
}

var ghlTotal = 0;
for (var i = 1; i < csvLines.length; i++) {
  if (!csvLines[i].trim()) continue;
  var cols = parseCSVLine(csvLines[i]);
  var ghlName = (cols[1] || '').replace(/^\s*Ω\s*/, '').trim();
  var ourName = ghlMap[ghlName] || ghlName;
  var obCalls = parseInt(cols[13]) || 0;
  var obHrs = parseFloat(cols[15]) || 0;
  var obMin = +(obHrs * 60).toFixed(1);

  if (obCalls > 0) {
    if (!byClient[ourName]) byClient[ourName] = { brand: 'msc', ibCalls: 0, ibMin: 0, obCalls: 0, obMin: 0, ghlObCalls: 0, ghlObMin: 0, recordings: 0 };
    byClient[ourName].ghlObCalls += obCalls;
    byClient[ourName].ghlObMin += obMin;
    ghlTotal += obMin;
  }
}
console.log('  GHL outbound total: ' + ghlTotal.toFixed(1) + ' minutes');

// ── 3. Count recordings per client from XLSX files ──────────────────────
console.log('\n3. Counting recordings from XLSX exports...');

// Name normalization map (XLSX sheet names → our client names)
var recNameMap = {
  'Gambhir Cosmetic Medicine': 'Gambhir',
  'Jacob Sapochnick': 'Jacob J. Sapochnick',
  'Plumber On Dem NEW 2026': 'Plumber On Demand',
  'Ibrahim Law Office EEE BRA HEEM': 'Ibrahim Law Office',
  'Divine Restoration Group': 'Divine Restoration',
  'Palm Coast Acupuncture and Chiroprac': 'Palm Coast Acupuncture',
  '6 Day Medical Weight Loss & Aes': '6 Day Medical Weight Loss',
  '6 Day Medical Weight Loss & Aestheti': '6 Day Medical Weight Loss',
  'Employee Retention ERS': 'Employee Retirement Services',
  'JDC Mechnical': 'JDC Mechanical',
  'Moes Plumbing and Heating': "Moe's Services",
  "Moe's Plumbing and Heating": "Moe's Services",
  'SOS Handy Man': 'SOS Handyman',
  'Solimon Rodgers Workmans Comp': 'Solimon Rodgers WC',
  'Convertable': 'ConvertAble Solutions',
  'ImageLab Medspa': 'Image Lab Medspa',
  'Luxe Beauty Medspa*': 'Luxe Beauty Medspa',
  ' Vida Weight Loss & Aesthetics': 'Vida Weight Loss & Aesthetics',
  'Med Spa Communications Main Line': 'Med Spa Communications',
  'Rundle College After Hours': 'Rundle College',
};

function countRecsFromXlsx(filePath, label) {
  if (!fs.existsSync(filePath)) { console.log('  ' + label + ': NOT FOUND'); return {}; }
  var wb = XLSX.readFile(filePath);
  var counts = {};
  for (var si = 0; si < wb.SheetNames.length; si++) {
    var sheetName = wb.SheetNames[si];
    if (sheetName === 'Summary' || sheetName === 'Needs Import') continue;
    var ws = wb.Sheets[sheetName];
    var rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // Find RE SIDs or count data rows
    var reCount = 0;
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (!row) continue;
      for (var c = 0; c < row.length; c++) {
        var val = String(row[c] || '');
        if (val.match(/^RE[a-f0-9]{32}$/)) { reCount++; break; }
      }
    }
    // If no RE SIDs found, count rows with CA SIDs
    if (reCount === 0) {
      for (var r = 1; r < rows.length; r++) {
        var row = rows[r];
        if (!row) continue;
        for (var c = 0; c < row.length; c++) {
          var val = String(row[c] || '');
          if (val.match(/^CA[a-f0-9]{32}$/)) { reCount++; break; }
        }
      }
    }

    var clientName = recNameMap[sheetName] || sheetName;
    if (sheetName === 'All Recordings' || sheetName === 'All JC Recordings') continue; // skip aggregates
    if (reCount > 0) {
      if (!counts[clientName]) counts[clientName] = 0;
      counts[clientName] += reCount;
    }
  }
  var total = Object.values(counts).reduce(function(a, b) { return a + b; }, 0);
  console.log('  ' + label + ': ' + total + ' recordings across ' + Object.keys(counts).length + ' clients');
  return counts;
}

var jcCounts = countRecsFromXlsx('C:/Users/fuzzy/Downloads/jc_client_recordings.xlsx', 'JC recordings');
var mscCounts = countRecsFromXlsx('C:/Users/fuzzy/Downloads/msc_client_recordings.xlsx', 'MSC recordings');
var allCounts = countRecsFromXlsx('C:/Users/fuzzy/Downloads/all_client_recordings.xlsx', 'All recordings');

// Merge recording counts (de-dup by taking max per client)
var recCountByClient = {};
function mergeRecs(counts) {
  for (var name in counts) {
    var normalized = recNameMap[name] || name;
    if (!recCountByClient[normalized]) recCountByClient[normalized] = 0;
    recCountByClient[normalized] = Math.max(recCountByClient[normalized], counts[name]);
  }
}
mergeRecs(jcCounts);
mergeRecs(mscCounts);
mergeRecs(allCounts);

// Apply to byClient
for (var name in recCountByClient) {
  if (!byClient[name]) byClient[name] = { brand: clients.clientBrands[name] || '?', ibCalls: 0, ibMin: 0, obCalls: 0, obMin: 0, ghlObCalls: 0, ghlObMin: 0, recordings: 0 };
  byClient[name].recordings = recCountByClient[name];
}

// Also count recording-map.ts total
console.log('  recording-map.ts: 2,988 entries (already included in XLSX sources)');

// ── 4. Output the full audit ────────────────────────────────────────────

console.log('\n' + '='.repeat(110));
console.log('  COMPLETE MARCH 2026 AUDIT — CALLS, MINUTES & RECORDINGS');
console.log('='.repeat(110));

// Sort: JC first, then MSC, then unknown; alphabetically within
var sortedClients = Object.keys(byClient)
  .filter(function(n) { return !n.startsWith('Unknown'); })
  .sort(function(a, b) {
    var ba = byClient[a].brand === 'jc' ? 0 : (byClient[a].brand === 'msc' ? 1 : 2);
    var bb = byClient[b].brand === 'jc' ? 0 : (byClient[b].brand === 'msc' ? 1 : 2);
    if (ba !== bb) return ba - bb;
    return a.localeCompare(b);
  });

console.log('\n' + pad('Client', 34) + rpad('IB Call', 8) + rpad('IB Min', 9) + rpad('OB Call', 8) + rpad('OB Min', 9) + rpad('GHL OB', 8) + rpad('GHL Min', 9) + rpad('Tot Call', 9) + rpad('Tot Min', 9) + rpad('Recs', 6) + rpad('Gap', 6));
console.log('-'.repeat(115));

var currentBrand = '';
var jcTotIBC = 0, jcTotIBM = 0, jcTotOBC = 0, jcTotOBM = 0, jcTotRec = 0, jcTotCalls = 0, jcTotMin = 0;
var mscTotIBC = 0, mscTotIBM = 0, mscTotOBC = 0, mscTotOBM = 0, mscTotGC = 0, mscTotGM = 0, mscTotRec = 0, mscTotCalls = 0, mscTotMin = 0;

for (var ci = 0; ci < sortedClients.length; ci++) {
  var cn = sortedClients[ci];
  var c = byClient[cn];
  var br = c.brand === 'jc' ? 'JC' : (c.brand === 'msc' ? 'MSC' : '??');

  if (br !== currentBrand) {
    currentBrand = br;
    console.log('--- ' + (br === 'JC' ? 'JUMP CONTACT' : 'MED SPA COMMUNICATIONS') + ' ---');
  }

  var totCalls = c.ibCalls + c.obCalls + c.ghlObCalls;
  var totMin = c.ibMin + c.obMin + c.ghlObMin;
  var gap = Math.max(0, (c.ibCalls + c.obCalls) - c.recordings); // gap only for Twilio calls (not GHL)

  console.log(pad(cn, 34) + rpad(c.ibCalls, 8) + rpad(c.ibMin.toFixed(1), 9) + rpad(c.obCalls, 8) + rpad(c.obMin.toFixed(1), 9) + rpad(c.ghlObCalls, 8) + rpad(c.ghlObMin.toFixed(1), 9) + rpad(totCalls, 9) + rpad(totMin.toFixed(1), 9) + rpad(c.recordings, 6) + rpad(gap, 6));

  if (c.brand === 'jc') {
    jcTotIBC += c.ibCalls; jcTotIBM += c.ibMin; jcTotOBC += c.obCalls; jcTotOBM += c.obMin;
    jcTotRec += c.recordings; jcTotCalls += totCalls; jcTotMin += totMin;
  } else {
    mscTotIBC += c.ibCalls; mscTotIBM += c.ibMin; mscTotOBC += c.obCalls; mscTotOBM += c.obMin;
    mscTotGC += c.ghlObCalls; mscTotGM += c.ghlObMin;
    mscTotRec += c.recordings; mscTotCalls += totCalls; mscTotMin += totMin;
  }
}

console.log('-'.repeat(115));
console.log(pad('JC SUBTOTAL', 34) + rpad(jcTotIBC, 8) + rpad(jcTotIBM.toFixed(1), 9) + rpad(jcTotOBC, 8) + rpad(jcTotOBM.toFixed(1), 9) + rpad(0, 8) + rpad('0.0', 9) + rpad(jcTotCalls, 9) + rpad(jcTotMin.toFixed(1), 9) + rpad(jcTotRec, 6) + rpad(Math.max(0, jcTotIBC + jcTotOBC - jcTotRec), 6));
console.log(pad('MSC SUBTOTAL', 34) + rpad(mscTotIBC, 8) + rpad(mscTotIBM.toFixed(1), 9) + rpad(mscTotOBC, 8) + rpad(mscTotOBM.toFixed(1), 9) + rpad(mscTotGC, 8) + rpad(mscTotGM.toFixed(1), 9) + rpad(mscTotCalls, 9) + rpad(mscTotMin.toFixed(1), 9) + rpad(mscTotRec, 6) + rpad(Math.max(0, mscTotIBC + mscTotOBC - mscTotRec), 6));

var grandCalls = jcTotCalls + mscTotCalls;
var grandMin = jcTotMin + mscTotMin;
var grandRec = jcTotRec + mscTotRec;
var grandTwilioCalls = jcTotIBC + jcTotOBC + mscTotIBC + mscTotOBC;
var grandGap = Math.max(0, grandTwilioCalls - grandRec);

console.log(pad('GRAND TOTAL', 34) + rpad(jcTotIBC + mscTotIBC, 8) + rpad((jcTotIBM + mscTotIBM).toFixed(1), 9) + rpad(jcTotOBC + mscTotOBC, 8) + rpad((jcTotOBM + mscTotOBM).toFixed(1), 9) + rpad(mscTotGC, 8) + rpad(mscTotGM.toFixed(1), 9) + rpad(grandCalls, 9) + rpad(grandMin.toFixed(1), 9) + rpad(grandRec, 6) + rpad(grandGap, 6));

// ── Summary box ─────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(110));
console.log('  RECORDING GAP SUMMARY');
console.log('='.repeat(110));
console.log('  Twilio calls (IB + OB from Flex):    ' + grandTwilioCalls.toLocaleString());
console.log('  Twilio IB calls:                     ' + (jcTotIBC + mscTotIBC).toLocaleString());
console.log('  Twilio IB minutes:                   ' + (jcTotIBM + mscTotIBM).toFixed(1));
console.log('  Twilio OB calls:                     ' + (jcTotOBC + mscTotOBC).toLocaleString());
console.log('  Twilio OB minutes:                   ' + (jcTotOBM + mscTotOBM).toFixed(1));
console.log('  GHL OB calls (MSC only):             ' + mscTotGC.toLocaleString());
console.log('  GHL OB minutes (MSC only):            ' + mscTotGM.toFixed(1));
console.log('  ─────────────────────────────────────');
console.log('  Recordings we have:                  ' + grandRec.toLocaleString());
console.log('  Twilio calls missing recording:      ' + grandGap.toLocaleString());
var coverPct = grandTwilioCalls > 0 ? ((grandRec / grandTwilioCalls) * 100).toFixed(1) : 'N/A';
console.log('  Recording coverage (Twilio only):    ' + coverPct + '%');
console.log('  (GHL outbound does NOT have Twilio recordings — that\'s expected)');

console.log('\nDone.');
