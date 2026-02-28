// firebase-init.js è già caricato prima di questo file

function getBookIdFromUrl() {
    return new URLSearchParams(window.location.search).get('id');
}

function loadBookDetails() {
    const bookId = getBookIdFromUrl();
    const bookDetailsContainer = document.getElementById('book-details');

    if (!bookId) {
        bookDetailsContainer.innerHTML = '<p>ID del libro non valido.</p>';
        return;
    }

    database.ref('books/' + bookId).once('value')
        .then((snapshot) => {
            if (!snapshot.exists()) {
                bookDetailsContainer.innerHTML = '<p>Libro non trovato.</p>';
                return;
            }

            const book = snapshot.val();
            bookDetailsContainer.innerHTML = `
                <h2>${sanitize(book.title)}</h2>
                <p><strong>Autore:</strong> ${sanitize(book.author)}</p>
                <p><strong>Aggiunto da:</strong> ${sanitize(book.addedBy)}</p>
                <p><strong>Anno di pubblicazione:</strong> ${sanitize(book.publicationDate || 'N/A')}</p>
                <p><strong>Numero di pagine:</strong> ${sanitize(book.pages || 'N/A')}</p>
                <h3>Stato di lettura</h3>
                <p><strong>Inizio lettura:</strong> ${sanitize(book.startDate || 'N/A')}</p>
                <p><strong>Fine lettura:</strong> ${sanitize(book.endDate || 'N/A')}</p>
                <h3>Citazione preferita</h3>
                <p>${sanitize(book.quote || 'Nessuna citazione inserita.')}</p>
                <h3>Il libro in una frase</h3>
                <p>${sanitize(book.summary || 'Nessuna frase inserita.')}</p>
                <h3>Note di lettura / Personaggi memorabili</h3>
                <p>${sanitize(book.notes || 'Nessuna nota inserita.')}</p>
            `;
        })
        .catch((error) => {
            console.error('Errore durante il caricamento dei dettagli del libro:', error);
            bookDetailsContainer.innerHTML = '<p>Errore durante il caricamento. Riprova più tardi.</p>';
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
