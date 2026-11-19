// npm run instrukcii [-- <папка>] [-- --go]
// Качва готовите инструкции (PDF) в таб „Инструкции" на постоянни пътища
// instrukcii/<модул>-<роля>.pdf в bucket „docs" и поддържа по ЕДНА карта в
// public.documents за всеки път. Списъкът е tools/instrukcii.json.
//
// По подразбиране е СУХО пускане — само GET заявки, нищо не се пише.
// С --go: непроменен файл (байт в байт с живия) → без запис; иначе
// DELETE на обекта → POST на същия път → обратно четене и сверка → карта
// (PATCH на съществуващата, INSERT само ако няма). Bucket-ът няма UPDATE
// политика за anon, затова замяната е DELETE + POST, не upsert.
//
// Адресът на проекта и ПУБЛИЧНИЯТ ключ се четат от docs.js (DOCS_SB,
// DOCS_KEY, DOCS_BKT) — не се дублират тук. Service ключ не се ползва.
// Скриптът пипа САМО пътища под instrukcii/ и САМО редове в documents,
// чийто url сочи към instrukcii/ — всичко под docs/ остава непокътнато.
// Без външни пакети (вграденият fetch на Node 18+).
'use strict';
var fs = require('fs');
var path = require('path');
var os = require('os');

var PREFIX = 'instrukcii/';
var PATH_RE = /^instrukcii\/[a-z0-9][a-z0-9-]*\.pdf$/;
var DATE_SUFFIX_RE = / · обновена \d\d\.\d\d\.\d{4}$/;

function pad(n) { return (n < 10 ? '0' : '') + n; }
function fmtDate(d) { return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear(); }
function fmtVer(d) {
  return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes());
}
function nfc(s) { return String(s).normalize('NFC'); }
function baseUrl(u) { return String(u || '').split('?')[0]; }

function readConfig(docsJsPath) {
  var src = fs.readFileSync(docsJsPath, 'utf8');
  function grab(name) {
    var m = new RegExp('var\\s+' + name + "\\s*=\\s*'([^']+)'").exec(src);
    if (!m) throw new Error('в ' + docsJsPath + ' няма ' + name);
    return m[1];
  }
  var cfg = { sb: grab('DOCS_SB'), key: grab('DOCS_KEY'), bucket: grab('DOCS_BKT') };
  var role = null;
  try { role = JSON.parse(Buffer.from(cfg.key.split('.')[1], 'base64').toString('utf8')).role; } catch (e) { /* виж долу */ }
  if (role !== 'anon') throw new Error('ключът в docs.js не е публичният (role=' + role + ') — отказ');
  return cfg;
}

// Проверка на списъка ПРЕДИ каквато и да е заявка. Грешка → целият пуск спира.
function validateList(list) {
  var errs = [];
  if (!Array.isArray(list)) return ['списъкът не е масив'];
  var paths = {}, titles = {}, files = {};
  list.forEach(function (it, i) {
    var n = '#' + (i + 1);
    ['file', 'path', 'title', 'category', 'description'].forEach(function (k) {
      if (!it || typeof it[k] !== 'string' || !it[k].trim()) errs.push(n + ': липсва ' + k);
    });
    if (!it || typeof it.path !== 'string') return;
    if (!PATH_RE.test(it.path)) errs.push(n + ': пътят „' + it.path + '" не е под ' + PREFIX + ' (само латиница, .pdf) — отказ');
    if (paths[it.path]) errs.push(n + ': пътят ' + it.path + ' се повтаря');
    paths[it.path] = 1;
    if (typeof it.title === 'string') {
      if (titles[it.title]) errs.push(n + ': заглавието „' + it.title + '" се повтаря');
      titles[it.title] = 1;
    }
    if (typeof it.file === 'string') {
      if (files[nfc(it.file)]) errs.push(n + ': файлът ' + it.file + ' се повтаря');
      files[nfc(it.file)] = 1;
    }
  });
  return errs;
}

