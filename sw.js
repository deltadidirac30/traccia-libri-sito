// =====================================================================
// sw.js — Service worker di Traccia Libri
// 1. Rende il sito installabile e istantaneo: tutte le pagine e i file del sito
//    stanno sul dispositivo e si aprono subito dalla cache, mentre in background
//    si scarica la versione nuova (che si vede alla visita successiva).
// 2. Riceve e mostra le notifiche push.
// I dati (Supabase) non passano mai dalla cache.
// =====================================================================
const VERSION = 'tl-v5';
const PAGES = [
    './', './index.html', './login.html', './reset_password.html', './home.html', './libri.html',
    './miei_libri.html', './aggiungi_libro.html', './gruppi.html', './stanza_gruppo.html',
    './scheda.html', './attivita.html', './profilo.html',
];
const FILES = [
    './style.css', './supabaseClient.js', './ui.js', './pwa.js', './charts.js',
    './script.js', './script_libri_all.js', './script_miei_libri.js', './script_gruppi.js',
    './script_stanza_gruppo.js', './script_scheda.js', './script_attivita.js', './script_profilo.js',
    './script_login.js', './script_reset_password.js',
    './vendor/supabase.js', './vendor/motion.js',
    './fonts/instrument-sans-var.woff2', './fonts/newsreader-var.woff2', './fonts/newsreader-italic.woff2',
    './fonts/ibm-plex-mono-400.woff2', './fonts/ibm-plex-mono-500.woff2',
    './icons/icon-192.png', './manifest.webmanifest',
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(VERSION);
        // uno per uno: un file mancante non deve bloccare tutto il resto
        await Promise.all([...PAGES, ...FILES].map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    })());
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
        if (self.registration.navigationPreload) await self.registration.navigationPreload.disable().catch(() => {});
        await self.clients.claim();
    })());
});

const OFFLINE = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Traccia Libri</title><body style="font-family:system-ui;background:#f8f6f2;color:#1f1b16;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px">' +
    '<div><h1 style="font-family:Georgia,serif;font-weight:400">Sei offline</h1><p>Traccia Libri tornerà disponibile appena c\'è connessione.</p></div>';

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    // Solo i file del sito: Supabase e altri domini passano senza toccarli
    if (url.origin !== self.location.origin) return;

    const isPage = req.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
    // Le pagine sono le stesse per ogni ?id=…: la cache le tiene senza parametri
    const key = isPage ? url.origin + url.pathname : req;

    event.respondWith((async () => {
        const cache = await caches.open(VERSION);
        const cached = await cache.match(key);
        // no-cache: chiede al server se c'è una versione nuova (risposta 304 leggera se no)
        const netReq = isPage ? new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' })
                              : new Request(req, { cache: 'no-cache' });
        const network = fetch(netReq).then((res) => {
            if (res.ok && res.type === 'basic') cache.put(key, res.clone());
            return res;
        });
        if (cached) {
            event.waitUntil(network.catch(() => {}));   // aggiornamento in background
            return cached;
        }
        try {
            return await network;
        } catch (err) {
            if (req.mode === 'navigate') return new Response(OFFLINE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
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
