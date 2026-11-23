// =====================================================================
// sw.js — Service worker di Traccia Libri
// 1. Rende il sito installabile e più veloce (cache delle pagine e degli asset)
// 2. Riceve e mostra le notifiche push
// Strategia: prima la rete, la cache solo se si è offline. Così un aggiornamento
// pubblicato su GitHub Pages arriva subito e nessuno resta con una versione vecchia.
// =====================================================================
const VERSION = 'tl-v2';
const SHELL = [
    './',
    './index.html',
    './home.html',
    './login.html',
    './style.css',
    './supabaseClient.js',
    './ui.js',
    './pwa.js',
    './vendor/supabase.js',
    './vendor/motion.js',
    './icons/icon-192.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(VERSION).then((cache) => cache.addAll(SHELL)).catch(() => {})
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    // Solo i file del sito: Supabase, font e CDN passano senza toccarli
    if (url.origin !== self.location.origin) return;

    event.respondWith((async () => {
        try {
            const fresh = await fetch(req);
            if (fresh.ok) {
                const cache = await caches.open(VERSION);
                cache.put(req, fresh.clone());
            }
            return fresh;
        } catch (err) {
            const cached = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
            if (cached) return cached;
            if (req.mode === 'navigate') {
                return new Response(
                    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
                    '<title>Traccia Libri</title><body style="font-family:system-ui;background:#f8f6f2;color:#1f1b16;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px">' +
                    '<div><h1 style="font-family:Georgia,serif;font-weight:400">Sei offline</h1><p>Traccia Libri tornerà disponibile appena c\'è connessione.</p></div>',
                    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                );
            }
            throw err;
        }
    })());
});

// --- Notifiche push ---------------------------------------------------------
self.addEventListener('push', (event) => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data?.text() }; }

    const title = data.title || 'Traccia Libri';
    const options = {
        body: data.body || '',
        icon: 'icons/icon-192.png',
        badge: 'icons/icon-192.png',
        tag: data.tag || undefined,
        data: { url: data.url || './home.html' },
        lang: 'it',
    };
    // Safari richiede di mostrare sempre una notifica per ogni push ricevuto
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = new URL(event.notification.data?.url || './home.html', self.registration.scope).href;
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const client of windows) {
            if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
                await client.focus();
                if ('navigate' in client) return client.navigate(target);
                return;
            }
        }
        return self.clients.openWindow(target);
    })());
});
