/* tools/revision-schedule-2026.js — ЕДНОКРАТНО зареждане на графика на
   ревизиите за 2026 от „график до края на 2026.xlsx“ (Контролинг) в
   public.revision_schedule. Файлът НЕ се комитва.

   Пускане (SheetJS трябва да е наличен: npm i --no-save xlsx@0.18.5):
     node tools/revision-schedule-2026.js "<път до .xlsx>" [--sql <изход.sql>]
   Печата таблица (седмица · вид · брой групи · бележка) и, с --sql, пише
   insert-а във файл. Нищо не пише в базата — записът е отделна стъпка
   (execute_sql), след преглед на таблицата.

   Правила на файла (ред 1 = заглавия „Срок“, „групи“, „Име на групата“):
   - ред с „Срок“ започва нова седмица; годината е 2026 за всички
     („31.08-03.09“, „08.09-09.09.“, „21-23.09.2026“, „09.11.-11.11“);
   - на реда с дата: B започва с „старт брошура“ → kind 'none', note = B;
     C = „движения“ → kind 'movements'; B е код → първата група;
   - ред без дата с код в B → група на текущата седмица (code като низ,
     name от C);
   - ред без дата с ТЕКСТ в B (напр. „07.09 почивен ден заради 06.09“) →
     бележка на СЛЕДВАЩАТА седмица с дата (решение на Тенчо 14.10.2026:
     почивният ден е в седмицата 08.09–09.09, а редът стои под 31.08). */
'use strict';

var YEAR = 2026;
var NONE_RE = /^старт брошура/i;

function pad(n){ return (n < 10 ? '0' : '') + n; }
function iso(d, m){ return YEAR + '-' + pad(m) + '-' + pad(d); }
function txt(v){ return v == null ? '' : String(v).trim(); }

/* „31.08-03.09“, „08.09-09.09.“, „21-23.09.2026“, „09.11.-11.11“ → {from, to} */
function parseRange(s){
  var m = /^(\d{1,2})(?:\.(\d{1,2}))?\.?\s*-\s*(\d{1,2})\.(\d{1,2})\.?(\d{4})?\.?$/.exec(txt(s));
  if(!m) throw new Error('непознат срок: „' + s + '“');
  if(m[5] && +m[5] !== YEAR) throw new Error('година ' + m[5] + ' в „' + s + '“ — очаква се ' + YEAR);
  var d1 = +m[1], m2 = +m[4], m1 = m[2] ? +m[2] : m2, d2 = +m[3];
  var from = iso(d1, m1), to = iso(d2, m2);
  [[d1, m1], [d2, m2]].forEach(function(x){
    var dt = new Date(Date.UTC(YEAR, x[1] - 1, x[0]));
    if(dt.getUTCDate() !== x[0] || dt.getUTCMonth() !== x[1] - 1) throw new Error('невалидна дата в „' + s + '“');
  });
  if(to < from) throw new Error('„до“ преди „от“ в „' + s + '“');
  return { from: from, to: to };
}

/* aoa (ред 1 = заглавия) → [{starts_on, ends_on, kind, note, groups}] */
function parseScheduleAoa(aoa){
  var weeks = [], cur = null, pending = [];
  for(var r = 1; r < aoa.length; r++){
    var row = aoa[r] || [];
    var a = txt(row[0]), b = txt(row[1]), c = txt(row[2]);
    if(!a && !b && !c) continue;
    if(a){
      var rg = parseRange(a);
      cur = { starts_on: rg.from, ends_on: rg.to, kind: 'groups', note: null, groups: [] };
      if(pending.length){ cur.note = pending.join('; '); pending = []; }
      weeks.push(cur);
      if(NONE_RE.test(b)){ cur.kind = 'none'; cur.note = cur.note ? cur.note + '; ' + b : b; continue; }
      if(c.toLowerCase() === 'движения' && !b){ cur.kind = 'movements'; continue; }
    }
    if(/^\d+$/.test(b)){
      if(!cur) throw new Error('ред ' + (r + 1) + ': група преди първата седмица');
      if(cur.kind !== 'groups') throw new Error('ред ' + (r + 1) + ': група в седмица „' + cur.kind + '“');
      cur.groups.push({ code: b, name: c });
      continue;
    }
    if(b && !a){ pending.push(b); continue; }
    if(b && a){ cur.note = cur.note ? cur.note + '; ' + b : b; continue; }
    if(!a) throw new Error('ред ' + (r + 1) + ': неразпознат („' + b + '“ / „' + c + '“)');
  }
  if(pending.length) throw new Error('бележка без седмица след нея: ' + pending.join('; '));
  var seen = {};
  weeks.forEach(function(w){
    if(seen[w.starts_on]) throw new Error('две седмици от ' + w.starts_on);
    seen[w.starts_on] = 1;
  });
  return weeks;
}

function sqlStr(s){ return s == null ? 'null' : "'" + String(s).replace(/'/g, "''") + "'"; }
function toSql(weeks, by){
  return 'insert into public.revision_schedule (starts_on, ends_on, kind, note, groups, created_by) values\n' +
    weeks.map(function(w){
      return '  (' + [sqlStr(w.starts_on), sqlStr(w.ends_on), sqlStr(w.kind), sqlStr(w.note),
        sqlStr(JSON.stringify(w.groups)) + '::jsonb', sqlStr(by)].join(', ') + ')';
    }).join(',\n') + '\nreturning starts_on, kind, jsonb_array_length(groups) as n_groups;\n';
}
function fmt(d){ var p = d.split('-'); return p[2] + '.' + p[1]; }
function table(weeks){
  return weeks.map(function(w, i){
    return pad(i + 1) + '  ' + fmt(w.starts_on) + '–' + fmt(w.ends_on) + '  ' +
      (w.kind + '         ').slice(0, 10) + String(w.groups.length).padStart(2) + '  ' + (w.note || '');
  }).join('\n');
}

if(require.main === module){
  var file = process.argv[2];
  if(!file){ console.error('Пусни: node tools/revision-schedule-2026.js "<файл.xlsx>" [--sql изход.sql]'); process.exit(2); }
  var XLSX;
  try { XLSX = require('xlsx'); }
  catch(e){ console.error('Няма SheetJS: npm i --no-save xlsx@0.18.5'); process.exit(2); }
  var wb = XLSX.readFile(file);
  var aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
  var weeks = parseScheduleAoa(aoa);
  console.log('седмица      вид     гр.  бележка');
  console.log(table(weeks));
  console.log('\nОБЩО: ' + weeks.length + ' седмици, ' +
    weeks.reduce(function(s, w){ return s + w.groups.length; }, 0) + ' групи');
  var i = process.argv.indexOf('--sql');
  if(i > 0 && process.argv[i + 1]){
    require('fs').writeFileSync(process.argv[i + 1], toSql(weeks, 'импорт: график до края на 2026.xlsx'));
    console.log('SQL → ' + process.argv[i + 1]);
  }
}

module.exports = { parseRange: parseRange, parseScheduleAoa: parseScheduleAoa, toSql: toSql };
