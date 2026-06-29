/* sw.js — Service Worker за ТеМАХ Вътрешна Платформа */
var CACHE = 'temax-v1';
var ASSETS = [
  '/Tmax-store-portal/',
  '/Tmax-store-portal/index.html',
  '/Tmax-store-portal/shared.js',
  '/Tmax-store-portal/transport.js',
  '/Tmax-store-portal/client-orders.js',
  '/Tmax-store-portal/bulletin.js',
  '/Tmax-store-portal/kasa.js',
  '/Tmax-store-portal/kasa-docs.js',
  '/Tmax-store-portal/admin.js',
  '/Tmax-store-portal/contacts.js',
  '/Tmax-store-portal/docs.js',
  '/Tmax-store-portal/transit.js',
  '/Tmax-store-portal/calendar.js',
  '/Tmax-store-portal/stock-returns.js',
  '/Tmax-store-portal/stock-differences.js',
  '/Tmax-store-portal/history.js',
  '/Tmax-store-portal/notifications.js',
  '/Tmax-store-portal/push.js',
  '/Tmax-store-portal/email.js',
  '/Tmax-store-portal/icon-192.png',
  '/Tmax-store-portal/icon-512.png'
];

/* Инсталация — кешираме всичко */
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(ASSETS);
    }).then(function() {
      return self.skipWaiting();
    })
  );
});

/* Активация — изтриваме стари кешове */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* Fetch — Network first, fallback to cache */
self.addEventListener('fetch', function(e) {
  /* Supabase заявките винаги минават директно */
  if (e.request.url.indexOf('supabase.co') >= 0 ||
      e.request.url.indexOf('onesignal.com') >= 0) {
    return;
  }
  e.respondWith(
    fetch(e.request).then(function(res) {
      /* Кешираме успешните GET заявки */
      if (e.request.method === 'GET' && res.status === 200) {
        var clone = res.clone();
        caches.open(CACHE).then(function(cache) { cache.put(e.request, clone); });
      }
      return res;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});
