// firebase-init.js è già caricato prima di questo file

// Auth guard: redirect se non autenticato
auth.onAuthStateChanged((user) => {
    if (!user) {
        window.location.href = 'login.html';
    }
});

// Logout
const logoutLink = document.getElementById('logout-link');
if (logoutLink) {
    logoutLink.addEventListener('click', (e) => {
        e.preventDefault();
        auth.signOut().then(() => {
            window.location.href = 'login.html';
        });
    });
}

// --- Gestione form aggiunta libro ---
const bookForm = document.getElementById('book-form');

if (bookForm) {
    bookForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const user = auth.currentUser;

        if (!user) {
            showToast('Devi essere autenticato per inserire un libro.', 'error');
            return;
        }

        const saveBtn = document.getElementById('save-btn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span> Salvataggio...';

        database.ref('users/' + user.uid).once('value').then((snapshot) => {
            if (!snapshot.exists() || !snapshot.val().nickname) {
                showToast('Errore: impossibile trovare il tuo nickname.', 'error');
                return Promise.reject('Nickname non trovato');
            }
            const userNickname = snapshot.val().nickname;

            const newBook = {
                ownerUid:        user.uid,
                createdAt:       firebase.database.ServerValue.TIMESTAMP,
                addedBy:         userNickname,
                title:           document.getElementById('title').value,
                author:          document.getElementById('author').value,
                publicationDate: document.getElementById('publicationDate').value,
                pages:           document.getElementById('pages').value,
                startDate:       document.getElementById('startDate').value,
                endDate:         document.getElementById('endDate').value,
                quote:           document.getElementById('quote').value,
                summary:         document.getElementById('summary').value,
                notes:           document.getElementById('notes').value
            };

            return database.ref('books').push(newBook);
        })
        .then(() => {
            showToast('Libro salvato con successo!', 'success');
            bookForm.reset();
            saveBtn.disabled = false;
            saveBtn.textContent = 'Salva scheda di lettura';
        })
        .catch((error) => {
            if (error !== 'Nickname non trovato') {
                showToast('Si è verificato un errore durante il salvataggio.', 'error');
            }
            saveBtn.disabled = false;
            saveBtn.textContent = 'Salva scheda di lettura';
        });
    });
}
