// firebase-init.js è già caricato prima di questo file

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
    booksList.innerHTML = '<p style="color:var(--text-3);padding:20px 0;font-size:15px;">Caricamento in corso...</p>';
    const currentUser = auth.currentUser;

    database.ref('books').once('value')
        .then((snapshot) => {
            if (!snapshot.exists()) {
                booksList.innerHTML = `
                    <div class="empty-state">
                        <h3>Nessun libro nel catalogo</h3>
                        <p>Il gruppo non ha ancora aggiunto nessun libro.</p>
                        <a href="aggiungi_libro.html" class="btn-primary btn">Aggiungi il primo libro</a>
                    </div>`;
                return;
            }

            booksList.innerHTML = '';
            snapshot.forEach((childSnapshot) => {
                const book = childSnapshot.val();
                const bookId = childSnapshot.key;

                let actionsHtml = '';
                if (currentUser && book.ownerUid === currentUser.uid) {
                    actionsHtml = `
                        <div class="book-card-actions">
                            <button class="edit-button" onclick="editBook('${bookId}')">Modifica</button>
                            <button class="delete-button" onclick="deleteBook('${bookId}')">Elimina</button>
                        </div>
                    `;
                }

                const bookCard = document.createElement('div');
                bookCard.classList.add('book-card');
                bookCard.innerHTML = `
                    <div class="book-card-title">${sanitize(book.title)}</div>
                    <div class="book-card-author">${sanitize(book.author)}</div>
                    <div class="book-card-meta">Aggiunto da ${sanitize(book.addedBy)}${book.endDate ? ' &middot; ' + sanitize(book.endDate) : ''}</div>
                    <div class="book-card-footer">
                        <a href="scheda.html?id=${bookId}" class="link-view">Visualizza scheda</a>
                        ${actionsHtml}
                    </div>
                `;
                booksList.appendChild(bookCard);
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
