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
                <button class="btn-primary" style="background:var(--red)" id="confirm-yes">Elimina</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirm-yes').addEventListener('click', () => { overlay.remove(); onConfirm(); });
    overlay.querySelector('#confirm-no').addEventListener('click', () => overlay.remove());
}

// --- Carica i libri condivisi nei gruppi dell'utente ---
async function loadGroupBooks() {
    const booksList = document.getElementById('books-list');
    booksList.innerHTML =
        '<p style="color:var(--t3);padding:20px 0;font-size:15px;">Caricamento in corso...</p>';

    // La RLS filtra automaticamente: l'utente vede solo i libri dei suoi gruppi
    const { data: books, error } = await db
        .from('books')
        .select('*, groups(name)')
        .eq('visibility', 'group')
        .order('created_at', { ascending: false });

    if (error) {
        console.error(error);
    }

    if (!books || books.length === 0) {
        booksList.innerHTML = `
            <div class="empty-state">
                <div style="font-size:3rem;margin-bottom:12px;">🔍</div>
                <h3>Ancora nessun libro condiviso</h3>
                <p>Unisciti a un gruppo di lettura e inizia a condividere i tuoi libri con gli amici!</p>
                <a href="gruppi.html" class="btn-primary btn">Vai ai Gruppi</a>
            </div>`;
        return;
    }

    booksList.innerHTML = '';

    for (const book of books) {
        const isOwner   = book.owner_id === currentUser?.id;
        const groupName = book.groups?.name ?? '';

        const actionsHtml = isOwner ? `
            <div class="book-card-actions">
                <button class="edit-button"   onclick="editBook('${book.id}')">Modifica</button>
                <button class="delete-button" onclick="deleteBook('${book.id}')">Elimina</button>
            </div>` : '';

        const card = document.createElement('div');
        card.className = 'book-card';
        card.innerHTML = `
            <div class="book-card-title">${sanitize(book.title)}</div>
            <div class="book-card-author">${sanitize(book.author)}</div>
            <div class="book-card-meta">
                Aggiunto da ${sanitize(book.added_by)}
                ${book.end_date  ? ' &middot; ' + sanitize(book.end_date) : ''}
                ${groupName      ? ' &middot; <em>' + sanitize(groupName) + '</em>' : ''}
            </div>
            <div class="book-card-footer">
                <a href="scheda.html?id=${book.id}" class="link-view">Visualizza scheda</a>
                ${actionsHtml}
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
            loadGroupBooks();
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

    document.getElementById('edit-addedBy').value         = book.added_by          ?? '';
    document.getElementById('edit-title').value           = book.title              ?? '';
    document.getElementById('edit-author').value          = book.author             ?? '';
    document.getElementById('edit-publicationDate').value = book.publication_date   ?? '';
    document.getElementById('edit-pages').value           = book.pages              ?? '';
    document.getElementById('edit-startDate').value       = book.start_date         ?? '';
    document.getElementById('edit-endDate').value         = book.end_date           ?? '';
    document.getElementById('edit-quote').value           = book.quote              ?? '';
    document.getElementById('edit-summary').value         = book.summary            ?? '';
    document.getElementById('edit-notes').value           = book.notes              ?? '';

    editSection.style.display = 'block';
    editSection.scrollIntoView({ behavior: 'smooth' });

    editForm.onsubmit = async function (e) {
        e.preventDefault();
        const pagesVal = document.getElementById('edit-pages').value;

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
        }).eq('id', bookId);

        if (updateError) {
            showToast('Errore durante l\'aggiornamento.', 'error');
        } else {
            showToast('Scheda aggiornata!', 'success');
            editSection.style.display = 'none';
            loadGroupBooks();
        }
    };
}
window.editBook = editBook;

document.getElementById('cancel-edit-button').addEventListener('click', () => {
    document.getElementById('edit-section').style.display = 'none';
});

document.getElementById('logout-link').addEventListener('click', async (e) => {
    e.preventDefault();
    await db.auth.signOut();
    window.location.href = 'login.html';
});

// --- Inizializzazione ---
(async () => {
    currentUser = await requireAuth();
    if (!currentUser) return;
    await loadGroupBooks();
})();
