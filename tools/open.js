// npm run open [-- --who=Тенчо] — отворените точки от claude/open/*.md
// (без closed/), групирани по „Кой чака“, най-старите първо.
// Първи ред на всеки файл:
//   Отворено: дд.мм · Кой чака: <WHO> · Сесия: <име>
// Без външни пакети. --dir=<папка> и --today=гггг-мм-дд са за теста.
'use strict';
var fs = require('fs');
var path = require('path');

var WHO = ['Тенчо', 'чат', 'Code', 'Живко', 'Теодор', 'Цвети', 'Елица', '?'];
var HEAD_RE = /^Отворено: (\d\d\.\d\d|\?) · Кой чака: (Тенчо|чат|Code|Живко|Теодор|Цвети|Елица|\?) · Сесия: (.+)$/;

function parseFile(name, text) {
  var lines = text.replace(/\r\n/g, '\n').split('\n');
  var m = HEAD_RE.exec(lines[0]);
  if (!m) return { id: name.replace(/\.md$/, ''), error: 'първият ред не е във формата: ' + lines[0] };
  var title = '';
  for (var i = 1; i < lines.length; i++) {
    if (lines[i].trim() !== '' && !/^Затворено: /.test(lines[i])) { title = lines[i].replace(/^- /, '').trim(); break; }
  }
  return { id: name.replace(/\.md$/, ''), opened: m[1], who: m[2], session: m[3], title: title };
}

// дд.мм → брой дни до today; дата в бъдещето значи миналата година
function daysAgo(ddmm, today) {
  if (ddmm === '?') return null;
  var d = +ddmm.slice(0, 2), mo = +ddmm.slice(3, 5);
  var t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  var x = Date.UTC(today.getUTCFullYear(), mo - 1, d);
  if (x > t) x = Date.UTC(today.getUTCFullYear() - 1, mo - 1, d);
  return Math.round((t - x) / 86400000);
}

function load(dir) {
  return fs.readdirSync(dir).filter(function (f) { return /\.md$/.test(f); }).sort().map(function (f) {
    return parseFile(f, fs.readFileSync(path.join(dir, f), 'utf8'));
  });
}

function render(items, opts) {
  var today = opts.today || new Date();
  var out = [], bad = items.filter(function (it) { return it.error; });
  var ok = items.filter(function (it) { return !it.error && (!opts.who || it.who === opts.who); });
  ok.forEach(function (it) { it.days = daysAgo(it.opened, today); });
  WHO.forEach(function (w) {
    var g = ok.filter(function (it) { return it.who === w; });
    if (!g.length) return;
    g.sort(function (a, b) { return (b.days === null ? -1 : b.days) - (a.days === null ? -1 : a.days) || (a.id < b.id ? -1 : 1); });
    out.push('', '== Кой чака: ' + w + ' (' + g.length + ') ==');
    g.forEach(function (it) {
      var age = it.days === null ? 'дата ?' : 'отворена преди ' + it.days + ' дни';
      out.push('  ' + it.id + ' — ' + age);
      if (it.title) out.push('      ' + (it.title.length > 110 ? it.title.slice(0, 107) + '…' : it.title));
    });
  });
  bad.forEach(function (it) { out.push('', '!! ' + it.id + ': ' + it.error); });
  out.push('', 'Общо: ' + ok.length + (opts.who ? ' (Кой чака: ' + opts.who + ')' : '') + (bad.length ? ' · с грешен първи ред: ' + bad.length : ''));
  return out.join('\n').replace(/^\n/, '');
}

function main(argv) {
  var opts = {}, dir = path.join(__dirname, '..', 'claude', 'open');
  argv.forEach(function (a) {
    var m = /^--(who|dir|today)=(.*)$/.exec(a);
    if (!m) return;
    if (m[1] === 'who') opts.who = m[2];
    if (m[1] === 'dir') dir = m[2];
    if (m[1] === 'today') opts.today = new Date(m[2] + 'T00:00:00Z');
  });
  var items = load(dir);
  console.log(render(items, opts));
  return items.some(function (it) { return it.error; }) ? 1 : 0;
}

module.exports = { HEAD_RE: HEAD_RE, WHO: WHO, parseFile: parseFile, daysAgo: daysAgo, render: render, load: load };
if (require.main === module) process.exitCode = main(process.argv.slice(2));
