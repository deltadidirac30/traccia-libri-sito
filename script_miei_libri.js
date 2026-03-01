// supabaseClient.js è già caricato prima di questo file

let currentUser  = null;
let editUserGroups = [];

function handleEditVisibilityChange() {
    const vis     = document.getElementById('edit-visibility').value;
    const wrapper = document.getElementById('edit-group-wrapper');
    if (wrapper) wrapper.style.display = vis === 'group' ? 'block' : 'none';
}
window.handleEditVisibilityChange = handleEditVisibilityChange;

// --- Carica i libri dell'utente ---
async function loadMyBooks() {
    const booksList = document.getElementById('books-list');
    booksList.innerHTML =
        '<p style="color:var(--t3);padding:20px 0;font-size:15px;">Caricamento in corso...</p>';

    const { data: books, error } = await db
        .from('books')
        .select('*')
        .eq('owner_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
    }

    if (!books || books.length === 0) {
        booksList.innerHTML = `
            <div class="empty-state">
                <div style="font-size:3rem;margin-bottom:12px;">📚</div>
                <h3>La tua libreria è vuota</h3>
                <p>Non hai ancora aggiunto nessun libro. Inizia adesso — ogni grande libreria parte da un solo libro!</p>
                <a href="aggiungi_libro.html" class="btn-primary btn">Aggiungi il primo libro</a>
            </div>`;
        return;
    }

    booksList.innerHTML = '';

    for (const book of books) {
        // Badge visibilità
        const visibilityBadge = book.visibility === 'group'
            ? ' &middot; <em>Condiviso nel gruppo</em>'
            : '';

        const card = document.createElement('div');
        card.className = 'book-card';
        card.innerHTML = `
            <div class="book-card-title">${sanitize(book.title)}</div>
            <div class="book-card-author">${sanitize(book.author)}</div>
            ${book.end_date
                ? `<div class="book-card-meta">Fine lettura: ${sanitize(book.end_date)}${visibilityBadge}</div>`
                : visibilityBadge
                    ? `<div class="book-card-meta">${visibilityBadge.replace(' &middot; ', '')}</div>`
                    : ''}
            <div class="book-card-footer">
                <a href="scheda.html?id=${book.id}" class="link-view">Visualizza scheda</a>
                <div class="book-card-actions">
                    <button class="edit-button"   onclick="editBook('${book.id}')">Modifica</button>
                    <button class="delete-button" onclick="deleteBook('${book.id}')">Elimina</button>
                </div>
            </div>`;
        booksList.appendChild(card);
    }
}

// --- Elimina libro ---
function deleteBook(bookId) {
    showConfirm('Sei sicuro di voler eliminare questo libro?', async () => {
        const { error } = await db.from('books').delete().eq('id', bookId);
        if (error) {
            showToast('Errore durante l\'eliminazione.', 'error');
        } else {
            showToast('Libro eliminato con successo.', 'success');
            loadMyBooks();
        }
    });
}
window.deleteBook = deleteBook;

// --- Modifica libro ---
async function editBook(bookId) {
    const editSection = document.getElementById('edit-section');
    const editForm    = document.getElementById('edit-form');

    const { data: book, error } = await db
        .from('books').select('*').eq('id', bookId).single();

    if (error || !book) { showToast('Libro non trovato.', 'error'); return; }

    document.getElementById('edit-addedBy').value         = book.added_by        ?? '';
    document.getElementById('edit-title').value           = book.title            ?? '';
    document.getElementById('edit-author').value          = book.author           ?? '';
    document.getElementById('edit-publicationDate').value = book.publication_date ?? '';
    document.getElementById('edit-pages').value           = book.pages            ?? '';
    document.getElementById('edit-startDate').value       = book.start_date       ?? '';
    document.getElementById('edit-endDate').value         = book.end_date         ?? '';
    document.getElementById('edit-quote').value           = book.quote            ?? '';
    document.getElementById('edit-summary').value         = book.summary          ?? '';
    document.getElementById('edit-notes').value           = book.notes            ?? '';

    // Visibilità e gruppo
    const visSelect   = document.getElementById('edit-visibility');
    const groupSelect = document.getElementById('edit-group-id');
    const groupWrapper= document.getElementById('edit-group-wrapper');

    visSelect.value = book.visibility ?? 'private';

    if (editUserGroups.length === 0) {
        groupSelect.innerHTML = '<option value="">Nessun gruppo disponibile</option>';
    } else {
        groupSelect.innerHTML = editUserGroups
            .map(g => `<option value="${g.id}">${sanitize(g.name)}</option>`)
            .join('');
    }
    if (book.group_id) groupSelect.value = book.group_id;

    groupWrapper.style.display = book.visibility === 'group' ? 'block' : 'none';

    editSection.style.display = 'block';
    editSection.scrollIntoView({ behavior: 'smooth' });

    editForm.onsubmit = async function (e) {
        e.preventDefault();
        const pagesVal   = document.getElementById('edit-pages').value;
        const visibility = document.getElementById('edit-visibility').value;
        const groupId    = visibility === 'group'
            ? (document.getElementById('edit-group-id').value || null)
            : null;

        if (visibility === 'group' && !groupId) {
            showToast('Seleziona un gruppo o crea/unisciti a uno nella sezione Gruppi.', 'error');
            return;
        }

        const { error: updateError } = await db.from('books').update({
            added_by:         document.getElementById('edit-addedBy').value,
            title:            document.getElementById('edit-title').value,
            author:           document.getElementById('edit-author').value,
            publication_date: document.getElementById('edit-publicationDate').value || null,
            pages:            pagesVal ? Number(pagesVal) : null,
            start_date:       document.getElementById('edit-startDate').value || null,
            end_date:         document.getElementById('edit-endDate').value   || null,
            quote:            document.getElementById('edit-quote').value     || null,
            summary:          document.getElementById('edit-summary').value   || null,
            notes:            document.getElementById('edit-notes').value     || null,
            visibility,
            group_id: groupId,
        }).eq('id', bookId);

        if (updateError) {
            showToast('Errore durante l\'aggiornamento.', 'error');
        } else {
            showToast('Scheda aggiornata!', 'success');
            editSection.style.display = 'none';
            loadMyBooks();
        }
    };
}
window.editBook = editBook;

document.getElementById('cancel-edit-button').addEventListener('click', () => {
    document.getElementById('edit-section').style.display = 'none';
});

// --- Inizializzazione ---
(async () => {
    currentUser = await requireAuth();
    if (!currentUser) return;
    await initNavbar();

    // Carica i gruppi dell'utente per il selettore visibilità
    const { data: memberships } = await db
        .from('group_members')
        .select('groups(id, name)')
        .eq('user_id', currentUser.id);
    editUserGroups = memberships?.map(m => m.groups).filter(Boolean) ?? [];

    await loadMyBooks();
})();
