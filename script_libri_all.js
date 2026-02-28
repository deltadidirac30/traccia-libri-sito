// firebase-init.js è già caricato prima di questo file

function showConfirm(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-box">
            <p>${sanitize(message)}</p>
            <div class="confirm-actions">
                <button class="btn-danger" id="confirm-yes">Elimina</button>
                <button class="btn-secondary" id="confirm-no">Annulla</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#confirm-yes').addEventListener('click', () => {
        overlay.remove();
        onConfirm();
    });
    overlay.querySelector('#confirm-no').addEventListener('click', () => overlay.remove());
}

function loadAllBooks() {
    const booksList = document.getElementById('books-list');
    booksList.innerHTML = '<p>Caricamento in corso...</p>';
    const currentUser = auth.currentUser;

    database.ref('books').once('value')
        .then((snapshot) => {
            if (!snapshot.exists()) {
                booksList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-icon">📭</div>
                        <p>Nessun libro salvato ancora.</p>
                        <a href="aggiungi_libro.html" class="btn">Aggiungi il primo libro</a>
                    </div>`;
                return;
            }

            booksList.innerHTML = '';
            snapshot.forEach((childSnapshot) => {
                const book = childSnapshot.val();
                const bookId = childSnapshot.key;
                const createdText = book.createdAt ? new Date(book.createdAt).toLocaleString('it-IT') : 'N/A';

                let actionsHtml = '';
                if (currentUser && book.ownerUid === currentUser.uid) {
                    actionsHtml = `
                        <button class="edit-button" onclick="editBook('${bookId}')">Modifica scheda</button>
                        <button class="delete-button" onclick="deleteBook('${bookId}')">✕</button>
                    `;
                }

                const bookItem = document.createElement('div');
                bookItem.classList.add('book-item');
                bookItem.innerHTML = `
                    <h3>${sanitize(book.title)}</h3>
                    <p><strong>Autore:</strong> ${sanitize(book.author)}</p>
                    <p><strong>Aggiunto da:</strong> ${sanitize(book.addedBy)}</p>
                    <p><strong>Data creazione:</strong> ${sanitize(createdText)}</p>
                    <div class="book-actions">
                        <a href="scheda.html?id=${bookId}" class="view-details">Visualizza scheda completa</a>
                        ${actionsHtml}
                    </div>
                `;
                booksList.appendChild(bookItem);
            });
        })
        .catch((error) => {
            console.error('Errore durante il caricamento dei libri:', error);
            booksList.innerHTML = '<p>Errore durante il caricamento dei libri. Riprova più tardi.</p>';
        });
}

function deleteBook(bookId) {
    showConfirm('Sei sicuro di voler eliminare questo libro?', () => {
        database.ref('books/' + bookId).remove()
            .then(() => {
                showToast('Libro eliminato con successo.', 'success');
                loadAllBooks();
            })
            .catch(() => showToast('Errore durante l\'eliminazione.', 'error'));
    });
}

function editBook(bookId) {
    const editSection = document.getElementById('edit-section');
    const editForm    = document.getElementById('edit-form');
    const bookRef     = database.ref('books/' + bookId);

    bookRef.once('value')
        .then((snapshot) => {
            if (!snapshot.exists()) {
                showToast('Libro non trovato.', 'error');
                return;
            }

            const book = snapshot.val();
            document.getElementById('edit-addedBy').value         = book.addedBy || '';
            document.getElementById('edit-title').value           = book.title || '';
            document.getElementById('edit-author').value          = book.author || '';
            document.getElementById('edit-publicationDate').value = book.publicationDate || '';
            document.getElementById('edit-pages').value           = book.pages || '';
            document.getElementById('edit-startDate').value       = book.startDate || '';
            document.getElementById('edit-endDate').value         = book.endDate || '';
            document.getElementById('edit-quote').value           = book.quote || '';
            document.getElementById('edit-summary').value         = book.summary || '';
            document.getElementById('edit-notes').value           = book.notes || '';

            editSection.style.display = 'block';
            editSection.scrollIntoView({ behavior: 'smooth' });

            editForm.onsubmit = function (e) {
                e.preventDefault();
                const updatedBook = {
                    addedBy:         document.getElementById('edit-addedBy').value,
                    title:           document.getElementById('edit-title').value,
                    author:          document.getElementById('edit-author').value,
                    publicationDate: document.getElementById('edit-publicationDate').value,
                    pages:           document.getElementById('edit-pages').value,
                    startDate:       document.getElementById('edit-startDate').value,
                    endDate:         document.getElementById('edit-endDate').value,
                    quote:           document.getElementById('edit-quote').value,
                    summary:         document.getElementById('edit-summary').value,
                    notes:           document.getElementById('edit-notes').value
                };

                bookRef.update(updatedBook)
                    .then(() => {
                        showToast('Scheda aggiornata con successo!', 'success');
                        editSection.style.display = 'none';
                        loadAllBooks();
                    })
                    .catch(() => showToast('Errore durante l\'aggiornamento.', 'error'));
            };
        })
        .catch(() => showToast('Errore durante il caricamento del libro.', 'error'));
}

document.getElementById('cancel-edit-button').addEventListener('click', () => {
    document.getElementById('edit-section').style.display = 'none';
});

document.getElementById('logout-link').addEventListener('click', (e) => {
    e.preventDefault();
    auth.signOut().then(() => { window.location.href = 'login.html'; });
});

auth.onAuthStateChanged((user) => {
    if (user) {
        loadAllBooks();
    } else {
        window.location.href = 'login.html';
    }
});
