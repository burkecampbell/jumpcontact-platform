/**
 * Recording Gap Export — XLSX for backfill job
 * Creates a spreadsheet Burke can take to find missing recordings.
 *
 * All data from local spreadsheets only. No API calls.
 *
 * Usage: node scripts/recording-gap-export.cjs
 */

var XLSX = require('xlsx');
var fs = require('fs');
var path = require('path');

var clients = require(path.resolve(__dirname, '../src/data/clients.json'));

function pm(t) {
  if (!t) return 0;
  var s = String(t);
  var m = s.match(/^(\d+)h\s+(\d+):(\d+)$/);
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / 60;
  m = s.match(/^(\d+):(\d+)$/);
  if (m) return parseInt(m[1]) + parseInt(m[2]) / 60;
  return 0;
}

// ── Parse Flex Insights ─────────────────────────────────────────────────
var wb1 = XLSX.readFile('C:/Users/fuzzy/Downloads/Clients Yesterday (62).xlsx');
var ws1 = wb1.Sheets[wb1.SheetNames[0]];
var flexData = XLSX.utils.sheet_to_json(ws1, { header: 1 });

var byClient = {};
for (var i = 3; i < flexData.length; i++) {
  var row = flexData[i];
  var phone = row[0];
  if (!phone || !String(phone).startsWith('+')) continue;
  var name = clients.clients[String(phone)] || null;
  if (!name) continue;
  var brand = clients.clientBrands[name] || '?';
  var totalMin = pm(row[1]);
  var totalCalls = parseInt(row[4]) || 0;
  var avgIB = pm(row[8]);
  var avgOB = pm(row[9]);
  var abandoned = parseInt(row[15]) || 0;

  var ibC = 0, obC = 0, ibM = 0, obM = 0;
  if (avgIB > 0 && avgOB > 0 && totalCalls > 0 && Math.abs(avgOB - avgIB) > 0.001) {
    obC = Math.round((totalMin - totalCalls * avgIB) / (avgOB - avgIB));
    obC = Math.max(0, Math.min(totalCalls, obC));
    ibC = totalCalls - obC;
    ibM = ibC * avgIB;
    obM = obC * avgOB;
  } else if (avgOB > 0 && avgIB === 0) { obC = totalCalls; obM = totalMin; }
  else { ibC = totalCalls; ibM = totalMin; }

  if (!byClient[name]) byClient[name] = { brand: brand, phone: String(phone), ibCalls: 0, ibMin: 0, obCalls: 0, obMin: 0, abandoned: 0, recordings: 0, totalMin: 0 };
  byClient[name].ibCalls += ibC;
  byClient[name].ibMin += ibM;
  byClient[name].obCalls += obC;
  byClient[name].obMin += obM;
  byClient[name].abandoned += abandoned;
  byClient[name].totalMin += totalMin;
}

// ── Count recordings from XLSX exports ──────────────────────────────────
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

function countRecsFromXlsx(filePath) {
  if (!fs.existsSync(filePath)) return {};
  var wb = XLSX.readFile(filePath);
  var counts = {};
  for (var si = 0; si < wb.SheetNames.length; si++) {
    var sheetName = wb.SheetNames[si];
    if (sheetName === 'Summary' || sheetName === 'Needs Import' || sheetName === 'All Recordings' || sheetName === 'All JC Recordings') continue;
    var ws = wb.Sheets[sheetName];
    var rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    var reCount = 0;
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r];
      if (!row) continue;
      for (var c = 0; c < row.length; c++) {
        var val = String(row[c] || '');
        if (val.match(/^RE[a-f0-9]{32}$/) || val.match(/^CA[a-f0-9]{32}$/)) { reCount++; break; }
      }
    }
    var clientName = recNameMap[sheetName] || sheetName;
    if (reCount > 0) {
      if (!counts[clientName]) counts[clientName] = 0;
      counts[clientName] += reCount;
    }
  }
  return counts;
}

var jcC = countRecsFromXlsx('C:/Users/fuzzy/Downloads/jc_client_recordings.xlsx');
var mscC = countRecsFromXlsx('C:/Users/fuzzy/Downloads/msc_client_recordings.xlsx');
var allC = countRecsFromXlsx('C:/Users/fuzzy/Downloads/all_client_recordings.xlsx');

// Merge (take max per client)
for (var n in byClient) {
  var recs = Math.max(jcC[n] || 0, mscC[n] || 0, allC[n] || 0);
  byClient[n].recordings = recs;
}

