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