function Api(cfg, fetchFn) {
  var auth = { 'Authorization': 'Bearer ' + cfg.key, 'apikey': cfg.key };
  var objUrl = cfg.sb + '/storage/v1/object/' + cfg.bucket + '/';
  var self = {
    publicUrl: function (p) { return cfg.sb + '/storage/v1/object/public/' + cfg.bucket + '/' + p; },
    guard: function (p) {
      if (!PATH_RE.test(p)) throw new Error('защита: път извън ' + PREFIX + ': ' + p);
    },
    guardRow: function (row) {
      var pre = self.publicUrl(PREFIX);
      if (!row || baseUrl(row.url).indexOf(pre) !== 0) throw new Error('защита: редът ' + (row && row.id) + ' не сочи към ' + PREFIX);
    },
    // Живият обект през API-то (не през публичния адрес — без CDN кеша).
    download: function (p) {
      self.guard(p);
      return fetchFn(cfg.sb + '/storage/v1/object/authenticated/' + cfg.bucket + '/' + p, { method: 'GET', headers: auth })
        .then(function (r) {
          if (r.status === 404 || r.status === 400) {
            return r.text().then(function (t) {
              if (r.status === 404 || /not.?found/i.test(t)) return null;
              throw new Error('изтегляне ' + p + ': HTTP ' + r.status + ' ' + t);
            });
          }
          if (!r.ok) return r.text().then(function (t) { throw new Error('изтегляне ' + p + ': HTTP ' + r.status + ' ' + t); });
          return r.arrayBuffer().then(function (b) { return Buffer.from(b); });
        });
    },
    remove: function (p) {
      self.guard(p);
      return fetchFn(objUrl + p, { method: 'DELETE', headers: auth }).then(function (r) {
        if (r.ok) return true;
        return r.text().then(function (t) {
          if (r.status === 404 || /not.?found/i.test(t)) return false; // липсващ обект не е грешка
          throw new Error('DELETE ' + p + ': HTTP ' + r.status + ' ' + t);
        });
      });
    },
    upload: function (p, buf) {
      self.guard(p);
      var h = Object.assign({ 'Content-Type': 'application/pdf' }, auth);
      return fetchFn(objUrl + p, { method: 'POST', headers: h, body: buf }).then(function (r) {
        if (r.ok) return true;
        return r.text().then(function (t) { throw new Error('POST ' + p + ': HTTP ' + r.status + ' ' + t); });
      });
    },
    // Само редовете, чийто url е под instrukcii/ — нищо друго не се чете за запис.
    cards: function () {
      var q = cfg.sb + '/rest/v1/documents?select=id,title,category,url,description&url=like.' +
        encodeURIComponent('*/' + cfg.bucket + '/' + PREFIX + '*');
      return fetchFn(q, { method: 'GET', headers: auth }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error('четене на documents: HTTP ' + r.status + ' ' + t); });
        return r.json();
      }).then(function (rows) {
        return (rows || []).filter(function (row) {
          return baseUrl(row.url).indexOf(self.publicUrl(PREFIX)) === 0;
        });
      });
    },
    patchCard: function (row, data) {
      self.guardRow(row);
      self.guardRow(data);
      var h = Object.assign({ 'Content-Type': 'application/json', 'Prefer': 'return=representation' }, auth);
      return fetchFn(cfg.sb + '/rest/v1/documents?id=eq.' + encodeURIComponent(row.id), {
        method: 'PATCH', headers: h, body: JSON.stringify(data)
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error('PATCH на картата: HTTP ' + r.status + ' ' + t); });
        return r.json().then(function (rows) {
          if (!rows || rows.length !== 1) throw new Error('PATCH на картата: обновени ' + (rows ? rows.length : 0) + ' реда вместо 1');
        });
      });
    },
    insertCard: function (data) {
      self.guardRow(data);
      var h = Object.assign({ 'Content-Type': 'application/json', 'Prefer': 'return=representation' }, auth);
      return fetchFn(cfg.sb + '/rest/v1/documents', { method: 'POST', headers: h, body: JSON.stringify(data) })
        .then(function (r) {
          if (!r.ok) return r.text().then(function (t) { throw new Error('INSERT на картата: HTTP ' + r.status + ' ' + t); });
        });
    }
  };
  return self;
}

