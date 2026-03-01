// supabaseClient.js è già caricato prima di questo file

let currentUser  = null;
let userNickname = '';
let userGroups   = [];

// --- Inizializzazione ---
(async () => {
    currentUser = await requireAuth();
    if (!currentUser) return;

    // Leggi nickname dalla tabella profiles
    const { data: profile } = await db
        .from('profiles')
        .select('nickname')
        .eq('id', currentUser.id)
        .single();
    userNickname = profile?.nickname ?? currentUser.email;

    // Popola il dropdown dei gruppi
    await caricaGruppi();
})();

// Logout
document.getElementById('logout-link')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await db.auth.signOut();
    window.location.href = 'login.html';
});

// --- Carica i gruppi dell'utente per il selettore visibilità ---
async function caricaGruppi() {
    const { data: memberships } = await db
        .from('group_members')
        .select('groups(id, name)')
        .eq('user_id', currentUser.id);

    userGroups = memberships?.map(m => m.groups).filter(Boolean) ?? [];

    const groupSelect = document.getElementById('group-id');
    if (!groupSelect) return;

    if (userGroups.length === 0) {
        groupSelect.innerHTML =
            '<option value="">Nessun gruppo — creane uno nella sezione Gruppi</option>';
    } else {
        groupSelect.innerHTML = userGroups
            .map(g => `<option value="${g.id}">${sanitize(g.name)}</option>`)
            .join('');
    }
}

// --- Mostra/nasconde il dropdown del gruppo ---
function handleVisibilityChange() {
    const visibility = document.getElementById('visibility').value;
    const wrapper    = document.getElementById('group-select-wrapper');
    if (wrapper) wrapper.style.display = visibility === 'group' ? 'block' : 'none';
}
window.handleVisibilityChange = handleVisibilityChange;

// --- Form aggiunta libro ---
const bookForm = document.getElementById('book-form');

if (bookForm) {
    bookForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentUser) {
            showToast('Devi essere autenticato per inserire un libro.', 'error');
            return;
        }

        const saveBtn = document.getElementById('save-btn');
        saveBtn.disabled  = true;
        saveBtn.innerHTML = '<span class="spinner"></span> Salvataggio...';

        const visibility = document.getElementById('visibility').value;
        const groupId    = visibility === 'group'
            ? (document.getElementById('group-id').value || null)
            : null;

        if (visibility === 'group' && !groupId) {
            showToast('Seleziona un gruppo o crea/unisciti a uno nella sezione Gruppi.', 'error');
            saveBtn.disabled    = false;
            saveBtn.textContent = 'Salva scheda';
            return;
        }

        const pagesVal = document.getElementById('pages').value;

        const { error } = await db.from('books').insert({
            owner_id:         currentUser.id,
            added_by:         userNickname,
            title:            document.getElementById('title').value.trim(),
            author:           document.getElementById('author').value.trim(),
            publication_date: document.getElementById('publicationDate').value || null,
            pages:            pagesVal ? Number(pagesVal) : null,
            start_date:       document.getElementById('startDate').value || null,
            end_date:         document.getElementById('endDate').value || null,
            quote:            document.getElementById('quote').value.trim()   || null,
            summary:          document.getElementById('summary').value.trim() || null,
            notes:            document.getElementById('notes').value.trim()   || null,
            visibility,
            group_id:         groupId,
        });

        if (error) {
            showToast('Errore durante il salvataggio: ' + error.message, 'error');
        } else {
            showToast('Libro salvato con successo!', 'success');
            bookForm.reset();
            const wrapper = document.getElementById('group-select-wrapper');
            if (wrapper) wrapper.style.display = 'none';
        }

        saveBtn.disabled    = false;
        saveBtn.textContent = 'Salva scheda';
    });
}
