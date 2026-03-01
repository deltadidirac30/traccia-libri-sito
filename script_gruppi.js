// supabaseClient.js è già caricato prima di questo file

let currentUser = null;


// --- Carica e mostra i gruppi dell'utente ---
async function loadGroups() {
    const groupsList = document.getElementById('groups-list');
    groupsList.innerHTML =
        '<p style="color:var(--t3);font-size:15px;padding:8px 0;">Caricamento gruppi...</p>';

    const { data: memberships, error } = await db
        .from('group_members')
        .select('joined_at, groups(id, name, invite_code, created_by)')
        .eq('user_id', currentUser.id)
        .order('joined_at', { ascending: false });

    if (error) {
        console.error(error);
    }

    if (!memberships || memberships.length === 0) {
        groupsList.innerHTML = `
            <div class="empty-state" style="grid-column:unset;padding:40px 0;">
                <div style="font-size:3rem;margin-bottom:12px;">👥</div>
                <h3>Non sei ancora in nessun gruppo</h3>
                <p>Crea un nuovo gruppo o unisciti a uno esistente con un codice invito.</p>
            </div>`;
        return;
    }

    groupsList.innerHTML = '';

    for (const m of memberships) {
        const group   = m.groups;
        const isAdmin = group.created_by === currentUser.id;

        const card = document.createElement('div');
        card.className = 'group-room-card';
        card.style.cursor = 'pointer';
        card.innerHTML = `
            <div>
                <div class="group-room-card-name">${sanitize(group.name)}</div>
                <div class="group-room-card-meta">${isAdmin ? 'Amministratore' : 'Membro'}</div>
                ${isAdmin ? `
                <div style="margin-top:6px;display:flex;align-items:center;gap:8px;">
                    <code style="font-size:12px;color:var(--t2);letter-spacing:0.05em;">${sanitize(group.invite_code)}</code>
                    <button class="btn-secondary copy-code-btn" data-code="${sanitize(group.invite_code)}"
                            style="font-size:11px;padding:2px 8px;">Copia</button>
                </div>` : ''}
            </div>
            <span class="group-room-arrow">&#8594;</span>`;

        card.addEventListener('click', (e) => {
            if (e.target.closest('.copy-code-btn')) {
                const code = e.target.closest('.copy-code-btn').dataset.code;
                navigator.clipboard.writeText(code)
                    .then(() => showToast('Codice copiato!', 'success'))
                    .catch(() => showToast('Codice: ' + code, 'info'));
                return;
            }
            window.location.href = `stanza_gruppo.html?id=${group.id}`;
        });

        groupsList.appendChild(card);
    }
}

// --- Crea nuovo gruppo ---
document.getElementById('create-group-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('group-name');
    const name      = nameInput.value.trim();
    const btn       = e.submitter;

    if (!name) { showToast('Inserisci un nome per il gruppo.', 'error'); return; }

    btn.disabled  = true;
    btn.innerHTML = '<span class="spinner"></span> Creazione...';

    // Inserisce il gruppo (invite_code generato automaticamente dal DB)
    const { data: group, error: groupError } = await db
        .from('groups')
        .insert({ name, created_by: currentUser.id })
        .select()
        .single();

    if (groupError) {
        showToast('Errore durante la creazione: ' + groupError.message, 'error');
        btn.disabled    = false;
        btn.textContent = 'Crea gruppo';
        return;
    }

    // Aggiunge il creatore come membro admin
    const { error: memberError } = await db
        .from('group_members')
        .insert({ group_id: group.id, user_id: currentUser.id, role: 'admin' });

    if (memberError) {
        showToast('Gruppo creato ma errore nell\'iscrizione automatica.', 'error');
    } else {
        showToast(`Gruppo "${name}" creato con successo!`, 'success');
        nameInput.value = '';
        await loadGroups();
    }

    btn.disabled    = false;
    btn.textContent = 'Crea gruppo';
});

// --- Unisciti a un gruppo tramite codice invito ---
document.getElementById('join-group-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const codeInput = document.getElementById('invite-code');
    const code      = codeInput.value.trim();
    const btn       = e.submitter;

    if (!code) { showToast('Inserisci un codice invito.', 'error'); return; }

    btn.disabled  = true;
    btn.innerHTML = '<span class="spinner"></span> Iscrizione...';

    // Usa la funzione RPC SECURITY DEFINER (vedi supabase_schema.sql §7)
    // che bypassa la RLS per trovare il gruppo e aggiungere l'utente
    const { data, error } = await db.rpc('join_group_by_invite', { p_invite: code });

    if (error) {
        const msg = error.message.includes('non valido')
            ? 'Codice non valido o gruppo non trovato.'
            : error.message.includes('già membro')
                ? 'Sei già membro di questo gruppo.'
                : 'Errore durante l\'iscrizione: ' + error.message;
        showToast(msg, 'error');
    } else {
        showToast(`Ti sei unito a "${data.group_name}"!`, 'success');
        codeInput.value = '';
        await loadGroups();
    }

    btn.disabled    = false;
    btn.textContent = 'Unisciti';
});

// --- Inizializzazione ---
(async () => {
    currentUser = await requireAuth();
    if (!currentUser) return;
    await initNavbar();
    await loadGroups();
})();
