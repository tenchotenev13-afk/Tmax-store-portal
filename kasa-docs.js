/* kasa-docs.js — Документи и Дневен преглед
   Зарежда се след kasa.js
   Редактирай САМО тук при промени по документите. */

var SB_STORAGE = "https://xiwkdiqqplgdcrkewgtv.supabase.co/storage/v1";
var BUCKET = "kasa-docs";

/* ─── КАЧВАНЕ ─────────────────────────────────────────────── */
function uploadKasaDoc(file, reportType, docType, onDone) {
  var ext   = file.name.split(".").pop();
  var stamp = Date.now();
  var clean = (currentUser.store_name||"store").replace(/[^a-zA-Z0-9]/g, "_");
  var path  = clean + "/" + today() + "/" + reportType + "_" + docType + "_" + stamp + "." + ext;

  var reader = new FileReader();
  reader.onload = function(e) {
    fetch(SB_STORAGE + "/object/" + BUCKET + "/" + encodeURIComponent(path), {
      method: "POST",
      headers: {
        "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA",
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true"
      },
      body: e.target.result
    }).then(function(r) {
      if (!r.ok) { toast("Грешка при качване", "#dc2626"); return; }
      sbPost("kasa_documents", {
        store_name: currentUser.store_name,
        date: today(),
        report_type: reportType,
        doc_type: docType,
        file_name: file.name,
        file_url: path,
        file_size: file.size,
        uploaded_by: currentUser.display_name || currentUser.email
      }).then(function() {
        toast("✅ Документът е качен!");
        if (onDone) onDone();
      });
    }).catch(function() { toast("Грешка при качване", "#dc2626"); });
  };
  reader.readAsArrayBuffer(file);
}

function getSignedUrl(path, onUrl) {
  fetch(SB_STORAGE + "/object/sign/" + BUCKET + "/" + encodeURIComponent(path), {
    method: "POST",
    headers: {
      "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tkaXFxcGxnZGNya2V3Z3R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1NTA5MjYsImV4cCI6MjA5NTEyNjkyNn0.aOlvvQI6x5wS60iH7rMDD7j_Go9FMP1YkWrLnfeL0CA",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ expiresIn: 3600 })
  }).then(function(r) { return r.json(); })
  .then(function(d) { onUrl(d.signedURL ? "https://xiwkdiqqplgdcrkewgtv.supabase.co" + d.signedURL : null); })
  .catch(function() { onUrl(null); });
}

function loadKasaDocs(date, cb) {
  var q = "store_name=eq." + encodeURIComponent(currentUser.store_name) + "&date=eq." + date + "&order=created_at.desc";
  sbGet("kasa_documents", q).then(cb).catch(function() { cb([]); });
}

/* ─── RENDER ДОКУМЕНТИ ─────────────────────────────────────── */
function renderDocsSection(containerId, reportType, docs) {
  var wrap = document.getElementById(containerId);
  if (!wrap) return;
  var canUpload = ["kasa","manager","admin","accounting"].indexOf(currentUser.role) >= 0;
  var types = { z_report:"Z-Четене", storno:"Сторно бележки", discount:"Отстъпки", other:"Друго" };

  var html = "<div class=\"card\" style=\"margin-top:14px;\">" +
    "<div style=\"display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;\">" +
      "<div class=\"card-title\" style=\"margin:0;\">📎 Прикачени документи</div>" +
      (canUpload
        ? "<label style=\"border:1px solid #16a34a;background:#f0fdf4;color:#16a34a;border-radius:7px;" +
          "padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;\">" +
          "+ Прикачи <input type=\"file\" accept=\".pdf,.jpg,.jpeg,.png\" multiple style=\"display:none;\"" +
          " onchange=\"handleDocUpload(event,'' + "'" + reportType + "'" + '\')\"></label>"
        : "") +
    "</div>";

  if (!docs || !docs.length) {
    html += "<div style=\"text-align:center;padding:20px;color:#94a3b8;font-size:13px;\">Няма прикачени документи.</div>";
  } else {
    html += "<div style=\"display:flex;flex-direction:column;gap:6px;\">";
    docs.forEach(function(d) {
      var icon = d.file_name && d.file_name.match(/\.pdf$/i) ? "📄" : "🖼️";
      var sz   = d.file_size ? " · " + Math.round(d.file_size / 1024) + " KB" : "";
      html += "<div style=\"display:flex;align-items:center;gap:10px;padding:8px 10px;" +
        "background:#f8fafc;border-radius:7px;border:1px solid #e2e8f0;\">" +
        "<span style=\"font-size:18px;\">" + icon + "</span>" +
        "<div style=\"flex:1;\">" +
          "<div style=\"font-size:12px;font-weight:500;\">" + esc(d.file_name) + "</div>" +
          "<div style=\"font-size:10px;color:#94a3b8;\">" +
            (types[d.doc_type] || d.doc_type) + " · " + fmtDate(d.date) + " · " + esc(d.uploaded_by || "") + sz +
          "</div>" +
        "</div>" +
        "<button onclick=\"openDoc(\'" + esc(d.file_url) + "\')\" " +
          "style=\"border:1px solid #2563eb;background:#eff6ff;color:#2563eb;" +
          "border-radius:5px;padding:3px 10px;font-size:11px;cursor:pointer;\">Виж</button>" +
      "</div>";
    });
    html += "</div>";
  }
  html += "</div>";
  wrap.innerHTML = html;
}

