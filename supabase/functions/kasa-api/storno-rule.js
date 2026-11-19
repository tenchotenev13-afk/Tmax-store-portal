// supabase/functions/kasa-api/storno-rule.js
// КОПИЕ от kasa.js (STORNO_EXEMPT_CODES, stornoIsExempt, stornoIndicator) —
// решение 13 от 19.11.2026. Трите блока трябва да са ТЕКСТ В ТЕКСТ същите като
// в kasa.js; заковано в tests/kasa-api-storno-sync.test.js. Променяш правилото
// в kasa.js → копираш го тук в същия комит. Обикновен JS, за да няма превод.
var STORNO_EXEMPT_CODES = ['900001','900009'];

function stornoIsExempt(articlesStr){
  if(!articlesStr) return false;
  var codes=String(articlesStr).split('/').map(function(s){return s.trim();});
  return codes.some(function(c){return STORNO_EXEMPT_CODES.indexOf(c)>=0;});
}

function stornoIndicator(returnedSum, newSum, articlesStr) {
  if(stornoIsExempt(articlesStr)){
    return { flagged:false, exempt:true, label:'➖ Капаро/Ваучер', color:'#64748b', bg:null, diff:0 };
  }
  var ret = parseFloat(returnedSum) || 0;
  var nw  = parseFloat(newSum) || 0;
  var diff = Math.round((nw - ret) * 100) / 100;
  if (diff < 0) return { flagged: true,  label: '⚠️ ПО-МАЛКО', color: '#dc2626', bg: '#fef2f2', diff: diff };
  if (diff > 0) return { flagged: false, label: '✅ ПОВЕЧЕ',    color: '#16a34a', bg: '#f0fdf4', diff: diff };
  return          { flagged: false, label: '✅ РАВНО',      color: '#16a34a', bg: '#f0fdf4', diff: diff };
}

export { STORNO_EXEMPT_CODES, stornoIsExempt, stornoIndicator };
