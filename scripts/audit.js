var fs = require('fs');
var XLSX = require('xlsx');
var clients = require('../src/data/clients.json');

// Parse Flex sheet
var wb1 = XLSX.readFile('C:/Users/fuzzy/Downloads/Clients Yesterday (62).xlsx');
var ws1 = wb1.Sheets[wb1.SheetNames[0]];
var flexData = XLSX.utils.sheet_to_json(ws1, { header: 1 });

function pm(t) {
  if (!t) return 0;
  var s = String(t);
  var m = s.match(/^(\d+)h\s+(\d+):(\d+)$/);
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / 60;
  m = s.match(/^(\d+):(\d+)$/);
  if (m) return parseInt(m[1]) + parseInt(m[2]) / 60;
  return 0;
}

// Parse GHL CSV
var csv = fs.readFileSync('C:/Users/fuzzy/Downloads/Sub-Accounts List-2026-04-01.csv', 'utf8');
var csvLines = csv.split('\n');
function parseCSVLine(line) {
  var r = [], c = '', q = false;
  for (var i = 0; i < line.length; i++) {
    if (line[i] === '"') { q = !q; }
    else if (line[i] === ',' && !q) { r.push(c.trim()); c = ''; }
    else { c += line[i]; }
  }
  r.push(c.trim());
  return r;
}

// GHL name -> our client name
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

// Parse GHL
var ghlByClient = {};
for (var i = 1; i < csvLines.length; i++) {
  if (!csvLines[i].trim()) continue;
  var cols = parseCSVLine(csvLines[i]);
  var ghlName = (cols[1] || '').replace(/^\s*Ω\s*/, '').trim();
  var ourName = ghlMap[ghlName] || ghlName;
  var obCalls = parseInt(cols[13]) || 0;
  var obHrs = parseFloat(cols[15]) || 0;
  var ibCalls = parseInt(cols[12]) || 0;
  var ibHrs = parseFloat(cols[14]) || 0;
  if (obCalls > 0 || ibCalls > 0) {
    ghlByClient[ourName] = { obCalls: obCalls, obMin: +(obHrs * 60).toFixed(1), ibCalls: ibCalls, ibMin: +(ibHrs * 60).toFixed(1) };
  }
}

// Parse Flex - split IB/OB
var flexByClient = {};
for (var i = 3; i < flexData.length; i++) {
  var row = flexData[i];
  var phone = row[0];
  if (!phone || !String(phone).startsWith('+')) continue;
  var name = clients.clients[phone];
  if (!name) continue;
  var totalMin = pm(row[1]);
  var totalCalls = row[4] || 0;
  var avgIB = pm(row[8]);
  var avgOB = pm(row[9]);
  var ibC = 0, obC = 0, ibM = 0, obM = 0;
  if (avgIB > 0 && avgOB > 0 && totalCalls > 0 && Math.abs(avgOB - avgIB) > 0.001) {
    obC = Math.round((totalMin - totalCalls * avgIB) / (avgOB - avgIB));
    obC = Math.max(0, Math.min(totalCalls, obC));
    ibC = totalCalls - obC;
    ibM = ibC * avgIB;
    obM = obC * avgOB;
  } else if (avgOB > 0 && avgIB === 0) { obC = totalCalls; obM = totalMin; }
  else { ibC = totalCalls; ibM = totalMin; }
  if (!flexByClient[name]) flexByClient[name] = { ibC: 0, ibM: 0, obC: 0, obM: 0 };
  flexByClient[name].ibC += ibC;
  flexByClient[name].ibM += ibM;
  flexByClient[name].obC += obC;
  flexByClient[name].obM += obM;
}

// Merge
var all = {};
function ensure(n, br) { if (!all[n]) all[n] = { brand: br || '?', twiIBc: 0, twiIBm: 0, twiOBc: 0, twiOBm: 0, ghlOBc: 0, ghlOBm: 0 }; }
for (var n in flexByClient) {
  ensure(n, clients.clientBrands[n] || '?');
  all[n].twiIBc = flexByClient[n].ibC; all[n].twiIBm = flexByClient[n].ibM;
  all[n].twiOBc = flexByClient[n].obC; all[n].twiOBm = flexByClient[n].obM;
}
for (var n in ghlByClient) {
  ensure(n, clients.clientBrands[n] || 'msc');
  all[n].ghlOBc = ghlByClient[n].obCalls; all[n].ghlOBm = ghlByClient[n].obMin;
}

var sorted = Object.entries(all).sort(function (a, b) {
  if (a[1].brand !== b[1].brand) return a[1].brand === 'jc' ? -1 : 1;
  return a[0].localeCompare(b[0]);
});

// XLSX
var xlR = [
  ['JUMP CONTACT + MSC — COMPLETE MARCH 2026 AUDIT'],
  ['Twilio Inbound | Twilio Outbound | GHL Outbound — Per Client'],
  ['GHL: Sub-Accounts CSV 8:39 PM MT March 31 | Flex: Clients Yesterday (Month=THIS)'],
  [],
  ['Client', 'Brand', 'Twi IB Calls', 'Twi IB Min', 'Twi OB Calls', 'Twi OB Min', 'GHL OB Calls', 'GHL OB Min', 'TOTAL Calls', 'TOTAL Min'],
];