function handleDocUpload(event, reportType) {
  var files = Array.from(event.target.files);
  if (!files.length) return;
  var t = prompt("Тип документ:\n1 — Z-Четене\n2 — Сторно бележки\n3 — Отстъпки\n4 — Друго\n\nВъведи число:");
  var typeMap = { "1":"z_report", "2":"storno", "3":"discount", "4":"other" };
  var docType = typeMap[t] || "other";
  var done = 0;
  files.forEach(function(file) {
    uploadKasaDoc(file, reportType, docType, function() {
      done++;
      if (done === files.length) {
        loadKasaDocs(today(), function(docs) {
          renderDocsSection("docs-section-" + reportType, reportType, docs.filter(function(d) { return d.report_type === reportType; }));
        });
      }
    });
  });
}

function openDoc(path) {
  getSignedUrl(path, function(url) {
    if (url) window.open(url, "_blank");
    else toast("Грешка при отваряне на документа", "#dc2626");
  });
}

/* ─── ИЗПРАТИ ЗА ПРОВЕРКА ──────────────────────────────────── */
function markReady() {
  var todayStr = today();
  var reps = kasaReports.filter(function(r) { return r.date === todayStr; });
  if (!reps.length) { toast("Няма касови отчети за днес", "#dc2626"); return; }
  var hasDraft = reps.some(function(r) { return r.status === "draft"; });
  if (hasDraft && !confirm("Има непотвърдени отчети. Продължи ли?")) return;

  var by = currentUser.display_name || currentUser.email;
  var now = new Date().toISOString();
  var reqs = reps.map(function(r) {
    return sbPatch("kasa_reports", "id=eq." + r.id, { ready_at: now, ready_by: by });
  });
  Promise.all(reqs).then(function() {
    toast("📤 Изпратено за проверка към счетоводство!");
    loadKasa();
  });
}

/* Добавя документи + бутон след renderKasa */
var _kasDocs_origRender = renderKasa;
renderKasa = function() {
  _kasDocs_origRender();
  var mod = document.getElementById("mod-kasa");
  if (!mod) return;
  var page = mod.querySelector(".page");
  if (!page) return;

  /* Документи секция */
  var docsDiv = document.createElement("div");
  docsDiv.id = "docs-section-pos";
  page.appendChild(docsDiv);
  loadKasaDocs(today(), function(docs) {
    renderDocsSection("docs-section-pos", "pos", docs.filter(function(d) { return d.report_type === "pos"; }));
  });

  /* Бутон Изпрати за проверка */
  var canReady = ["kasa","manager","admin"].indexOf(currentUser.role) >= 0;
  if (canReady) {
    var btnDiv = document.createElement("div");
    btnDiv.style.cssText = "margin-top:14px;display:flex;justify-content:flex-end;padding-bottom:20px;";
    btnDiv.innerHTML = "<button onclick=\"markReady()\" style=\"border:none;background:#2563eb;" +
      "color:#fff;border-radius:8px;padding:10px 22px;font-size:14px;font-weight:600;cursor:pointer;\">" +
      "📤 Изпрати за проверка към счетоводство</button>";
    page.appendChild(btnDiv);
  }
};

