// supabaseClient.js è già caricato prima di questo file

// Redirect se già autenticato
(async () => {
    const { data: { session } } = await db.auth.getSession();
    if (session) window.location.href = 'home.html';
})();

// --- Tab switcher ---
const tabLogin     = document.getElementById('tab-login');
const tabRegister  = document.getElementById('tab-register');
const loginForm    = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

function switchTab(active) {
    const isLogin = active === 'login';
    tabLogin.classList.toggle('active',    isLogin);
    tabRegister.classList.toggle('active', !isLogin);
    loginForm.classList.toggle('active',    isLogin);
    registerForm.classList.toggle('active', !isLogin);
}

tabLogin.addEventListener('click',    () => switchTab('login'));
tabRegister.addEventListener('click', () => switchTab('register'));

if (window.location.hash === '#register') switchTab('register');

// --- Recupera password ---
const forgotWrapper = document.getElementById('forgot-wrapper');
const loginFormEl   = document.getElementById('login-form');

document.getElementById('forgot-link').addEventListener('click', (e) => {
    e.preventDefault();
    loginFormEl.style.display  = 'none';
    forgotWrapper.style.display = 'block';
});

document.getElementById('forgot-cancel-btn').addEventListener('click', () => {
    forgotWrapper.style.display = 'none';
    loginFormEl.style.display  = '';
});

document.getElementById('forgot-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('forgot-email').value.trim();
    const btn   = document.getElementById('forgot-btn');

    btn.disabled  = true;
    btn.innerHTML = '<span class="spinner"></span> Invio...';

    const { error } = await db.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://deltadidirac30.github.io/traccia-libri-sito/reset_password.html'
    });

    if (error) {
        showToast('Errore: ' + error.message, 'error');
        btn.disabled    = false;
        btn.textContent = 'Invia link';
    } else {
        showToast('Link inviato! Controlla la tua email.', 'success');
        btn.textContent = 'Link inviato ✓';
    }
});

// --- Login ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = document.getElementById('login-btn');

    btn.disabled  = true;
    btn.innerHTML = '<span class="spinner"></span> Accesso...';

    const { error } = await db.auth.signInWithPassword({ email, password });

    if (error) {
        showToast('Credenziali non valide. Riprova.', 'error');
        btn.disabled    = false;
        btn.textContent = 'Accedi';
    } else {
        window.location.href = 'home.html';
    }
});

// --- Registrazione ---
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = document.getElementById('register-nickname').value.trim();
    const email    = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const btn      = document.getElementById('register-btn');

    if (!nickname) { showToast('Inserisci un nickname.', 'error'); return; }

    btn.disabled  = true;
    btn.innerHTML = '<span class="spinner"></span> Creazione account...';

    // Il nickname è passato in raw_user_meta_data; il trigger handle_new_user
    // lo salva automaticamente nella tabella profiles.
    const { error } = await db.auth.signUp({
        email,
        password,
        options: { data: { nickname } }
    });

    if (error) {
        showToast('Errore: ' + error.message, 'error');
        btn.disabled    = false;
        btn.textContent = 'Crea account';
    } else {
        showToast('Account creato! Benvenuto.', 'success');
        setTimeout(() => window.location.href = 'home.html', 900);
    }
});
