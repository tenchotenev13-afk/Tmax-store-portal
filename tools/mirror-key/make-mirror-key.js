#!/usr/bin/env node
// make-mirror-key.js — ключ само за четене за огледалото на Живко.
//
// Подписва HS256 JWT с role=mirror_reader (ролята от mirror-reader-schema.sql)
// с JWT тайната на проекта, проверява го срещу живия проект и САМО при успех
// го записва в <папка>/mirror-key.txt (по подразбиране работния плот).
//
//   $env:SUPABASE_JWT_SECRET = '...'
//   node tools\mirror-key\make-mirror-key.js [папка]
//
// Тайната се чете само от env SUPABASE_JWT_SECRET и никъде не се печата или
// записва. Токенът не се печата — само се пише във файла. Печатат се само
// статуси и броеве. Без външни пакети (Node 18+, вграден fetch).
'use strict';

var crypto = require('crypto');
var fs = require('fs');
var path = require('path');
var os = require('os');

var SB_URL = 'https://xiwkdiqqplgdcrkewgtv.supabase.co';
var PROJECT_REF = 'xiwkdiqqplgdcrkewgtv';
// Публичният anon ключ (същият като SB_KEY в shared.js). Шлюзът на Supabase
// иска познат ключ в заглавния ред apikey; ролята идва от Authorization.
var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA';

var ROLE = 'mirror_reader';
var TABLES = [
  'kasa_reports', 'kasa_glavna', 'kasa_zoborot', 'kasa_documents',
  'kasa_storno', 'kasa_storno_items', 'daily_turnover', 'storage_files_index',
  'audit_log' // mirror-reader-audit-log-schema.sql (26.11.2026)
];
var BUCKET = 'kasa-docs';
var OTHER_BUCKET = 'docs';
var FORBIDDEN_TABLE = 'users';
var VALID_YEARS = 2;
var OUT_NAME = 'mirror-key.txt';
// Колона на kasa_reports (сверена в базата 25.11.2026) — виж г).
var PATCH_BODY = JSON.stringify({ status: 'mirror-check' });

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signToken(secret, nowSec) {
  var iat = nowSec;
  var expDate = new Date(nowSec * 1000);
  expDate.setUTCFullYear(expDate.getUTCFullYear() + VALID_YEARS);
  var exp = Math.floor(expDate.getTime() / 1000);
  var header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  var payload = b64url(JSON.stringify({ iss: 'supabase', ref: PROJECT_REF, role: ROLE, iat: iat, exp: exp }));
  var sig = b64url(crypto.createHmac('sha256', secret).update(header + '.' + payload).digest());
  return { token: header + '.' + payload + '.' + sig, exp: exp };
}

function headersFor(token) {
  return { apikey: ANON_KEY, Authorization: 'Bearer ' + token };
}

function encPath(p) {
  return String(p).split('/').map(encodeURIComponent).join('/');
}