function fmtSize(n) { return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }

function processItem(it, ctx) {
  var api = ctx.api, log = ctx.log, go = ctx.go;
  var local = path.join(ctx.folder, ctx.localNames[nfc(it.file)] || it.file);
  var res = { title: it.title, path: it.path, action: '', error: null, uploaded: false };
  if (!ctx.localNames[nfc(it.file)]) {
    res.action = 'пропуснат — няма файл ' + it.file;
    log('⏭  ' + it.title + ': няма файл „' + it.file + '" в папката — пропуснат');
    return Promise.resolve(res);
  }
  var buf = fs.readFileSync(local);
  var pub = api.publicUrl(it.path);
  var rows = ctx.cards.filter(function (r) { return baseUrl(r.url) === pub; });
  var row = rows[0] || null;
  var wantDescBase = it.description;
  var stamp = fmtDate(ctx.now), ver = fmtVer(ctx.now);
  var head = (go ? '' : '[сухо] ') + it.title + ' (' + it.path + ', ' + fmtSize(buf.length) + ')';

  if (rows.length > 1) {
    res.error = rows.length + ' карти в documents за ' + it.path + ' (id ' + rows.map(function (r) { return r.id; }).join(', ') + ') — оправи ръчно, не пиша';
    log('❌ ' + head + ': ' + res.error);
    return Promise.resolve(res);
  }

  return api.download(it.path).then(function (live) {
    var same = !!live && live.length === buf.length && live.equals(buf);
    var cardMeta = row && row.title === it.title && row.category === it.category &&
      String(row.description || '').replace(DATE_SUFFIX_RE, '') === wantDescBase;
    var liveTxt = live === null ? 'няма обект' : (same ? 'обектът е същият' : 'обектът е различен (' + fmtSize(live.length) + ')');
    var cardTxt = row ? 'карта id ' + row.id : 'няма карта';

    if (same && cardMeta) {
      res.action = 'непроменен';
      log('✓  ' + head + ': ' + liveTxt + ', ' + cardTxt + ' — нищо за правене');
      return res;
    }

    if (same) {
      // Файлът е същият — пипа се само картата (напр. смяна на category).
      // Датата в описанието и ?v остават от последното качване на файла.
      var keepDate = row && DATE_SUFFIX_RE.exec(String(row.description || ''));
      var data = {
        url: row ? row.url : pub + '?v=' + ver,
        title: it.title, category: it.category,
        description: wantDescBase + (keepDate ? keepDate[0] : ' · обновена ' + stamp)
      };
      res.action = row ? 'само картата (PATCH)' : 'само картата (INSERT)';
      if (!go) { log('•  ' + head + ': ' + liveTxt + ', ' + cardTxt + ' — би обновил ' + res.action); return res; }
      return (row ? api.patchCard(row, data) : api.insertCard(data)).then(function () {
        log('✓  ' + head + ': ' + res.action);
        return res;
      });
    }

    res.action = (live === null ? 'качване' : 'замяна') + ' + ' + (row ? 'PATCH на карта ' + row.id : 'INSERT на карта');
    if (!go) { log('•  ' + head + ': ' + liveTxt + ', ' + cardTxt + ' — би направил ' + res.action); return res; }

    return api.remove(it.path)
      .then(function () { return api.upload(it.path, buf); })
      .then(function () { return api.download(it.path); })
      .then(function (back) {
        if (!back || !back.equals(buf)) throw new Error('обратното четене на ' + it.path + ' не съвпада с локалния файл');
        res.uploaded = true;
        var data = { url: pub + '?v=' + ver, title: it.title, category: it.category, description: wantDescBase + ' · обновена ' + stamp };
        return (row ? api.patchCard(row, data) : api.insertCard(data)).catch(function (e) {
          throw new Error('ФАЙЛЪТ Е КАЧЕН, НО КАРТАТА НЕ Е ЗАПИСАНА — ' + e.message);
        });
      })
      .then(function () {
        log('✓  ' + head + ': ' + res.action);
        return res;
      });
  }).catch(function (e) {
    res.error = e.message;
    log('❌ ' + head + ': ' + e.message);
    return res;
  });
}

