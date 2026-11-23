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
function sanitize(str) {
    const d = document.createElement('div');
    d.textContent = str ?? '';
    return d.innerHTML;
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
// Navbar: inietta il menu profilo nel #nav-profile-slot
// Da chiamare dopo requireAuth() in ogni pagina protetta.
// -----------------------------------------------------------------------
async function initNavbar() {
    const slot = document.getElementById('nav-profile-slot');
    if (!slot) return;

    const { data: { session } } = await db.auth.getSession();
    if (!session) return;

    const { data: profile } = await db
        .from('profiles')
        .select('nickname')
        .eq('id', session.user.id)
        .single();

    const initial = ((profile?.nickname ?? session.user.email ?? '?')[0]).toUpperCase();

    slot.innerHTML = `
        <div class="profile-menu" id="profile-menu">
            <button class="profile-btn" id="profile-btn" aria-label="Menu profilo" aria-haspopup="true">
                <span class="profile-initial">${sanitize(initial)}</span>
            </button>
            <div class="profile-dropdown" id="profile-dropdown">
                <a href="profilo.html"   class="profile-dd-item">Profilo</a>
                <a href="attivita.html"  class="profile-dd-item">La mia attività</a>
                <button class="profile-dd-item profile-dd-logout" id="profile-logout-btn">Esci</button>
            </div>
        </div>`;

    document.getElementById('profile-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('profile-dropdown').classList.toggle('open');
    });
    document.addEventListener('click', () => {
        document.getElementById('profile-dropdown')?.classList.remove('open');
    });
    document.getElementById('profile-logout-btn').addEventListener('click', async () => {
        await db.auth.signOut();
        window.location.href = 'login.html';
    });
}
