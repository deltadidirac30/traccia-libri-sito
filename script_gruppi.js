// supabaseClient.js è già caricato prima di questo file

let currentUser = null;

// --- Dialogo di conferma generico ---
function showConfirm(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-box">
            <p>${sanitize(message)}</p>
            <p class="confirm-sub">Questa azione non può essere annullata.</p>
            <div class="confirm-actions">
                <button class="btn-secondary" id="confirm-no">Annulla</button>
                <button class="btn-primary" style="background:var(--red)" id="confirm-yes">Conferma</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirm-yes').addEventListener('click', () => { overlay.remove(); onConfirm(); });
    overlay.querySelector('#confirm-no').addEventListener('click', () => overlay.remove());
}

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
        groupsList.innerHTML = '<p>Errore durante il caricamento dei gruppi.</p>';
        console.error(error);
        return;
    }

    if (!memberships || memberships.length === 0) {
        groupsList.innerHTML = `
            <div class="empty-state" style="grid-column:unset;padding:40px 0;">
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
        card.className = 'card';
        card.style.cssText = 'margin-bottom:14px;';
        card.innerHTML = `
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;">
                <div>
                    <div style="font-family:var(--serif);font-size:20px;font-weight:700;color:var(--t1);margin-bottom:6px;">
                        ${sanitize(group.name)}
                    </div>
                    <div style="font-size:13px;color:var(--t3);margin-bottom:10px;">
                        ${isAdmin ? 'Amministratore' : 'Membro'}
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span style="font-size:13px;color:var(--t2);">Codice invito:</span>
                        <code id="code-${group.id}"
                              style="font-size:14px;font-weight:600;background:var(--s2);
                                     padding:3px 10px;border-radius:6px;letter-spacing:.5px;
                                     color:var(--accent);border:1px solid var(--border-light);">
                            ${sanitize(group.invite_code)}
                        </code>
                        <button onclick="copyCode('${group.id}', '${sanitize(group.invite_code)}')"
                                class="btn-secondary"
                                style="font-size:12px;padding:4px 12px;">
                            Copia
                        </button>
                    </div>
                </div>
                <div style="display:flex;gap:8px;flex-shrink:0;">
                    ${isAdmin
                        ? `<button class="delete-button"
                                    onclick="deleteGroup('${group.id}', '${sanitize(group.name)}')"
                                    style="font-size:13px;">
                                Elimina gruppo
                            </button>`
                        : `<button class="delete-button"
                                    onclick="leaveGroup('${group.id}', '${sanitize(group.name)}')"
                                    style="font-size:13px;">
                                Lascia gruppo
                            </button>`
                    }
                </div>
            </div>`;
        groupsList.appendChild(card);
    }
}

// --- Copia il codice invito ---
function copyCode(groupId, code) {
    navigator.clipboard.writeText(code)
        .then(() => showToast('Codice copiato!', 'success'))
        .catch(() => showToast('Impossibile copiare automaticamente: ' + code, 'info'));
}
window.copyCode = copyCode;

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

    // Aggiunge il creatore come membro
    const { error: memberError } = await db
        .from('group_members')
        .insert({ group_id: group.id, user_id: currentUser.id });

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

// --- Lascia un gruppo (membro non-admin) ---
function leaveGroup(groupId, groupName) {
    showConfirm(`Lasciare il gruppo "${groupName}"?`, async () => {
        const { error } = await db
            .from('group_members')
            .delete()
            .eq('group_id', groupId)
            .eq('user_id', currentUser.id);

        if (error) {
            showToast('Errore durante l\'uscita dal gruppo.', 'error');
        } else {
            showToast('Hai lasciato il gruppo.', 'success');
            await loadGroups();
        }
    });
}
window.leaveGroup = leaveGroup;

// --- Elimina un gruppo (solo admin) ---
function deleteGroup(groupId, groupName) {
    showConfirm(`Eliminare definitivamente il gruppo "${groupName}" e tutti i suoi dati?`, async () => {
        // La cascata nel DB elimina automaticamente i group_members associati.
        // I libri shared con questo gruppo tornano visibili solo al proprietario (group_id → NULL).
        const { error } = await db
            .from('groups')
            .delete()
            .eq('id', groupId);

        if (error) {
            showToast('Errore durante l\'eliminazione del gruppo.', 'error');
        } else {
            showToast('Gruppo eliminato.', 'success');
            await loadGroups();
        }
    });
}
window.deleteGroup = deleteGroup;

document.getElementById('logout-link').addEventListener('click', async (e) => {
    e.preventDefault();
    await db.auth.signOut();
    window.location.href = 'login.html';
});

// --- Inizializzazione ---
(async () => {
    currentUser = await requireAuth();
    if (!currentUser) return;
    await loadGroups();
})();
