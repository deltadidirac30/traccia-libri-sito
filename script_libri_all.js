// firebase-init.js è già caricato prima di questo file

const CARD_GRADIENTS = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)',
    'linear-gradient(135deg, #fd7043 0%, #f06292 100%)',
    'linear-gradient(135deg, #26c6da 0%, #7c4dff 100%)',
];

function showConfirm(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';
    overlay.innerHTML = `
        <div class="confirm-box">
            <div class="confirm-icon">🗑️</div>
            <p>${sanitize(message)}</p>
            <p class="confirm-sub">Questa azione non può essere annullata.</p>
            <div class="confirm-actions">
                <button class="btn-danger" id="confirm-yes">Sì, elimina</button>
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
    booksList.innerHTML = '<p style="color:var(--text-muted);padding:20px 0">Caricamento in corso...</p>';
    const currentUser = auth.currentUser;

    database.ref('books').once('value')
        .then((snapshot) => {
            if (!snapshot.exists()) {
                booksList.innerHTML = `
                    <div class="empty-state">
                        <span class="empty-icon">📭</span>
                        <h3>Nessun libro ancora</h3>
                        <p>Il gruppo non ha aggiunto nessun libro. Sii il primo!</p>
                        <a href="aggiungi_libro.html" class="btn">Aggiungi il primo libro</a>
                    </div>`;
                return;
            }

            booksList.innerHTML = '';
            let index = 0;
            snapshot.forEach((childSnapshot) => {
                const book = childSnapshot.val();
                const bookId = childSnapshot.key;
                const gradient = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
                index++;

                let actionsHtml = '';
                if (currentUser && book.ownerUid === currentUser.uid) {
                    actionsHtml = `
                        <div class="card-actions">
                            <button class="edit-button" onclick="editBook('${bookId}')">Modifica</button>
                            <button class="delete-button" onclick="deleteBook('${bookId}')">✕</button>
                        </div>
                    `;
                }

                const bookCard = document.createElement('div');
                bookCard.classList.add('book-card');
                bookCard.innerHTML = `
                    <div class="book-card-header" style="background:${gradient}">
                        <h3>${sanitize(book.title)}</h3>
                    </div>
                    <div class="book-card-body">
                        <div class="meta-row">
                            <span class="meta-label">Autore</span>
                            <span class="meta-value">${sanitize(book.author)}</span>
                        </div>
                        <div class="meta-row">
                            <span class="meta-label">Aggiunto da</span>
                            <span class="meta-value">${sanitize(book.addedBy)}</span>
                        </div>
                        ${book.endDate ? `<div class="meta-row"><span class="meta-label">Fine lettura</span><span class="meta-value">${sanitize(book.endDate)}</span></div>` : ''}
                    </div>
                    <div class="book-card-footer">
                        <a href="scheda.html?id=${bookId}" class="btn-card-view">Scheda completa →</a>
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
