// Supabase rileva automaticamente il token dall'URL e genera un evento
// PASSWORD_RECOVERY — aspettiamo quello per mostrare il form.

db.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
        document.getElementById('reset-loading').style.display = 'none';
        document.getElementById('reset-form').style.display    = 'block';
    }
});

// Timeout: se dopo 5s non arriva l'evento, il link è scaduto/non valido
setTimeout(() => {
    const loading = document.getElementById('reset-loading');
    if (loading.style.display !== 'none') {
        loading.style.display              = 'none';
        document.getElementById('reset-error').style.display = 'block';
    }
}, 5000);

document.getElementById('reset-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPwd     = document.getElementById('new-password').value;
    const confirmPwd = document.getElementById('confirm-password').value;
    const btn        = document.getElementById('reset-btn');

    if (newPwd !== confirmPwd) {
        showToast('Le password non coincidono.', 'error');
        return;
    }

    btn.disabled  = true;
    btn.innerHTML = '<span class="spinner"></span> Salvataggio...';

    const { error } = await db.auth.updateUser({ password: newPwd });

    if (error) {
        showToast('Errore: ' + error.message, 'error');
        btn.disabled    = false;
        btn.textContent = 'Salva nuova password';
    } else {
        showToast('Password aggiornata!', 'success');
        setTimeout(() => window.location.href = 'home.html', 1200);
    }
});
