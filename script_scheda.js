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
                <h2 class="book-detail-title">${sanitize(book.title)}</h2>
                <p class="book-detail-author">di <strong>${sanitize(book.author)}</strong> &nbsp;·&nbsp; Aggiunto da <strong>${sanitize(book.addedBy)}</strong></p>

                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="d-label">Anno di pubblicazione</div>
                        <div class="d-value">${sanitize(book.publicationDate || '—')}</div>
                    </div>
                    <div class="detail-item">
                        <div class="d-label">Numero di pagine</div>
                        <div class="d-value">${sanitize(book.pages || '—')}</div>
                    </div>
                    <div class="detail-item">
                        <div class="d-label">Inizio lettura</div>
                        <div class="d-value">${sanitize(book.startDate || '—')}</div>
                    </div>
                    <div class="detail-item">
                        <div class="d-label">Fine lettura</div>
                        <div class="d-value">${sanitize(book.endDate || '—')}</div>
                    </div>
                </div>

                ${book.quote ? `
                <div class="detail-block">
                    <h3>💬 Citazione preferita</h3>
                    <p>${sanitize(book.quote)}</p>
                </div>` : ''}

                ${book.summary ? `
                <div class="detail-block">
                    <h3>📝 Il libro in una frase</h3>
                    <p>${sanitize(book.summary)}</p>
                </div>` : ''}

                ${book.notes ? `
                <div class="detail-block">
                    <h3>🗒️ Note di lettura</h3>
                    <p>${sanitize(book.notes)}</p>
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
