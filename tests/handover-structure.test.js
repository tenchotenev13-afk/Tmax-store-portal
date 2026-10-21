// Разделената предавка (20.10.2026): claude/log/, claude/open/, claude/open/closed/,
// секция 6 на handover-а като указател, tools/open.js и „Паралелни сесии“ в CLAUDE.md.
// node tests/handover-structure.test.js <root>
'use strict';
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
var ok = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { ok++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

var openTool = require(path.join(ROOT, 'tools', 'open.js'));
var HEAD_RE = openTool.HEAD_RE;

function mdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(function (f) { return /\.md$/.test(f); });
}
function read(f) { return fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'); }

// Връща списък с грешки за дърво с корен r (истинското репо или мутирано копие).
function problems(r) {
  var errs = [];
  var openDir = path.join(r, 'claude', 'open'), closedDir = path.join(openDir, 'closed');
  var ID_RE = /^\d\d-\d\d-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
  var open = mdFiles(openDir), closed = mdFiles(closedDir);
  if (!open.length) errs.push('claude/open/ е празна');
  // а) първи ред във формата, „Кой чака“ от допустимия списък или „?“
  open.concat(closed).forEach(function (f) {
    var dir = open.indexOf(f) >= 0 && fs.existsSync(path.join(openDir, f)) ? openDir : closedDir;
    var first = read(path.join(dir, f)).split('\n')[0];
    if (!HEAD_RE.test(first)) errs.push('а) първи ред: ' + f + ': ' + first);
    if (!ID_RE.test(f)) errs.push('а) id не е дд-мм-латиница: ' + f);
  });
  // б) няма двойни id (и между open/ и closed/)
  var seen = {};
  open.concat(closed).forEach(function (f) { if (seen[f]) errs.push('б) двойно id: ' + f); seen[f] = 1; });
  // в) всеки файл в closed/ има ред „Затворено:“
  closed.forEach(function (f) {
    if (!/^Затворено: \d\d\.\d\d · Как: .+$/m.test(read(path.join(closedDir, f)))) errs.push('в) без „Затворено:“: ' + f);
  });
  // г) claude/log/ — име гггг-мм-дд-<сесия>.md
  mdFiles(path.join(r, 'claude', 'log')).forEach(function (f) {
    if (!/^\d{4}-\d\d-\d\d-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(f)) errs.push('г) име на лог: ' + f);
  });
  // д) секция 6 е указател — без точки до „## 7.“
  var h = read(path.join(r, 'claude', 'handover-2026-10.md'));
  var s6 = h.indexOf('\n## 6. '), s7 = h.indexOf('\n## 7. ');
  if (s6 < 0 || s7 < 0) errs.push('д) няма секции 6/7');
  else {
    var sec = h.slice(s6 + 1, s7);
    if (sec.indexOf('claude/open/') < 0) errs.push('д) секция 6 не сочи към claude/open/');
    if (/^\s*[-*] /m.test(sec)) errs.push('д) секция 6 има точки');
  }
  // ж) „Паралелни сесии“ с точно три точки
  var c = read(path.join(r, 'CLAUDE.md'));
  var m = /\n## Паралелни сесии\n([\s\S]*?)(?=\n## )/.exec(c);
  if (!m) errs.push('ж) няма секция „Паралелни сесии“');
  else {
    var pts = m[1].match(/^\d\) /mg) || [];
    if (pts.length !== 3) errs.push('ж) точки в „Паралелни сесии“: ' + pts.length);
  }
  return errs;
}

// --- истинското репо ---
var real = problems(ROOT);
check('репото: структурата на предавката е чиста', real.length === 0, real.join(' | '));

