/* Горната навигация: .nav-tabs е центриран ЧРЕЗ auto margin на ::before/::after,
   не с justify-content:center — центриран flex ред, който прелива, излиза и
   вляво, където скрол няма („Транспорт" недостъпен на 1280/1366).

   jsdom не смята лейаут, затова тестът само заковава правилата в CSS-а
   (закотвени регекси, по една проверка на свойство). Реалното съответствие
   (първият таб не е вляво от контейнера на 1280/1366/1536, центриран на 1920)
   се потвърждава с преглед в браузър.

   Пускане: node tests/nav-tabs-css.test.js . */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('../.claude/skills/tmax-jsdom-test/harness');
const { ok, section, report } = H;

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || []).join('\n');
/* Правилото извън @media: първото срещане на селектора в началото на ред. */
const rule = sel => {
  const m = new RegExp('^' + sel.replace(/[.:]/g, '\$&') + '\{([^}]*)\}', 'm').exec(css);
  return m ? m[1] : null;
};

section('.nav-tabs');
{
  const r = rule('.nav-tabs');
  ok('правилото съществува', !!r);
  ok('justify-content:flex-start (не center)', !!r && /justify-content:flex-start/.test(r) && !/justify-content:center/.test(r), r);
  ok('overflow-x:auto', !!r && /overflow-x:auto/.test(r));
  ok('scrollbar-width:thin (не none)', !!r && /scrollbar-width:thin/.test(r) && !/scrollbar-width:none/.test(r), r);
}
section('::before / ::after');
{
  const r = rule('.nav-tabs::before,.nav-tabs::after');
  ok('правилото съществува', !!r);
  ok('content:"" и margin:auto', !!r && /content:""/.test(r) && /margin:auto/.test(r), r);
}
section('лента за скрол');
{
  ok('::-webkit-scrollbar не е display:none', !/\.nav-tabs::-webkit-scrollbar\{[^}]*display:none/.test(css));
  const r = rule('.nav-tabs::-webkit-scrollbar');
  ok('::-webkit-scrollbar{height:4px}', !!r && /height:4px/.test(r), r);
  const t = rule('.nav-tabs::-webkit-scrollbar-thumb');
  ok('thumb: #334155, radius 2px', !!t && /background:#334155/.test(t) && /border-radius:2px/.test(t), t);
}
section('непипнато');
{
  ok('@media: .nav-tabs{justify-content:flex-start;} остава', /^\s+\.nav-tabs\{justify-content:flex-start;\}/m.test(css));
  ok('контейнерът #nav-tabs-container съществува', /id="nav-tabs-container"/.test(html));
}
report();