/* ─── ДНЕВЕН ПРЕГЛЕД ───────────────────────────────────────── */
function loadDailyOverview() {
  var wrap = document.getElementById("daily-wrap") || document.getElementById("h-results");
  if (!wrap) return;
  wrap.innerHTML = "<div style=\"text-align:center;padding:20px;color:#94a3b8;\">⏳ Дневен преглед...</div>";

  var todayStr = today();
  Promise.all([
    sbGet("kasa_reports", "date=eq." + todayStr + "&order=store_name.asc"),
    sbGet("kasa_zoborot", "date=eq." + todayStr),
    sbGet("kasa_documents", "date=eq." + todayStr),
    sbGet("stores", "select=name&order=name")
  ]).then(function(res) {
    var reps   = Array.isArray(res[0]) ? res[0] : [];
    var zobs   = Array.isArray(res[1]) ? res[1] : [];
    var docs   = Array.isArray(res[2]) ? res[2] : [];
    var stores = Array.isArray(res[3]) ? res[3] : [];

    var storeNames = stores.map(function(s) { return s.name; });
    var withRep = {};
    reps.forEach(function(r) { withRep[r.store_name] = true; });
    var readyCount = Object.keys(reps.reduce(function(acc,r) {
      if (r.ready_at) acc[r.store_name] = true; return acc;
    }, {})).length;
    var totalRaz = reps.reduce(function(s,r) { return s + (parseFloat(r.razlika)||0); }, 0);
    var razC = totalRaz === 0 ? "#16a34a" : totalRaz < 0 ? "#dc2626" : "#d97706";

    var html = "<div style=\"margin-bottom:16px;\">" +
      "<div style=\"font-size:16px;font-weight:600;margin-bottom:14px;\">📅 Дневен преглед — " + fmtDate(todayStr) + "</div>" +
      "<div style=\"display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;\">" +
        mkCard("🏪 Подали отчет", Object.keys(withRep).length + " / " + storeNames.length, "магазина", "#2563eb") +
        mkCard("📤 За проверка", readyCount, "изпратили", "#16a34a") +
        mkCard("📎 Документи", docs.length, "прикачени", "#d97706") +
        mkCard("💰 Обща разлика", (totalRaz<0?"–":"") + Math.abs(totalRaz).toFixed(2), "EUR", razC) +
      "</div>" +
      "<div class=\"card\"><div class=\"card-title\">Статус по магазини</div>" +
      "<div class=\"tbl-wrap\"><table>" +
      "<thead><tr><th>Магазин</th><th style=\"text-align:center;\">ПОС</th>" +
      "<th style=\"text-align:center;\">Равнение</th><th style=\"text-align:center;\">Документи</th>" +
      "<th style=\"text-align:right;\">Разлика EUR</th><th style=\"text-align:center;\">Статус</th></tr></thead><tbody>";

    storeNames.forEach(function(name) {
      var sr  = reps.filter(function(r) { return r.store_name === name; });
      var sz  = zobs.find(function(z) { return z.store_name === name; });
      var sd  = docs.filter(function(d) { return d.store_name === name; });
      var raz = sr.reduce(function(s,r) { return s+(parseFloat(r.razlika)||0); }, 0);
      var rc  = raz===0?"#16a34a":raz<0?"#dc2626":"#d97706";
      var allOk = sr.length > 0 && sr.every(function(r) { return r.status==="confirmed"; });
      var rdy = sr.some(function(r) { return r.ready_at; });

      var st = !sr.length
        ? "<span style=\"background:#f3f4f6;color:#6b7280;padding:2px 8px;border-radius:20px;font-size:11px;\">⬜ Не е попълнено</span>"
        : rdy
        ? "<span style=\"background:#dcfce7;color:#14532d;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;\">📤 За проверка</span>"
        : "<span style=\"background:#dbeafe;color:#1e3a5f;padding:2px 8px;border-radius:20px;font-size:11px;\">✏️ В процес</span>";

      html += "<tr>" +
        "<td style=\"font-weight:500;\">" + esc(name) + "</td>" +
        "<td style=\"text-align:center;font-size:12px;\">" + (sr.length ? sr.length+"бр."+(allOk?" ✅":" ✏️") : "—") + "</td>" +
        "<td style=\"text-align:center;\">" + (sz ? (sz.status==="confirmed"?"✅":"✏️") : "—") + "</td>" +
        "<td style=\"text-align:center;\">" + (sd.length ? "📎 "+sd.length : "—") + "</td>" +
        "<td style=\"text-align:right;font-family:monospace;font-weight:700;color:"+rc+";\">" +
          (sr.length ? (raz<0?"–":"")+Math.abs(raz).toFixed(2) : "—") + "</td>" +
        "<td style=\"text-align:center;\">" + st + "</td>" +
      "</tr>";
    });

    html += "</tbody></table></div></div></div>";
    wrap.innerHTML = html;
  }).catch(function() {
    wrap.innerHTML = "<div style=\"color:#dc2626;padding:20px;\">Грешка при зареждане.</div>";
  });
}

function mkCard(label, val, sub, col) {
  return "<div style=\"background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:14px;border-top:3px solid "+col+";\">" +
    "<div style=\"font-size:11px;color:#64748b;margin-bottom:4px;\">" + label + "</div>" +
    "<div style=\"font-size:22px;font-weight:700;color:"+col+";font-family:DM Mono,monospace;\">" + val + "</div>" +
    "<div style=\"font-size:11px;color:#94a3b8;\">" + sub + "</div>" +
  "</div>";
}