var jcIBm = 0, jcOBm = 0, mIBm = 0, mOBm = 0, mGOBm = 0;
sorted.forEach(function (e) {
  var n = e[0], c = e[1];
  var totC = c.twiIBc + c.twiOBc + c.ghlOBc;
  var totM = c.twiIBm + c.twiOBm + c.ghlOBm;
  xlR.push([n, c.brand.toUpperCase(), c.twiIBc, +c.twiIBm.toFixed(1), c.twiOBc, +c.twiOBm.toFixed(1), c.ghlOBc, +c.ghlOBm.toFixed(1), totC, +totM.toFixed(1)]);
  if (c.brand === 'jc') { jcIBm += c.twiIBm; jcOBm += c.twiOBm; }
  else { mIBm += c.twiIBm; mOBm += c.twiOBm; mGOBm += c.ghlOBm; }
});
xlR.push([]);
xlR.push(['JC SUBTOTAL', 'JC', '', +jcIBm.toFixed(1), '', +jcOBm.toFixed(1), 0, 0, '', +(jcIBm + jcOBm).toFixed(1)]);
xlR.push(['MSC SUBTOTAL', 'MSC', '', +mIBm.toFixed(1), '', +mOBm.toFixed(1), '', +mGOBm.toFixed(1), '', +(mIBm + mOBm + mGOBm).toFixed(1)]);
xlR.push(['GRAND TOTAL', '', '', +(jcIBm + mIBm).toFixed(1), '', +(jcOBm + mOBm).toFixed(1), '', +mGOBm.toFixed(1), '', +(jcIBm + jcOBm + mIBm + mOBm + mGOBm).toFixed(1)]);

var ws2 = XLSX.utils.aoa_to_sheet(xlR);
ws2['!cols'] = [{ wch: 32 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 11 }, { wch: 12 }];
ws2['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 9 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 9 } }, { s: { r: 2, c: 0 }, e: { r: 2, c: 9 } }];
var wbO = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbO, ws2, 'Full Audit');
XLSX.writeFile(wbO, 'C:/Users/fuzzy/Downloads/JC_MSC_March2026_Final_Audit.xlsx');

// Console
function f(s, w) { return String(s).substring(0, w).padEnd(w); }
function r(s, w) { return String(s).padStart(w); }
console.log('MINUTES BY CLIENT — MARCH 2026 (Final)');
console.log(f('Client', 32) + r('TwiIB', 8) + r('TwiOB', 8) + r('GHL OB', 8) + r('TOTAL', 9));
console.log('='.repeat(65));
var br = '';
sorted.forEach(function (e) {
  var n = e[0], c = e[1];
  if (c.brand !== br) { br = c.brand; console.log('--- ' + (br === 'jc' ? 'JUMP CONTACT' : 'MSC') + ' ---'); }
  var tot = c.twiIBm + c.twiOBm + c.ghlOBm;
  console.log(f(n, 32) + r(c.twiIBm.toFixed(0), 8) + r(c.twiOBm.toFixed(0), 8) + r(c.ghlOBm.toFixed(0), 8) + r(tot.toFixed(0), 9));
});
console.log('='.repeat(65));
console.log(f('JC', 32) + r(jcIBm.toFixed(0), 8) + r(jcOBm.toFixed(0), 8) + r('0', 8) + r((jcIBm + jcOBm).toFixed(0), 9));
console.log(f('MSC', 32) + r(mIBm.toFixed(0), 8) + r(mOBm.toFixed(0), 8) + r(mGOBm.toFixed(0), 8) + r((mIBm + mOBm + mGOBm).toFixed(0), 9));
console.log(f('GRAND TOTAL', 32) + r((jcIBm + mIBm).toFixed(0), 8) + r((jcOBm + mOBm).toFixed(0), 8) + r(mGOBm.toFixed(0), 8) + r((jcIBm + jcOBm + mIBm + mOBm + mGOBm).toFixed(0), 9));

// Delta from 9AM pull
console.log('\nGHL DELTA (9AM -> 8:39PM):');
var old = { 'Image Lab Medspa': 901.8, 'Bella Med Spa ATL': 399, 'Vida Weight Loss & Aesthetics': 244.8, 'Gambhir': 182.4, 'Bella NYC Aesthetics': 72, 'Luminate Clinic': 50.4, 'Shelbi Aesthetics & Wellness': 49.2, 'Hibiscus MedSpa': 47.4, 'House Call Hydration': 46.8, 'Rejuvenate Austin': 45.6, 'Vital Balance 10': 37.2, 'Esteem Medspa': 31.8, '6 Day Medical Weight Loss': 18.6, 'Nava Med Spa': 13.2, 'Zvia Weight Loss & Medspa': 13.2, 'Luxe Beauty Medspa': 5.4, 'Med Spa Communications': 0, 'I AM Medical Spas': 0, 'Lulu Aesthetics & Wellness': 0 };
for (var n in ghlByClient) {
  var now = ghlByClient[n].obMin;
  var prev = old[n] || 0;
  var diff = now - prev;
  if (Math.abs(diff) > 0.1) console.log('  ' + f(n, 32) + r(prev.toFixed(1), 8) + ' -> ' + r(now.toFixed(1), 8) + '  (' + (diff > 0 ? '+' : '') + diff.toFixed(1) + ')');
}

console.log('\nSaved: C:/Users/fuzzy/Downloads/JC_MSC_March2026_Final_Audit.xlsx');
