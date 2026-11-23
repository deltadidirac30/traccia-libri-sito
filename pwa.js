// =====================================================================
// pwa.js — app installabile e notifiche push
// Caricato in defer su tutte le pagine. Non dipende da Motion.
// =====================================================================

// --- Il sito non può essere caricato dentro pagine altrui (clickjacking) ---
if (window.top !== window.self) {
    try { window.top.location.replace(window.location.href); } catch (_) { document.documentElement.style.display = 'none'; }
}

// --- Tema chiaro / notte ---
// L'attributo data-theme è già impostato da uno script nel <head> (niente lampi).
function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('tl-theme', theme); } catch (_) { /* navigazione privata */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#12100e' : '#f8f6f2';
}
document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduce) { applyTheme(next); return; }
    // Il nuovo tema si apre a cerchio partendo dal pulsante
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const root = document.documentElement;
    root.style.setProperty('--tx', x + 'px');
    root.style.setProperty('--ty', y + 'px');
    root.style.setProperty('--tr', Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 'px');
    root.classList.add('theme-switching');
    const t = document.startViewTransition(() => applyTheme(next));
    t.finished.finally(() => root.classList.remove('theme-switching'));
});
if (document.documentElement.dataset.theme) applyTheme(document.documentElement.dataset.theme);

// --- Service worker: rende il sito installabile ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    });
}

// --- Installazione su Android/desktop: il browser offre il prompt, lo teniamo da parte ---
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    document.dispatchEvent(new CustomEvent('tl:installable'));
});
window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; });

function urlBase64ToUint8Array(base64) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const TLPush = {
    supported() {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    },
    isIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent)
            || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    },
    isStandalone() {
        return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    },
    async subscription() {
        if (!this.supported()) return null;
        const reg = await navigator.serviceWorker.getRegistration();
        return reg ? reg.pushManager.getSubscription() : null;
    },
    async enable() {
        // La richiesta del permesso deve partire subito dal tocco dell'utente (iPhone)
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('permission');

        const reg = await navigator.serviceWorker.register('sw.js');
        await navigator.serviceWorker.ready;

        const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push?vapid`, { headers: { apikey: SUPABASE_ANON } });
        if (!res.ok) throw new Error('vapid');
        const { publicKey } = await res.json();

        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
            sub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey),
            });
        }
        const j = sub.toJSON();
        const { error } = await db.rpc('save_push_subscription', {
            p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_user_agent: navigator.userAgent,
        });
        if (error) throw error;

        reg.showNotification('Notifiche attive', {
            body: 'Ti avviseremo quando il tuo gruppo aggiunge un libro, mette like o commenta.',
            icon: 'icons/icon-192.png',
            badge: 'icons/icon-192.png',
            tag: 'tl-welcome',
        });
    },
    async disable() {
        const sub = await this.subscription();
        if (!sub) return;
        await db.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        await sub.unsubscribe();
    },

    // Riquadro "App e notifiche" nella pagina Profilo
    async renderSettings(el) {
        if (!el) return;
        const ios = this.isIOS();
        const standalone = this.isStandalone();

        // 1. Installazione
        let installHtml = '';
        if (standalone) {
            installHtml = `<p class="setting-ok">${icon('check', 16)} Stai usando l'app installata</p>`;
        } else if (ios) {
            installHtml = `
                <ol class="install-steps">
                    <li>Apri questa pagina in <strong>Safari</strong></li>
                    <li>Tocca <strong>Condividi</strong>, poi <strong>Aggiungi alla schermata Home</strong></li>
                    <li>Apri Traccia Libri dall'icona e torna su questa pagina per attivare le notifiche</li>
                </ol>`;
        } else if (deferredInstallPrompt) {
            installHtml = `<button class="btn-secondary" id="install-btn">${icon('plus', 16)} Installa Traccia Libri</button>`;
        } else {
            installHtml = `<p class="field-hint">Puoi installarla dal menu del browser: cerca <strong>Installa app</strong> o <strong>Aggiungi a schermata Home</strong>.</p>`;
        }

        // 2. Notifiche
        let pushHtml = '';
        if (!this.supported()) {
            pushHtml = ios && !standalone
                ? `<p class="field-hint">Su iPhone le notifiche funzionano solo dall'app installata: segui i passaggi qui sopra.</p>`
                : `<p class="field-hint">Questo browser non supporta le notifiche.</p>`;
        } else if (Notification.permission === 'denied') {
            pushHtml = `<p class="field-hint">Hai bloccato le notifiche per questo sito. Puoi riattivarle dalle impostazioni del browser o del telefono.</p>`;
        } else {
            const sub = await this.subscription();
            pushHtml = sub
                ? `<div class="setting-row">
                       <p class="setting-ok">${icon('check', 16)} Notifiche attive su questo dispositivo</p>
                       <button class="edit-button" id="push-off-btn">Disattiva</button>
                   </div>`
                : `<button class="btn-primary" id="push-on-btn">Attiva le notifiche su questo dispositivo</button>`;
        }

        el.innerHTML = `
            <div class="setting-block">
                <h3 class="setting-title">Installa l'app</h3>
                <p class="setting-desc">Icona sulla schermata Home e apertura a schermo intero, senza passare dagli store.</p>
                ${installHtml}
            </div>
            <div class="setting-block">
                <h3 class="setting-title">Notifiche</h3>
                <p class="setting-desc">Un avviso quando qualcuno aggiunge un libro nei tuoi gruppi, mette like a un tuo libro o commenta.</p>
                ${pushHtml}
            </div>`;

        el.querySelector('#install-btn')?.addEventListener('click', async () => {
            if (!deferredInstallPrompt) return;
            deferredInstallPrompt.prompt();
            await deferredInstallPrompt.userChoice.catch(() => {});
            deferredInstallPrompt = null;
            this.renderSettings(el);
        });
        el.querySelector('#push-on-btn')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner"></span> Attivazione…';
            try {
                await this.enable();
                showToast('Notifiche attivate', 'success');
            } catch (err) {
                showToast(err?.message === 'permission'
                    ? 'Permesso non concesso'
                    : 'Non è stato possibile attivare le notifiche', 'error');
            }
            this.renderSettings(el);
        });
        el.querySelector('#push-off-btn')?.addEventListener('click', async () => {
            await this.disable().catch(() => {});
            showToast('Notifiche disattivate', 'success');
            this.renderSettings(el);
        });
    },
};
window.TLPush = TLPush;
document.addEventListener('tl:installable', () => {
    const el = document.getElementById('app-settings');
    if (el) TLPush.renderSettings(el);
});
