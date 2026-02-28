// firebase-init.js è già caricato prima di questo file

function getBookIdFromUrl() {
    return new URLSearchParams(window.location.search).get('id');
}

function loadBookDetails() {
    const bookId = getBookIdFromUrl();
    const container = document.getElementById('book-details');

    if (!bookId) {
        container.innerHTML = '<p>ID del libro non valido.</p>';
        return;
    }

    database.ref('books/' + bookId).once('value')
        .then((snapshot) => {
            if (!snapshot.exists()) {
                container.innerHTML = '<p>Libro non trovato.</p>';
                return;
            }

            const book = snapshot.val();
            container.innerHTML = `
                <div class="book-detail-header">
                    <h1>${sanitize(book.title)}</h1>
                    <p>di <strong>${sanitize(book.author)}</strong></p>
                    <p class="book-detail-meta">Aggiunto da <strong>${sanitize(book.addedBy)}</strong></p>
                </div>

                <div class="detail-rows">
                    <div class="detail-row">
                        <span class="dr-label">Anno di pubblicazione</span>
                        <span class="dr-value">${sanitize(book.publicationDate || '—')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="dr-label">Numero di pagine</span>
                        <span class="dr-value">${book.pages ? sanitize(String(book.pages)) + ' pag.' : '—'}</span>
                    </div>
                    <div class="detail-row">
                        <span class="dr-label">Inizio lettura</span>
                        <span class="dr-value">${sanitize(book.startDate || '—')}</span>
                    </div>
                    <div class="detail-row">
                        <span class="dr-label">Fine lettura</span>
                        <span class="dr-value">${sanitize(book.endDate || '—')}</span>
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
        })
        .catch((error) => {
            console.error('Errore:', error);
            container.innerHTML = '<p>Errore durante il caricamento. Riprova più tardi.</p>';
        });
}

document.getElementById('logout-link').addEventListener('click', (e) => {
    e.preventDefault();
    auth.signOut().then(() => { window.location.href = 'login.html'; });
});

auth.onAuthStateChanged((user) => {
    if (user) {
        loadBookDetails();
    } else {
        window.location.href = 'login.html';
    }
});
