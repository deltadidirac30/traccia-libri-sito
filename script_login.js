// firebase-init.js è già caricato prima di questo file

// Redirect se già autenticato
auth.onAuthStateChanged((user) => {
    if (user) {
        window.location.href = 'home.html';
    }
});

// --- Tab switcher ---
const tabLogin    = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const loginForm   = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');

function switchTab(active) {
    if (active === 'login') {
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
        loginForm.classList.add('active');
        registerForm.classList.remove('active');
    } else {
        tabRegister.classList.add('active');
        tabLogin.classList.remove('active');
        registerForm.classList.add('active');
        loginForm.classList.remove('active');
    }
}

tabLogin.addEventListener('click', () => switchTab('login'));
tabRegister.addEventListener('click', () => switchTab('register'));

// Se l'URL contiene #register, mostra direttamente il form di registrazione
if (window.location.hash === '#register') {
    switchTab('register');
}

// --- Login ---
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn      = document.getElementById('login-btn');

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Accesso...';

    auth.signInWithEmailAndPassword(email, password)
        .then(() => {
            window.location.href = 'home.html';
        })
        .catch((error) => {
            showToast('Errore: ' + error.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Accedi';
        });
});

// --- Registrazione ---
registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const nickname = document.getElementById('register-nickname').value.trim();
    const email    = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const btn      = document.getElementById('register-btn');

    if (!nickname) {
        showToast('Inserisci un nickname.', 'error');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Creazione account...';

    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            return database.ref('users/' + userCredential.user.uid).set({
                nickname: nickname,
                email: email
            });
        })
        .then(() => {
            window.location.href = 'home.html';
        })
        .catch((error) => {
            showToast('Errore: ' + error.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Crea account';
        });
});
