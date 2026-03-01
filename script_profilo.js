// supabaseClient.js è già caricato prima di questo file

let currentUser = null;

// --- Cambia nickname ---
document.getElementById('nickname-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newNick = document.getElementById('new-nickname').value.trim();
    const btn     = document.getElementById('save-nickname-btn');
    if (!newNick) return;

    btn.disabled  = true;
    btn.innerHTML = '<span class="spinner"></span>';

    const { error } = await db
        .from('profiles')
        .update({ nickname: newNick })
        .eq('id', currentUser.id);

    if (error) {
        showToast('Errore: ' + error.message, 'error');
    } else {
        showToast('Nickname aggiornato!', 'success');
        document.getElementById('new-nickname').value = '';
    }

    btn.disabled    = false;
    btn.textContent = 'Salva';
});

// --- Cambia email ---
document.getElementById('email-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newEmail = document.getElementById('new-email').value.trim();
    const pwd      = document.getElementById('email-pwd').value;
    const btn      = document.getElementById('save-email-btn');

    btn.disabled  = true;
    btn.innerHTML = '<span class="spinner"></span>';

    // Re-autentica con la password attuale
    const { error: authErr } = await db.auth.signInWithPassword({
        email: currentUser.email,
        password: pwd
    });
    if (authErr) {
        showToast('Password non corretta.', 'error');
        btn.disabled    = false;
        btn.textContent = 'Salva email';
        return;
    }

    const { error } = await db.auth.updateUser({ email: newEmail });
    if (error) {
        showToast('Errore: ' + error.message, 'error');
    } else {
        // Aggiorna anche la tabella profiles
        await db.from('profiles').update({ email: newEmail }).eq('id', currentUser.id);
        showToast('Email aggiornata! Controlla la nuova casella per la conferma.', 'success');
        document.getElementById('email-form').reset();
        document.getElementById('current-email').value = newEmail;
    }

    btn.disabled    = false;
    btn.textContent = 'Salva email';
});

// --- Cambia password ---
document.getElementById('pwd-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentPwd = document.getElementById('current-pwd').value;
    const newPwd     = document.getElementById('new-pwd').value;
    const confirm    = document.getElementById('confirm-pwd').value;
    const btn        = document.getElementById('save-pwd-btn');

    if (newPwd !== confirm) {
        showToast('Le nuove password non coincidono.', 'error');
        return;
    }

    btn.disabled  = true;
    btn.innerHTML = '<span class="spinner"></span>';

    // Re-autentica con la password attuale
    const { error: authErr } = await db.auth.signInWithPassword({
        email: currentUser.email,
        password: currentPwd
    });
    if (authErr) {
        showToast('Password attuale non corretta.', 'error');
        btn.disabled    = false;
        btn.textContent = 'Salva password';
        return;
    }

    const { error } = await db.auth.updateUser({ password: newPwd });
    if (error) {
        showToast('Errore: ' + error.message, 'error');
    } else {
        showToast('Password aggiornata!', 'success');
        document.getElementById('pwd-form').reset();
    }

    btn.disabled    = false;
    btn.textContent = 'Salva password';
});

// --- Elimina account ---
document.getElementById('delete-account-btn').addEventListener('click', () => {
    showConfirm(
        'Vuoi davvero eliminare il tuo account? Tutti i tuoi libri, commenti e like verranno cancellati per sempre. Questa azione è irreversibile.',
        async () => {
            const btn = document.getElementById('delete-account-btn');
            btn.disabled  = true;
            btn.innerHTML = '<span class="spinner"></span>';

            const { error } = await db.rpc('delete_own_account');
            if (error) {
                showToast('Errore durante l\'eliminazione: ' + error.message, 'error');
                btn.disabled    = false;
                btn.textContent = 'Elimina il mio account';
            } else {
                await db.auth.signOut();
                window.location.href = 'index.html';
            }
        }
    );
});

// --- Inizializzazione ---
(async () => {
    currentUser = await requireAuth();
    if (!currentUser) return;
    await initNavbar();

    // Precompila email attuale
    document.getElementById('current-email').value = currentUser.email;

    // Carica nickname attuale
    const { data: profile } = await db
        .from('profiles')
        .select('nickname')
        .eq('id', currentUser.id)
        .single();
    if (profile?.nickname) {
        document.getElementById('new-nickname').placeholder = profile.nickname;
    }
})();
