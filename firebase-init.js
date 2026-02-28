// Configurazione Firebase — inizializzata una sola volta
const firebaseConfig = {
    apiKey: "AIzaSyDFwao-F6AEm_E41IHf3MakTd7i5w_IriY",
    authDomain: "traccia-libri.firebaseapp.com",
    databaseURL: "https://traccia-libri-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "traccia-libri",
    storageBucket: "traccia-libri.firebasestorage.app",
    messagingSenderId: "320630247758",
    appId: "1:320630247758:web:a563f790572d33781cce1f",
    measurementId: "G-LMTQ0DG9ZR"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const database = firebase.database();

// Sanitizza stringhe per prevenire XSS nei contesti innerHTML
function sanitize(str) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str ?? ''));
    return div.innerHTML;
}

// Toast non-bloccante al posto di alert()
function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => toast.classList.add('toast-show'), 10);
    setTimeout(() => {
        toast.classList.remove('toast-show');
        setTimeout(() => toast.remove(), 350);
    }, 3500);
}
