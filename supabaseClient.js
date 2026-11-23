// =====================================================================
// supabaseClient.js
// Caricato DOPO il CDN di Supabase nell'<head>, PRIMA degli script pagina.
// Spec: supabase.createClient è esposto globalmente dal CDN.
// =====================================================================

const SUPABASE_URL  = 'https://hhltbnrbjvxoisaizirj.supabase.co';   // ← sostituire
const SUPABASE_ANON = 'sb_publishable_URs-LrkEAjJPqWklquHJtw_hOSKM8UK';                

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
    }
});

// -----------------------------------------------------------------------
// Auth guard — redirect a login.html se non autenticato.
// Chiama questa funzione in cima agli script di ogni pagina protetta.
// -----------------------------------------------------------------------
async function requireAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
        return null;
    }
    return session.user;
}

// -----------------------------------------------------------------------
// Toast (identico all'attuale showToast in firebase-init.js)
// -----------------------------------------------------------------------
function showToast(msg, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-show'));
    setTimeout(() => {
        toast.classList.remove('toast-show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3200);
}

// -----------------------------------------------------------------------
// Sanitizza l'output prima di inserirlo nel DOM (anti-XSS)
// -----------------------------------------------------------------------
// Rende sicuro qualsiasi testo dell'utente prima di inserirlo nell'HTML,
// anche dentro gli attributi (per questo escape anche delle virgolette).
function sanitize(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// -----------------------------------------------------------------------
// Icone (set lucide, tratto 1.5) — sostituiscono le emoji nell'interfaccia
// -----------------------------------------------------------------------
const ICONS = {
    heart:   '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    message: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
    book:    '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    books:   '<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>',
    users:   '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    search:  '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    plus:    '<path d="M5 12h14"/><path d="M12 5v14"/>',
    arrow:   '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    x:       '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    copy:    '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    pen:     '<path d="M12 20h9"/><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z"/>',
    lock:    '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    check:   '<path d="M20 6 9 17l-5-5"/>',
    bell:    '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
};

function icon(name, size = 16) {
    return `<svg class="icon icon-${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
}

// Contenuto del pulsante like (cuore + numero)
function likeInner(liked, count, countAttr = 'class="like-num"') {
    return `${icon('heart')}<span ${countAttr}>${count}</span><span class="sr-only">${liked ? 'Togli il like' : 'Metti like'}</span>`;
}

// -----------------------------------------------------------------------
// Date leggibili: "19 ott 2026" e periodo di lettura "2 ott → 19 ott 2026"
// -----------------------------------------------------------------------
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

function parseDay(value) {
    if (!value) return null;
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return { y: +m[1], m: +m[2] - 1, d: +m[3] };
    const dt = new Date(value);
    return isNaN(dt) ? null : { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate() };
}

function formatDate(value, withYear = true) {
    const p = parseDay(value);
    if (!p) return '';
    return `${p.d} ${MESI[p.m]}${withYear ? ' ' + p.y : ''}`;
}

function readingPeriod(start, end) {
    const s = parseDay(start), e = parseDay(end);
    if (s && e) return `${formatDate(start, s.y !== e.y)} → ${formatDate(end)}`;
    if (e) return `finito il ${formatDate(end)}`;
    if (s) return `in lettura dal ${formatDate(start)}`;
    return '';
}

// -----------------------------------------------------------------------
// Dorso/copertina tipografica: un colore da tela di rilegatura, stabile per titolo
// -----------------------------------------------------------------------
const CLOTHS = ['#8c3f2a', '#2f5446', '#2b3b57', '#9a6f26', '#5a3650', '#44535e', '#62622f', '#7a2e33'];

function clothFor(text) {
    let h = 0;
    for (const ch of String(text ?? '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return CLOTHS[h % CLOTHS.length];
}

function bookCover(book, size = 'md') {
    const title  = book?.title ?? '';
    const author = book?.author ?? '';
    const surname = author.trim().split(/\s+/).pop() ?? '';
    const inner = size === 'lg'
        ? `<span class="cover-title">${sanitize(title)}</span><span class="cover-author">${sanitize(author)}</span>`
        : size === 'md'
            ? `<span class="cover-initial">${sanitize(title.replace(/^(?:(?:il|lo|la|i|gli|le|un|uno|una|the|a)\s+|(?:l|un|dell)['’]\s*)/i, '').charAt(0).toUpperCase())}</span>`
            : '';
    return `<div class="cover cover-${size}" style="--cloth:${clothFor(title + surname)}" aria-hidden="true">${inner}</div>`;
}

// -----------------------------------------------------------------------
// Dialogo di conferma generico (usato da tutte le pagine)
// -----------------------------------------------------------------------
function showConfirm(message, onConfirm, confirmLabel = 'Elimina', isDanger = true) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-box">
            <p>${sanitize(message)}</p>
            ${isDanger ? '<p class="confirm-sub">Questa azione non può essere annullata.</p>' : ''}
            <div class="confirm-actions">
                <button class="btn-secondary" id="confirm-no">Annulla</button>
                <button class="btn-primary ${isDanger ? 'btn-danger' : ''}" id="confirm-yes">${sanitize(confirmLabel)}</button>
            </div>
        </div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
    overlay.querySelector('#confirm-no').focus();
    overlay.querySelector('#confirm-yes').addEventListener('click', () => { overlay.remove(); onConfirm(); });
    overlay.querySelector('#confirm-no').addEventListener('click',  () => overlay.remove());
}

// -----------------------------------------------------------------------
// Navbar: campanella + menu profilo
// Desktop: campanella e avatar a destra. Mobile: campanella sempre visibile,
// le voci del profilo dentro il menu ad hamburger.
// Da chiamare dopo requireAuth() in ogni pagina protetta.
// -----------------------------------------------------------------------
async function initNavbar() {
    const slot  = document.getElementById('nav-profile-slot');
    const inner = document.querySelector('.navbar-inner');
    if (!slot || !inner) return;

    const { data: { session } } = await db.auth.getSession();
    if (!session) return;

    const { data: profile } = await db
        .from('profiles')
        .select('nickname')
        .eq('id', session.user.id)
        .single();

    const initial = ((profile?.nickname ?? session.user.email ?? '?')[0]).toUpperCase();

    // Voci profilo nel menu mobile
    slot.innerHTML = `
        <div class="nav-mobile-profile">
            <a href="profilo.html"  class="profile-dd-item">Profilo</a>
            <a href="attivita.html" class="profile-dd-item">La mia attività</a>
            <button class="profile-dd-item profile-dd-logout" data-logout>Esci</button>
        </div>`;

    // Campanella + avatar
    const actions = document.createElement('div');
    actions.className = 'nav-actions';
    actions.innerHTML = `
        <div class="notif-menu">
            <button class="notif-btn" id="notif-btn" aria-label="Notifiche" aria-haspopup="true" aria-expanded="false">
                ${icon('bell', 18)}
                <span class="notif-badge" id="notif-badge" hidden></span>
            </button>
            <div class="notif-panel" id="notif-panel" role="dialog" aria-label="Notifiche">
                <div class="notif-head">Notifiche</div>
                <div class="notif-list" id="notif-list"></div>
                <a href="profilo.html#app" class="notif-foot" id="notif-foot" hidden>
                    ${icon('bell', 16)} Ricevi le notifiche anche sul telefono
                </a>
            </div>
        </div>
        <div class="profile-menu" id="profile-menu">
            <button class="profile-btn" id="profile-btn" aria-label="Menu profilo" aria-haspopup="true">
                <span class="profile-initial">${sanitize(initial)}</span>
            </button>
            <div class="profile-dropdown" id="profile-dropdown">
                <a href="profilo.html"   class="profile-dd-item">Profilo</a>
                <a href="attivita.html"  class="profile-dd-item">La mia attività</a>
                <button class="profile-dd-item profile-dd-logout" data-logout>Esci</button>
            </div>
        </div>`;
    inner.insertBefore(actions, document.getElementById('nav-toggle'));

    const dropdown = document.getElementById('profile-dropdown');
    const panel    = document.getElementById('notif-panel');
    const bellBtn  = document.getElementById('notif-btn');

    document.getElementById('profile-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        closeNotifPanel();
        dropdown.classList.toggle('open');
    });
    bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.remove('open');
        document.getElementById('nav-links')?.classList.remove('open');
        if (panel.classList.contains('open')) closeNotifPanel();
        else openNotifPanel(session.user.id);
    });
    panel.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => { dropdown.classList.remove('open'); closeNotifPanel(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { dropdown.classList.remove('open'); closeNotifPanel(); }
    });
    document.querySelectorAll('[data-logout]').forEach(btn => btn.addEventListener('click', async () => {
        try { await window.TLPush?.disable(); } catch (_) { /* nessuna iscrizione */ }
        await db.auth.signOut();
        window.location.href = 'login.html';
    }));

    refreshNotifBadge(session.user.id);
    subscribeNotifications(session.user.id);
}

// -----------------------------------------------------------------------
// Notifiche
// -----------------------------------------------------------------------
function setNotifBadge(n) {
    const badge = document.getElementById('notif-badge');
    const btn   = document.getElementById('notif-btn');
    if (!badge) return;
    badge.hidden = !n;
    badge.textContent = n > 9 ? '9+' : String(n);
    btn?.setAttribute('aria-label', n ? `Notifiche, ${n} da leggere` : 'Notifiche');
}

async function refreshNotifBadge(uid) {
    const { count } = await db
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .is('read_at', null);
    setNotifBadge(count ?? 0);
}

function subscribeNotifications(uid) {
    if (!db.channel) return;
    try {
        db.channel('notifiche-' + uid)
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
                () => refreshNotifBadge(uid))
            .subscribe();
    } catch (_) { /* il tempo reale è un extra */ }
}

function timeAgo(value) {
    const diff = (Date.now() - new Date(value).getTime()) / 1000;
    if (diff < 60) return 'ora';
    if (diff < 3600) return `${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
    if (diff < 172800) return 'ieri';
    return formatDate(value, new Date(value).getFullYear() !== new Date().getFullYear());
}

function notifText(n, uid) {
    const who   = `<strong>${sanitize(n.actor?.nickname ?? 'Qualcuno')}</strong>`;
    const title = `«${sanitize(n.book?.title ?? 'un libro')}»`;
    if (n.type === 'book') {
        return `${who} ha aggiunto ${title}${n.group?.name ? ` in ${sanitize(n.group.name)}` : ''}`;
    }
    if (n.type === 'like') return `A ${who} piace ${title}`;
    if (n.type === 'comment') {
        return n.book?.owner_id === uid ? `${who} ha commentato ${title}` : `${who} ha commentato anche ${title}`;
    }
    return '';
}

async function openNotifPanel(uid) {
    const panel = document.getElementById('notif-panel');
    const list  = document.getElementById('notif-list');
    panel.classList.add('open');
    document.getElementById('notif-btn').setAttribute('aria-expanded', 'true');
    list.innerHTML = '<p class="notif-empty">Caricamento…</p>';

    const { data: items } = await db
        .from('notifications')
        .select('id, type, read_at, created_at, book_id, actor:profiles!notifications_actor_id_fkey(nickname), book:books(title, owner_id), group:groups(name)')
        .eq('user_id', uid)
        .order('created_at', { ascending: false })
        .limit(20);

    const visible = (items ?? []).filter(n => n.book);
    if (!visible.length) {
        list.innerHTML = `
            <div class="notif-empty">
                <span class="empty-icon">${icon('bell', 20)}</span>
                <p>Nessuna notifica per ora. Ti avvisiamo qui quando il tuo gruppo aggiunge un libro, mette like o commenta.</p>
            </div>`;
    } else {
        list.innerHTML = visible.map(n => `
            <a href="scheda.html?id=${n.book_id}${n.type === 'comment' ? '#commenti' : ''}" class="notif-item ${n.read_at ? '' : 'unread'}">
                <span class="avatar" aria-hidden="true">${sanitize((n.actor?.nickname ?? '?').charAt(0).toUpperCase())}</span>
                <span class="notif-text">${notifText(n, uid)}</span>
                <span class="notif-time">${timeAgo(n.created_at)}</span>
            </a>`).join('');
    }

    // Aprire il pannello segna tutto come letto
    if ((items ?? []).some(n => !n.read_at)) {
        await db.from('notifications').update({ read_at: new Date().toISOString() })
            .eq('user_id', uid).is('read_at', null);
        setNotifBadge(0);
    }

    // Invito ad attivare il push, se possibile e non ancora fatto
    const foot = document.getElementById('notif-foot');
    if (foot && window.TLPush && !location.pathname.endsWith('profilo.html')) {
        const sub = await window.TLPush.subscription().catch(() => null);
        foot.hidden = !!sub || (window.TLPush.supported() && Notification.permission === 'denied');
    }
}

function closeNotifPanel() {
    const panel = document.getElementById('notif-panel');
    if (!panel?.classList.contains('open')) return;
    panel.classList.remove('open');
    document.getElementById('notif-btn')?.setAttribute('aria-expanded', 'false');
}