// --- е) tools/open.js на фикстура с 3 точки ---
var TMP = path.join(os.tmpdir(), 'tmax-handover-structure');
fs.rmSync(TMP, { recursive: true, force: true });
var fx = path.join(TMP, 'fixture');
fs.mkdirSync(path.join(fx, 'closed'), { recursive: true });
fs.writeFileSync(path.join(fx, '10-10-old-tencho.md'), 'Отворено: 10.10 · Кой чака: Тенчо · Сесия: a\n\n- **Стара за Тенчо**\n');
fs.writeFileSync(path.join(fx, '18-10-new-tencho.md'), 'Отворено: 18.10 · Кой чака: Тенчо · Сесия: b\n\n- **Нова за Тенчо**\n');
fs.writeFileSync(path.join(fx, '15-10-chat.md'), 'Отворено: 15.10 · Кой чака: чат · Сесия: c\n\nТекст за чата\n');
fs.writeFileSync(path.join(fx, '12-10-code.md'), 'Отворено: 12.10 · Кой чака: Code · Сесия: d\n\nТекст за Code\n');
fs.writeFileSync(path.join(fx, 'closed', '01-10-done.md'), 'Отворено: 01.10 · Кой чака: Тенчо · Сесия: e\nЗатворено: 02.10 · Как: abc\n\nстаро\n');
function runOpen(args) {
  return cp.execFileSync(process.execPath, [path.join(ROOT, 'tools', 'open.js'), '--dir=' + fx, '--today=2026-10-20'].concat(args || []), { encoding: 'utf8' });
}
var all = runOpen();
check('open.js: три групи (Тенчо, чат, Code)', /== Кой чака: Тенчо \(2\) ==/.test(all) && /== Кой чака: чат \(1\) ==/.test(all) && /== Кой чака: Code \(1\) ==/.test(all), all);
check('open.js: closed/ не се брои, общо 4', /\nОбщо: 4$/.test(all.trim()) && all.indexOf('01-10-done') < 0, all);
check('open.js: най-старата първа в групата', all.indexOf('10-10-old-tencho') >= 0 && all.indexOf('10-10-old-tencho') < all.indexOf('18-10-new-tencho'));
check('open.js: „отворена преди 10 дни“ за 10.10 при 20.10', /10-10-old-tencho — отворена преди 10 дни/.test(all), all);
var who = runOpen(['--who=чат']);
check('open.js --who=чат: само чатът', /15-10-chat/.test(who) && !/tencho|12-10-code/.test(who) && /Общо: 1 \(Кой чака: чат\)/.test(who), who);
check('open.js: дата в бъдещето → миналата година', openTool.daysAgo('25.12', new Date('2026-10-20T00:00:00Z')) === 299);

// --- мутации: всяка трябва да събори проверката на репото ---
function copyTree(dst) {
  ['claude/open', 'claude/log'].forEach(function (d) {
    if (fs.existsSync(path.join(ROOT, d))) fs.cpSync(path.join(ROOT, d), path.join(dst, d), { recursive: true });
  });
  fs.mkdirSync(path.join(dst, 'claude'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'claude', 'handover-2026-10.md'), path.join(dst, 'claude', 'handover-2026-10.md'));
  fs.copyFileSync(path.join(ROOT, 'CLAUDE.md'), path.join(dst, 'CLAUDE.md'));
}
function mutant(name, fn) {
  var dst = path.join(TMP, 'mut-' + name);
  copyTree(dst);
  fn(dst);
  var errs = problems(dst);
  check('мутация „' + name + '“ се хваща', errs.length > 0);
}
var anyOpen = mdFiles(path.join(ROOT, 'claude', 'open'))[0];
mutant('счупен-първи-ред', function (d) {
  var f = path.join(d, 'claude', 'open', anyOpen);
  fs.writeFileSync(f, read(f).replace(/^Отворено: /, 'Отворена: '));
});
mutant('кой-чака-извън-списъка', function (d) {
  var f = path.join(d, 'claude', 'open', anyOpen);
  fs.writeFileSync(f, read(f).replace(/Кой чака: [^ ]+/, 'Кой чака: Меги'));
});
mutant('двойно-id', function (d) {
  fs.copyFileSync(path.join(d, 'claude', 'open', anyOpen), path.join(d, 'claude', 'open', 'closed', anyOpen));
});
mutant('точка-обратно-в-секция-6', function (d) {
  var f = path.join(d, 'claude', 'handover-2026-10.md');
  fs.writeFileSync(f, read(f).replace(/(\n## 6\. [^\n]*\n)/, '$1\n- **Нова точка**: върната в секция 6. Кой чака: Тенчо.\n'));
});
mutant('closed-без-затворено', function (d) {
  fs.writeFileSync(path.join(d, 'claude', 'open', 'closed', '01-01-x.md'), 'Отворено: 01.01 · Кой чака: Тенчо · Сесия: x\n\nтекст\n');
});
mutant('четвърта-точка-в-паралелни', function (d) {
  var f = path.join(d, 'CLAUDE.md');
  fs.writeFileSync(f, read(f).replace(/(\n## Паралелни сесии\n)/, '$1\n4) лишна\n'));
});
mutant('лог-с-грешно-име', function (d) {
  fs.mkdirSync(path.join(d, 'claude', 'log'), { recursive: true });
  fs.writeFileSync(path.join(d, 'claude', 'log', '20.10-x.md'), '# x\n');
});

fs.rmSync(TMP, { recursive: true, force: true });
console.log('\n' + ok + ' успешни, ' + fail + ' неуспешни');
process.exitCode = fail ? 1 : 0;
