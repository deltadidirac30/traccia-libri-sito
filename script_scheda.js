// supabaseClient.js è già caricato prima di questo file

function getBookIdFromUrl() {
    return new URLSearchParams(window.location.search).get('id');
}

async function loadBookDetails() {
    const bookId    = getBookIdFromUrl();
    const container = document.getElementById('book-details');

    if (!bookId) {
        container.innerHTML = '<p>ID del libro non valido.</p>';
        return;
    }

    // La RLS garantisce che l'utente veda solo libri a cui ha accesso
    const { data: book, error } = await db
        .from('books')
        .select('*')
        .eq('id', bookId)
        .single();

    if (error || !book) {
        container.innerHTML = '<p>Libro non trovato o non hai i permessi per visualizzarlo.</p>';
        return;
    }

    container.innerHTML = `
        <div class="book-detail-header">
            <h1>${sanitize(book.title)}</h1>
            <p>di <strong>${sanitize(book.author)}</strong></p>
            <p class="book-detail-meta">Aggiunto da <strong>${sanitize(book.added_by)}</strong></p>
        </div>

        <div class="detail-rows">
            <div class="detail-row">
                <span class="dr-label">Anno di pubblicazione</span>
                <span class="dr-value">${sanitize(book.publication_date || '—')}</span>
            </div>
            <div class="detail-row">
                <span class="dr-label">Numero di pagine</span>
                <span class="dr-value">${book.pages ? sanitize(String(book.pages)) + ' pag.' : '—'}</span>
            </div>
            <div class="detail-row">
                <span class="dr-label">Inizio lettura</span>
                <span class="dr-value">${sanitize(book.start_date || '—')}</span>
            </div>
            <div class="detail-row">
                <span class="dr-label">Fine lettura</span>
                <span class="dr-value">${sanitize(book.end_date || '—')}</span>
            </div>
        </div>

        ${book.quote ? `
        <div class="detail-section">
            <div class="ds-label">Citazione preferita</div>
            <blockquote class="book-quote">${sanitize(book.quote)}</blockquote>
        </div>` : ''}

        ${book.summary ? `
        <div class="detail-section">
            <div class="ds-label">Il libro in una frase</div>
            <p class="ds-text">${sanitize(book.summary)}</p>
        </div>` : ''}

        ${book.notes ? `
        <div class="detail-section">
            <div class="ds-label">Note di lettura</div>
            <p class="ds-text">${sanitize(book.notes)}</p>
        </div>` : ''}
    `;
}

document.getElementById('logout-link').addEventListener('click', async (e) => {
    e.preventDefault();
    await db.auth.signOut();
    window.location.href = 'login.html';
});

// --- Inizializzazione ---
(async () => {
    const user = await requireAuth();
    if (!user) return;
    await loadBookDetails();
})();
