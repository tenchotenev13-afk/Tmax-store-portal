/* Снимка на реални данни (само GET, anon ключ от shared.js) → $TEMP/regdata/*.json. НЕ влиза в репото. REG_DATA сочи папката. node fetch.js <корен на репото> */
const fs = require('fs'), path = require('path');
const repo = path.resolve(process.argv[2]);
const sh = fs.readFileSync(repo + '/shared.js', 'utf8');
const URL_ = /SB_URL='([^']+)'/.exec(sh)[1], KEY = /SB_KEY='([^']+)'/.exec(sh)[1];
const out = process.env.REG_DATA || path.join(require('os').tmpdir(), 'regdata'); fs.mkdirSync(out, { recursive: true });
const d90 = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
const d30 = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
const T = {
  client_orders: 'created_at=gte.' + d30 + '&order=created_at.desc',
  order_restrictions: 'select=*',
  transport_orders: 'created_at=gte.' + d30 + '&order=created_at.desc',
  stores: 'select=*',
  goods_transit: 'doc_date=gte.' + d30 + '&order=doc_date.desc',
  stock_returns: 'doc_date=gte.' + d30 + '&order=doc_date.desc',
  stock_differences: 'created_at=gte.' + d30 + '&order=created_at.desc',
  differences_reports: 'created_at=gte.' + d30 + '&order=created_at.desc',
  stock_diff_swaps: 'created_at=gte.' + d30 + '&order=created_at.asc&limit=5000',
  kasa_reports: 'date=gte.' + d30 + '&order=date.desc',
  kasa_glavna: 'date=gte.' + d30,
  kasa_zoborot: 'date=gte.' + d30,
  kasa_documents: 'date=gte.' + d30,
  kasa_storno: 'select=*&order=created_at.desc&limit=300',
  app_settings: 'select=*',
  loading_lists: 'list_date=gte.' + d30 + '&order=list_date.desc',
  loading_list_items: 'created_at=gte.' + d30 + '&order=created_at.desc&select=*&limit=5000',
  loading_list_products: 'created_at=gte.' + d30 + '&order=created_at.desc&select=*&limit=5000',
  loading_list_photos: 'select=*&order=uploaded_at.desc&limit=500',
  supply_templates: 'select=*',
  supply_template_items: 'select=*',
  supply_entries: 'week_start=gte.' + d30 + '&select=*',
  transport_pallets: 'report_date=gte.' + d90 + '&order=report_date.desc',
  users: 'select=id,email,display_name,store_name,role,active,assigned_stores,oborot_report,is_regional,notify_groups&order=role,email',
  weekly_checklist_metrics: 'select=*',
  weekly_checklist: 'year=gte.' + (new Date().getFullYear() - 1),
  weekly_checklist_sends: 'select=*',
  product_catalog: 'select=sap_code,product_name,default_unit&limit=300',
  report_recipients: 'select=*',
  notification_topics: 'select=*',
  notification_matrix: 'select=*',
  notification_overrides: 'select=*',
  notification_schedules: 'select=*',
  contacts: 'select=*'
};
(async () => {
  for (const t of Object.keys(T)) {
    try {
      const r = await fetch(URL_ + '/rest/v1/' + t + '?' + T[t], { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
      const txt = await r.text();
      let j = null; try { j = JSON.parse(txt); } catch (e) {}
      if (!r.ok || !Array.isArray(j)) { console.log(t, 'HTTP', r.status, txt.slice(0, 120)); continue; }
      fs.writeFileSync(path.join(out, t + '.json'), JSON.stringify(j));
      console.log(t, j.length, 'реда');
    } catch (e) { console.log(t, 'ГРЕШКА', e.message); }
  }
})();