// ── Build XLSX ──────────────────────────────────────────────────────────
var rows = [
  ['RECORDING GAP REPORT — MARCH 2026'],
  ['Calls that connected but have no recording — for backfill'],
  ['Source: Flex Insights "Clients Yesterday (62)" + Recording XLSX exports'],
  ['Generated: ' + new Date().toISOString().slice(0, 10)],
  [],
  ['Client', 'Brand', 'Trunk Phone', 'IB Calls', 'IB Min', 'OB Calls', 'OB Min', 'Total Calls', 'Total Min', 'Recordings Found', 'MISSING Recordings', 'Coverage %', 'Abandoned OB (not connected)'],
];

var sorted = Object.entries(byClient).sort(function(a, b) {
  if (a[1].brand !== b[1].brand) return a[1].brand === 'jc' ? -1 : 1;
  var gapA = a[1].ibCalls + a[1].obCalls - a[1].recordings;
  var gapB = b[1].ibCalls + b[1].obCalls - b[1].recordings;
  return gapB - gapA;
});

var jcGap = 0, mscGap = 0, jcTwCalls = 0, mscTwCalls = 0, jcRecs = 0, mscRecs = 0;
var currentBrand = '';

for (var i = 0; i < sorted.length; i++) {
  var cn = sorted[i][0];
  var c = sorted[i][1];
  var twCalls = c.ibCalls + c.obCalls;
  var gap = Math.max(0, twCalls - c.recordings);
  var coverPct = twCalls > 0 ? +((c.recordings / twCalls * 100).toFixed(1)) : 0;
  var br = c.brand === 'jc' ? 'JC' : 'MSC';

  if (br !== currentBrand) {
    currentBrand = br;
    rows.push([br === 'JC' ? '--- JUMP CONTACT ---' : '--- MED SPA COMMUNICATIONS ---']);
  }

  rows.push([cn, br, c.phone, c.ibCalls, +c.ibMin.toFixed(1), c.obCalls, +c.obMin.toFixed(1), twCalls, +c.totalMin.toFixed(1), c.recordings, gap, coverPct, c.abandoned]);

  if (c.brand === 'jc') { jcGap += gap; jcTwCalls += twCalls; jcRecs += c.recordings; }
  else { mscGap += gap; mscTwCalls += twCalls; mscRecs += c.recordings; }
}

rows.push([]);
rows.push(['JC SUBTOTAL', 'JC', '', '', '', '', '', jcTwCalls, '', jcRecs, jcGap, jcTwCalls > 0 ? +((jcRecs / jcTwCalls * 100).toFixed(1)) : 0]);
rows.push(['MSC SUBTOTAL', 'MSC', '', '', '', '', '', mscTwCalls, '', mscRecs, mscGap, mscTwCalls > 0 ? +((mscRecs / mscTwCalls * 100).toFixed(1)) : 0]);
rows.push(['GRAND TOTAL', '', '', '', '', '', '', jcTwCalls + mscTwCalls, '', jcRecs + mscRecs, jcGap + mscGap, (jcTwCalls + mscTwCalls) > 0 ? +(((jcRecs + mscRecs) / (jcTwCalls + mscTwCalls) * 100).toFixed(1)) : 0]);

var ws = XLSX.utils.aoa_to_sheet(rows);
ws['!cols'] = [
  { wch: 34 }, { wch: 5 }, { wch: 16 },
  { wch: 9 }, { wch: 10 }, { wch: 9 }, { wch: 10 },
  { wch: 11 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 16 }
];
ws['!merges'] = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: 12 } },
  { s: { r: 1, c: 0 }, e: { r: 1, c: 12 } },
  { s: { r: 2, c: 0 }, e: { r: 2, c: 12 } },
  { s: { r: 3, c: 0 }, e: { r: 3, c: 12 } },
];

var wbOut = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbOut, ws, 'Recording Gap');
var outPath = 'C:/Users/fuzzy/Downloads/Recording_Gap_March2026.xlsx';
XLSX.writeFile(wbOut, outPath);

console.log('Recording Gap XLSX saved: ' + outPath);
console.log('');
console.log('JC:    ' + jcTwCalls + ' Twilio calls, ' + jcRecs + ' recordings, ' + jcGap + ' missing (' + (jcTwCalls > 0 ? (jcRecs / jcTwCalls * 100).toFixed(1) : 0) + '% coverage)');
console.log('MSC:   ' + mscTwCalls + ' Twilio calls, ' + mscRecs + ' recordings, ' + mscGap + ' missing (' + (mscTwCalls > 0 ? (mscRecs / mscTwCalls * 100).toFixed(1) : 0) + '% coverage)');
console.log('TOTAL: ' + (jcTwCalls + mscTwCalls) + ' Twilio calls, ' + (jcRecs + mscRecs) + ' recordings, ' + (jcGap + mscGap) + ' missing');
console.log('');
console.log('NOTE: These are all CONNECTED conversations from Flex Insights.');
console.log('Missed/abandoned calls are excluded — Column M shows abandoned outbound for reference.');
console.log('GHL outbound (MSC) is NOT included — those calls live in GHL, not Twilio.');
