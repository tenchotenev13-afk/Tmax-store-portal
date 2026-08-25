#!/usr/bin/env node
/**
 * npm run brief  ->  docs/BRIEF.md
 *
 * Слепва контекстните файлове на проекта в ЕДИН файл с печат за версия,
 * за да има какво да се качи в чата с едно действие вместо с четири.
 *
 * Защо печат за версия: копието, качено в чата, няма как само да разбере,
 * че е остаряло, и отговаря уверено от версия отпреди няколко комита.
 * С реда „Версия: <sha> · <дата>" най-отгоре разминаването се вижда още
 * в първото изречение.
 *
 * Изходът НЕ се комитва (виж .gitignore) — генерира се непосредствено
 * преди качване, за да сочи печатът точно текущия HEAD.
 */
'use strict';

var fs = require('fs');
var path = require('path');
var execFileSync = require('child_process').execFileSync;

var ROOT = path.resolve(__dirname, '..');
var OUT = path.join(ROOT, 'docs', 'BRIEF.md');
var LOG_COUNT = 20;

/* Редът тук е редът в пакета: първо кой съм и с кого, после правилата,
   после капаните — най-дългият файл последен. */
var PARTS = [
  'CLAUDE.md',
  'docs/PEOPLE.md',
  'docs/DECISIONS.md',
  'docs/PATTERNS.md'
];

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).replace(/\s+$/, '');
  } catch (e) {
    return '';
  }
}

function stamp() {
  var d = new Date();
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() +
         ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/* Понижава заглавията с едно ниво, за да стане един свързан документ вместо
   четири конкуриращи се H1. Редовете вътре в код-блок се пропускат — иначе
   `# коментар` в bash пример би минал за заглавие. */
function demote(md) {
  var fence = false;
  return md.split('\n').map(function (line) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return line; }
    if (fence) return line;
    if (/^#{1,5}\s/.test(line)) return '#' + line;
    return line;
  }).join('\n');
}

var head = git(['rev-parse', '--short', 'HEAD']) || '(няма git)';
var subject = git(['log', '-1', '--format=%s']);
var present = PARTS.filter(function (f) { return fs.existsSync(path.join(ROOT, f)); });
var missing = PARTS.filter(function (f) { return present.indexOf(f) === -1; });
var dirty = git(['status', '--porcelain', '--'].concat(present));

var out = [];
out.push('# ТеМАХ — контекстен пакет');
out.push('');
out.push('**Версия:** `' + head + '` · генериран ' + stamp());
if (subject) out.push('**Последен комит:** ' + subject);
out.push('**Състояние:** ' + (dirty
  ? 'ВНИМАНИЕ — некомитнати промени в изходните файлове, пакетът ги включва:\n' +
    dirty.split('\n').map(function (l) { return '  - `' + l.trim() + '`'; }).join('\n')
  : 'чисто работно дърво'));
out.push('');
out.push('| Включен файл | Последна промяна |');
out.push('| --- | --- |');
present.forEach(function (f) {
  var when = git(['log', '-1', '--format=%cd', '--date=format:%d.%m.%Y', '--', f]);
  out.push('| `' + f + '` | ' + (when || 'некомитнат') + ' |');
});
if (missing.length) {
  out.push('');
  out.push('Не съществуват още: ' + missing.map(function (f) { return '`' + f + '`'; }).join(', ') + '.');
}

out.push('');
out.push('## Как се ползва този пакет');
out.push('');
out.push('1. Файлът е моментна снимка от версията, изписана по-горе. Става ли дума');
out.push('   за промяна след тази дата, копието е остаряло — това се казва, вместо');
out.push('   да се отговаря от него.');
out.push('2. При въпрос по портала първо се посочва версията на копието:');
out.push('   „(копие `' + head + '` · ' + stamp().slice(0, 10) + ')".');
out.push('3. Живият код в репото има превес. Противоречи ли нещо тук на това, което');
out.push('   Claude Code чете от диска, вярно е прочетеното от диска.');
out.push('4. Пакетът се генерира с `npm run brief` и не се комитва — прегенерирай го');
out.push('   непосредствено преди качване.');

out.push('');
out.push('---');
out.push('');

present.forEach(function (f) {
  out.push('# ' + f);
  out.push('');
  out.push(demote(fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\s+$/, '')));
  out.push('');
  out.push('---');
  out.push('');
});

out.push('# Последни ' + LOG_COUNT + ' комита');
out.push('');
var log = git(['log', '-' + LOG_COUNT, '--format=%h · %cd · %s', '--date=format:%d.%m.%Y']);
log.split('\n').forEach(function (l) { if (l) out.push('- ' + l); });

out.push('');
out.push('## Файлове, пипани в тези комита');
out.push('');
var touched = git(['log', '-' + LOG_COUNT, '--name-only', '--format=']).split('\n')
  .map(function (l) { return l.trim(); })
  .filter(function (l) { return l; });
var seen = {};
var uniq = touched.filter(function (f) {
  if (seen[f]) return false;
  seen[f] = true;
  return true;
}).sort();
out.push(uniq.map(function (f) { return '`' + f + '`'; }).join(', ') || '(няма)');
out.push('');

fs.writeFileSync(OUT, out.join('\n'), 'utf8');
console.log('docs/BRIEF.md · версия ' + head + ' · ' + present.length + ' файла' +
            (dirty ? ' · ВНИМАНИЕ: некомитнати промени' : ''));
