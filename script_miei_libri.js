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
    showLoading(booksList);

    const { data: books, error } = await db
        .from('books')
        .select('*')
        .eq('owner_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
    }

    renderShelf(document.getElementById('my-shelf'), books ?? [], { title: 'La tua libreria' });

    if (!books || books.length === 0) {
        booksList.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">${icon('books', 20)}</span>
                <h3>La tua libreria è vuota</h3>
                <p>Aggiungi il primo libro che hai letto o che stai leggendo.</p>
                <a href="aggiungi_libro.html" class="btn-primary btn">Aggiungi il primo libro</a>
            </div>`;
        return;
    }

    booksList.innerHTML = '';

    for (const book of books) {
        // Visibilità
        const nGroups = Array.isArray(book.group_ids) ? book.group_ids.length : 0;
        const visibility = book.visibility === 'group'
            ? `${icon('users', 14)} Condiviso in ${nGroups} ${nGroups === 1 ? 'gruppo' : 'gruppi'}`
            : `${icon('lock', 14)} Privato`;
        const period = readingPeriod(book.start_date, book.end_date);

        const card = document.createElement('div');
        card.className = 'book-card';
        card.innerHTML = `
            <a href="scheda.html?id=${book.id}" class="book-card-main">
                ${bookCover(book)}
                <div class="book-card-text">
                    <div class="book-card-title">${sanitize(book.title)}</div>
                    <div class="book-card-author">${sanitize(book.author)}</div>
                    ${period ? `<div class="book-card-meta"><span class="period">${sanitize(period)}</span></div>` : ''}
                </div>
            </a>
            <div class="book-card-footer">
                <span class="visibility-tag">${visibility}</span>
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
            showToast('Errore durante l\'eliminazione', 'error');
        } else {
            showToast('Libro eliminato con successo', 'success');
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

    if (error || !book) { showToast('Libro non trovato', 'error'); return; }

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

    // Visibilità e gruppi
    const visSelect    = document.getElementById('edit-visibility');
    const checkboxWrap = document.getElementById('edit-group-checkboxes');
    const groupWrapper = document.getElementById('edit-group-wrapper');

    visSelect.value = book.visibility ?? 'private';

    const currentGroupIds = Array.isArray(book.group_ids) ? book.group_ids : [];
    if (editUserGroups.length === 0) {
        checkboxWrap.innerHTML =
            '<p class="field-hint">Non sei ancora in nessun gruppo</p>';
    } else {
        checkboxWrap.innerHTML = editUserGroups.map(g => `
            <label class="checkbox-label">
                <input type="checkbox" class="edit-group-checkbox" value="${g.id}"
                       ${currentGroupIds.includes(g.id) ? 'checked' : ''}>
                <span>${sanitize(g.name)}</span>
            </label>`).join('');
    }

    groupWrapper.style.display = book.visibility === 'group' ? 'block' : 'none';

    editSection.style.display = 'block';
    editSection.scrollIntoView({ behavior: 'smooth' });

    editForm.onsubmit = async function (e) {
        e.preventDefault();
        const pagesVal   = document.getElementById('edit-pages').value;
        const visibility = document.getElementById('edit-visibility').value;

        const groupIds = visibility === 'group'
            ? Array.from(document.querySelectorAll('.edit-group-checkbox:checked')).map(cb => cb.value)
            : [];

        if (visibility === 'group' && groupIds.length === 0) {
            showToast('Seleziona almeno un gruppo', 'error');
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
            group_ids: groupIds,
        }).eq('id', bookId);

        if (updateError) {
            showToast('Errore durante l\'aggiornamento', 'error');
        } else {
            showToast('Scheda aggiornata', 'success');
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
    initNavbar();   // in parallelo con i dati della pagina

    // I gruppi (per il selettore visibilità) arrivano insieme ai libri, senza farli aspettare
    const groupsReady = db
        .from('group_members')
        .select('groups(id, name)')
        .eq('user_id', currentUser.id)
        .then(({ data: memberships }) => {
            editUserGroups = memberships?.map(m => m.groups).filter(Boolean) ?? [];
        });

    await Promise.all([loadMyBooks(), groupsReady]);
})();