// opts: { argv, fetch, env, now, log, root, listPath, docsJsPath }
function run(opts) {
  opts = opts || {};
  var log = opts.log || function (s) { console.log(s); };
  var root = opts.root || path.join(__dirname, '..');
  var argv = opts.argv || [];
  var env = opts.env || process.env;
  var go = argv.indexOf('--go') >= 0;
  var pos = argv.filter(function (a) { return a.indexOf('--') !== 0; });
  var folder = pos[0] || path.join(env.USERPROFILE || os.homedir(), 'Documents', 'Temax-instrukcii');
  var fetchFn = opts.fetch || (typeof fetch === 'function' ? fetch : null);
  var now = opts.now || new Date();

  return Promise.resolve().then(function () {
    if (!fetchFn) throw new Error('няма вграден fetch — трябва Node 18+');
    var list = JSON.parse(fs.readFileSync(opts.listPath || path.join(root, 'tools', 'instrukcii.json'), 'utf8'));
    var errs = validateList(list);
    if (errs.length) { errs.forEach(function (e) { log('❌ ' + e); }); throw new Error('списъкът е невалиден — нищо не е пипнато'); }
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new Error('няма папка ' + folder);
    var cfg = readConfig(opts.docsJsPath || path.join(root, 'docs.js'));
    var api = Api(cfg, fetchFn);

    var localNames = {};
    fs.readdirSync(folder).forEach(function (f) {
      if (fs.statSync(path.join(folder, f)).isFile()) localNames[nfc(f)] = f;
    });
    var listed = {};
    list.forEach(function (it) { listed[nfc(it.file)] = 1; });

    log((go ? 'КАЧВАНЕ (--go)' : 'СУХО ПУСКАНЕ — нищо не се пише; за запис добави --go') + ' · папка: ' + folder);
    return api.cards().then(function (cards) {
      var ctx = { api: api, log: log, go: go, folder: folder, localNames: localNames, cards: cards, now: now };
      var results = [];
      return list.reduce(function (p, it) {
        return p.then(function () { return processItem(it, ctx).then(function (r) { results.push(r); }); });
      }, Promise.resolve()).then(function () {
        var extra = Object.keys(localNames).filter(function (n) { return !listed[n]; }).sort();
        extra.forEach(function (n) { log('⚠  ' + localNames[n] + ' е в папката, но го няма в tools/instrukcii.json — не е качен'); });
        var bad = results.filter(function (r) { return r.error; });
        log('');
        log('Обобщение: ' + results.length + ' в списъка · ' +
          results.filter(function (r) { return !r.error && /^пропуснат/.test(r.action); }).length + ' без файл · ' +
          results.filter(function (r) { return !r.error && r.action === 'непроменен'; }).length + ' непроменени · ' +
          bad.length + ' с грешка · ' + extra.length + ' извън списъка');
        bad.forEach(function (r) { log('  ❌ ' + r.title + ': ' + r.error); });
        return bad.length ? 1 : 0;
      });
    });
  }).catch(function (e) {
    log('❌ ' + e.message);
    return 1;
  });
}

module.exports = { run: run, validateList: validateList, readConfig: readConfig, PATH_RE: PATH_RE };

if (require.main === module) {
  run({ argv: process.argv.slice(2) }).then(function (code) { process.exitCode = code; });
}