// Самопроверка. Връща { ok, lines }. Нищо от данните не влиза в lines.
async function selfCheck(token, fetchFn) {
  var lines = [];
  var ok = true;
  function line(pass, text) {
    if (!pass) ok = false;
    lines.push((pass ? 'OK   ' : 'FAIL ') + text);
  }
  var H = headersFor(token);

  // а) четене на деветте → 200/206 + брой
  for (var i = 0; i < TABLES.length; i++) {
    var t = TABLES[i];
    try {
      var r = await fetchFn(SB_URL + '/rest/v1/' + t + '?select=*&limit=1', {
        method: 'GET',
        headers: Object.assign({ Prefer: 'count=exact' }, H)
      });
      var cr = r.headers && r.headers.get ? (r.headers.get('content-range') || '') : '';
      var total = cr.split('/')[1] || '?';
      line(r.status === 200 || r.status === 206, 'а) GET ' + t + ' → ' + r.status + ', редове: ' + total);
    } catch (e) {
      line(false, 'а) GET ' + t + ' → мрежова грешка');
    }
  }

  // б) сваляне на един файл от kasa-docs
  var fileName = null;
  try {
    var li = await fetchFn(SB_URL + '/rest/v1/storage_files_index?select=name&bucket_id=eq.' + BUCKET + '&limit=1', { method: 'GET', headers: H });
    if (li.status === 200) {
      var arr = await li.json();
      if (arr && arr.length) fileName = arr[0].name;
    }
  } catch (e) { /* отчита се долу */ }
  if (!fileName) {
    line(false, 'б) няма файл в ' + BUCKET + ' за проба');
  } else {
    try {
      var d = await fetchFn(SB_URL + '/storage/v1/object/authenticated/' + BUCKET + '/' + encPath(fileName), { method: 'GET', headers: H });
      var len = 0;
      if (d.status === 200 && d.arrayBuffer) len = (await d.arrayBuffer()).byteLength;
      line(d.status === 200, 'б) сваляне от ' + BUCKET + ' → ' + d.status + (d.status === 200 ? ', байта: ' + len : ''));
    } catch (e) {
      line(false, 'б) сваляне от ' + BUCKET + ' → мрежова грешка');
    }
  }

  // в) таблица извън списъка → отказ
  try {
    var u = await fetchFn(SB_URL + '/rest/v1/' + FORBIDDEN_TABLE + '?select=id&limit=1', { method: 'GET', headers: H });
    line(u.status === 401 || u.status === 403, 'в) GET ' + FORBIDDEN_TABLE + ' → ' + u.status + ' (очаква се отказ 401/403)');
  } catch (e) {
    line(false, 'в) GET ' + FORBIDDEN_TABLE + ' → мрежова грешка');
  }

  // г) запис в kasa_reports → отказ. PATCH с филтър, който не хваща ред;
  // POST с празен масив — не вмъква нищо дори при грешно дадено право.
  // Тялото на PATCH носи РЕАЛНА колона: при '{}' PostgREST изобщо не пуска
  // UPDATE и връща 204 без проверка на правата (първото пускане, 25.11.2026).
  // created_at < 1900 не хваща нито един ред, затова стойността не се пише.
  var writeH = Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, H);
  try {
    var p = await fetchFn(SB_URL + '/rest/v1/kasa_reports?created_at=lt.1900-01-01', { method: 'PATCH', headers: writeH, body: PATCH_BODY });
    line(p.status === 401 || p.status === 403, 'г) PATCH kasa_reports → ' + p.status + ' (очаква се отказ 401/403)');
  } catch (e) {
    line(false, 'г) PATCH kasa_reports → мрежова грешка');
  }
  try {
    var po = await fetchFn(SB_URL + '/rest/v1/kasa_reports', { method: 'POST', headers: writeH, body: '[]' });
    line(po.status === 401 || po.status === 403, 'г) POST kasa_reports → ' + po.status + ' (очаква се отказ 401/403)');
  } catch (e) {
    line(false, 'г) POST kasa_reports → мрежова грешка');
  }

  // д) друг bucket → ролята не го вижда. Не е „отказ при сваляне": docs е
  // public=true (като bulletin-files, contacts, Pictures — само kasa-docs е
  // private), значи файлът му се сваля от всеки и без ключ; на 25.11.2026
  // такава проба върна 200 при напълно верни права. Проверява се списъкът:
  // политиката на mirror_reader в storage.objects е само за kasa-docs, тоест
  // Storage list за docs трябва да е празен (или отказ 4xx).
  try {
    var o = await fetchFn(SB_URL + '/storage/v1/object/list/' + OTHER_BUCKET, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, H),
      body: JSON.stringify({ prefix: '', limit: 1 })
    });
    if (o.status === 200) {
      var items = null;
      try { items = await o.json(); } catch (e) { items = null; }
      var n = Array.isArray(items) ? items.length : -1;
      line(n === 0, 'д) списък на ' + OTHER_BUCKET + ' → 200, обекти: ' + (n < 0 ? '?' : n) + ' (очаква се 0)');
    } else {
      line(o.status >= 400 && o.status < 500, 'д) списък на ' + OTHER_BUCKET + ' → ' + o.status + ' (очаква се 0 обекта или отказ 4xx)');
    }
  } catch (e) {
    line(false, 'д) списък на ' + OTHER_BUCKET + ' → мрежова грешка');
  }

  return { ok: ok, lines: lines };
}

function fmtDate(sec) {
  var d = new Date(sec * 1000);
  function p(n) { return n < 10 ? '0' + n : '' + n; }
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear();
}

// opts: { env, argv, fetch, log, now } — всичко подменимо за теста.
async function main(opts) {
  opts = opts || {};
  var env = opts.env || process.env;
  var argv = opts.argv || process.argv.slice(2);
  var fetchFn = opts.fetch || globalThis.fetch;
  var log = opts.log || function (s) { console.log(s); };
  var nowSec = Math.floor((opts.now || Date.now()) / 1000);

  var secret = env.SUPABASE_JWT_SECRET;
  if (!secret || !String(secret).trim()) {
    log('СПРЯНО: липсва SUPABASE_JWT_SECRET. Задай я в PowerShell:');
    log("  $env:SUPABASE_JWT_SECRET = '...'   (Dashboard → Project Settings → JWT Keys → Legacy JWT Secret)");
    return 2;
  }
  if (typeof fetchFn !== 'function') {
    log('СПРЯНО: няма fetch — нужен е Node 18 или по-нов.');
    return 2;
  }
  var outDir = argv[0] || path.join(env.USERPROFILE || os.homedir(), 'Desktop');
  if (!fs.existsSync(outDir) || !fs.statSync(outDir).isDirectory()) {
    log('СПРЯНО: няма такава папка: ' + outDir);
    return 2;
  }

  var signed = signToken(String(secret).trim(), nowSec);
  log('Ключ за роля ' + ROLE + ', валиден до ' + fmtDate(signed.exp) + '. Самопроверка срещу ' + SB_URL + ':');
  var res = await selfCheck(signed.token, fetchFn);
  res.lines.forEach(function (l) { log('  ' + l); });
  if (!res.ok) {
    log('СПРЯНО: самопроверката не мина — файлът НЕ е записан.');
    return 1;
  }
  var outFile = path.join(outDir, OUT_NAME);
  fs.writeFileSync(outFile, signed.token + '\n', { encoding: 'utf8' });
  log('Готово: ключът е в ' + outFile + ' (валиден до ' + fmtDate(signed.exp) + ').');
  log('Дава се на Живко лично. След това изтрий файла.');
  return 0;
}

module.exports = { main: main, PATCH_BODY: PATCH_BODY, signToken: signToken, selfCheck: selfCheck, TABLES: TABLES, ROLE: ROLE, OUT_NAME: OUT_NAME };

if (require.main === module) {
  main().then(function (code) { process.exitCode = code; }, function () {
    console.log('СПРЯНО: неочаквана грешка — файлът НЕ е записан.');
    process.exitCode = 1;
  });
}
