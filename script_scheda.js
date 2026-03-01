// supabaseClient.js è già caricato prima di questo file

let currentUser = null;

function getBookIdFromUrl() {
    return new URLSearchParams(window.location.search).get('id');
}

// --- Like ---
async function loadLikes(book) {
    const bookId = book.id;
    const wrap   = document.getElementById('likes-section');
    if (!wrap) return;

    const [{ count }, { data: myLike }] = await Promise.all([
        db.from('book_likes').select('*', { count: 'exact', head: true }).eq('book_id', bookId),
        db.from('book_likes').select('book_id').eq('book_id', bookId).eq('user_id', currentUser.id).maybeSingle()
    ]);

    const liked = !!myLike;
    wrap.innerHTML = `
        <button class="like-btn ${liked ? 'liked' : ''}" id="like-btn">
            ${liked ? '♥' : '♡'} <span id="like-count">${count ?? 0}</span>
        </button>`;

    document.getElementById('like-btn').addEventListener('click', async () => {
        const btn      = document.getElementById('like-btn');
        const countEl  = document.getElementById('like-count');
        const isLiked  = btn.classList.contains('liked');
        btn.disabled   = true;

        if (isLiked) {
            await db.from('book_likes').delete().eq('book_id', bookId).eq('user_id', currentUser.id);
            btn.classList.remove('liked');
            btn.innerHTML = `♡ <span id="like-count">${Math.max(0, parseInt(countEl.textContent) - 1)}</span>`;
        } else {
            await db.from('book_likes').insert({ book_id: bookId, user_id: currentUser.id });
            btn.classList.add('liked');
            btn.innerHTML = `♥ <span id="like-count">${parseInt(countEl.textContent) + 1}</span>`;
        }
        btn.disabled = false;
    });
}

// --- Commenti ---
async function loadComments(bookId) {
    const wrap = document.getElementById('comments-section');
    if (!wrap) return;

    const { data: comments } = await db
        .from('book_comments')
        .select('id, content, created_at, profiles(nickname)')
        .eq('book_id', bookId)
        .order('created_at', { ascending: true });

    const listEl = document.getElementById('comments-list');
    listEl.innerHTML = '';

    if (!comments || comments.length === 0) {
        listEl.innerHTML = '<p style="color:var(--t3);font-size:14px;">Ancora nessun commento.</p>';
    } else {
        for (const c of comments) {
            const isOwn = c.user_id === currentUser.id;
            const item  = document.createElement('div');
            item.className = 'comment-item';
            item.dataset.id = c.id;
            item.innerHTML = `
                <div class="comment-header">
                    <span class="comment-author">${sanitize(c.profiles?.nickname ?? '?')}</span>
                    <span class="comment-date">${new Date(c.created_at).toLocaleDateString('it-IT')}</span>
                    ${isOwn ? `<button class="comment-delete-btn" data-id="${c.id}">✕</button>` : ''}
                </div>
                <p class="comment-text">${sanitize(c.content)}</p>`;
            listEl.appendChild(item);
        }
    }

    // Event delegation per eliminazione commenti
    listEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('.comment-delete-btn');
        if (!btn) return;
        const commentId = btn.dataset.id;
        const { error } = await db.from('book_comments').delete().eq('id', commentId);
        if (!error) {
            btn.closest('.comment-item').remove();
            showToast('Commento eliminato.', 'success');
        }
    });
}

async function loadBookDetails() {
    const bookId    = getBookIdFromUrl();
    const container = document.getElementById('book-details');

    if (!bookId) {
        container.innerHTML = '<p>ID del libro non valido.</p>';
        return;
    }

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

        <div class="social-bar" id="likes-section"></div>

        ${book.visibility === 'group' ? `
        <div class="comments-section" id="comments-section">
            <div class="section-title">Commenti</div>
            <div id="comments-list"></div>
            <form class="comment-form" id="comment-form">
                <textarea class="comment-input" id="comment-input" placeholder="Scrivi un commento..." maxlength="1000" rows="3" required></textarea>
                <button type="submit" class="comment-submit">Invia</button>
            </form>
        </div>` : ''}
    `;

    // Social
    await loadLikes(book);
    if (book.visibility === 'group') {
        await loadComments(bookId);
        document.getElementById('comment-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const input   = document.getElementById('comment-input');
            const content = input.value.trim();
            if (!content) return;
            const btn = e.submitter;
            btn.disabled = true;
            const { error } = await db.from('book_comments').insert({
                book_id: bookId,
                user_id: currentUser.id,
                content
            });
            if (error) {
                showToast('Errore durante l\'invio del commento.', 'error');
            } else {
                input.value = '';
                await loadComments(bookId);
            }
            btn.disabled = false;
        });
    }
}

// --- Inizializzazione ---
(async () => {
    currentUser = await requireAuth();
    if (!currentUser) return;
    await initNavbar();
    await loadBookDetails();
})();
