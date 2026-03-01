// supabaseClient.js è già caricato prima di questo file

let currentUser = null;

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

    // Batch carica like e commenti
    const bookIds = books.map(b => b.id);
    const [{ data: allLikes }, { data: myLikes }, { data: allComments }] = await Promise.all([
        db.from('book_likes').select('book_id').in('book_id', bookIds),
        db.from('book_likes').select('book_id').in('book_id', bookIds).eq('user_id', currentUser.id),
        db.from('book_comments').select('book_id').in('book_id', bookIds)
    ]);

    const likeCounts    = {};
    const commentCounts = {};
    const myLikedSet    = new Set(myLikes?.map(l => l.book_id) ?? []);
    for (const l of allLikes ?? []) likeCounts[l.book_id] = (likeCounts[l.book_id] ?? 0) + 1;
    for (const c of allComments ?? []) commentCounts[c.book_id] = (commentCounts[c.book_id] ?? 0) + 1;

    for (const book of books) {
        const isOwner      = book.owner_id === currentUser?.id;
        const groupName    = book.groups?.name ?? '';
        const liked        = myLikedSet.has(book.id);
        const likeCount    = likeCounts[book.id] ?? 0;
        const commentCount = commentCounts[book.id] ?? 0;

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
            </div>
            <div class="social-bar">
                <button class="like-btn ${liked ? 'liked' : ''}" data-book-id="${book.id}">
                    ${liked ? '♥' : '♡'} <span class="like-num">${likeCount}</span>
                </button>
                <a href="scheda.html?id=${book.id}" class="comment-toggle-btn">
                    💬 ${commentCount}
                </a>
            </div>`;
        booksList.appendChild(card);
    }

}

// Like toggle via event delegation (un solo listener sull'elemento stabile)
document.getElementById('books-list').addEventListener('click', async (e) => {
    const likeBtn = e.target.closest('.like-btn');
    if (!likeBtn || !currentUser) return;
    likeBtn.disabled = true;
    const bookId   = likeBtn.dataset.bookId;
    const wasLiked = likeBtn.classList.contains('liked');
    const countEl  = likeBtn.querySelector('.like-num');
    if (wasLiked) {
        await db.from('book_likes').delete().eq('book_id', bookId).eq('user_id', currentUser.id);
        likeBtn.classList.remove('liked');
        likeBtn.innerHTML = `♡ <span class="like-num">${Math.max(0, parseInt(countEl.textContent) - 1)}</span>`;
    } else {
        await db.from('book_likes').insert({ book_id: bookId, user_id: currentUser.id });
        likeBtn.classList.add('liked');
        likeBtn.innerHTML = `♥ <span class="like-num">${parseInt(countEl.textContent) + 1}</span>`;
    }
    likeBtn.disabled = false;
});

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

// --- Inizializzazione ---
(async () => {
    currentUser = await requireAuth();
    if (!currentUser) return;
    await initNavbar();
    await loadGroupBooks();
})();
