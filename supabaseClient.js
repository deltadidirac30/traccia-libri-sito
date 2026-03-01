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
// Dialogo di conferma generico (usato da tutte le pagine)
// -----------------------------------------------------------------------
function showConfirm(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-box">
            <p>${sanitize(message)}</p>
            <p class="confirm-sub">Questa azione non può essere annullata.</p>
            <div class="confirm-actions">
                <button class="btn-secondary" id="confirm-no">Annulla</button>
                <button class="btn-primary" style="background:var(--red)" id="confirm-yes">Elimina</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
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
            <button class="profile-btn" id="profile-btn" aria-label="Menu profilo">
                <span class="profile-initial">${sanitize(initial)}</span>
            </button>
            <div class="profile-dropdown" id="profile-dropdown">
                <a href="profilo.html"   class="profile-dd-item">Profilo</a>
                <a href="attivita.html"  class="profile-dd-item">La mia Attività</a>
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
