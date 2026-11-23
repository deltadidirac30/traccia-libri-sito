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
        <button class="like-btn like-btn-lg ${liked ? 'liked' : ''}" id="like-btn" aria-pressed="${liked}">
            ${likeInner(liked, count ?? 0, 'id="like-count"')}
        </button>`;

    document.getElementById('like-btn').addEventListener('click', async () => {
        const btn      = document.getElementById('like-btn');
        const countEl  = document.getElementById('like-count');
        const isLiked  = btn.classList.contains('liked');
        btn.disabled   = true;

        if (isLiked) {
            const { error } = await db.from('book_likes').delete().eq('book_id', bookId).eq('user_id', currentUser.id);
            if (!error) {
                btn.classList.remove('liked');
                btn.setAttribute('aria-pressed', 'false');
                btn.innerHTML = likeInner(false, Math.max(0, parseInt(countEl.textContent) - 1), 'id="like-count"');
            } else {
                showToast('Errore durante la rimozione del like', 'error');
            }
        } else {
            const { error } = await db.from('book_likes').insert({ book_id: bookId, user_id: currentUser.id });
            if (!error) {
                btn.classList.add('liked');
                btn.setAttribute('aria-pressed', 'true');
                btn.innerHTML = likeInner(true, parseInt(countEl.textContent) + 1, 'id="like-count"');
            } else {
                showToast('Errore durante il like', 'error');
            }
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
        .select('id, content, created_at, user_id, profiles(nickname)')
        .eq('book_id', bookId)
        .order('created_at', { ascending: true });

    const listEl = document.getElementById('comments-list');
    listEl.innerHTML = '';

    if (!comments || comments.length === 0) {
        listEl.innerHTML = '<p class="comments-empty">Ancora nessun commento. Scrivi il primo.</p>';
    } else {
        for (const c of comments) {
            const isOwn = c.user_id === currentUser.id;
            const item  = document.createElement('div');
            item.className = 'comment-item';
            item.dataset.id = c.id;
            item.innerHTML = `
                <div class="comment-header">
                    <span class="comment-author">${sanitize(c.profiles?.nickname ?? '?')}</span>
                    <span class="comment-date">${formatDate(c.created_at)}</span>
                    ${isOwn ? `<button class="comment-delete-btn" data-id="${c.id}" aria-label="Elimina commento">${icon('x', 14)}</button>` : ''}
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
            showToast('Commento eliminato', 'success');
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

    const period = readingPeriod(book.start_date, book.end_date);
    document.title = `${book.title} — Traccia Libri`;
    container.innerHTML = `
        <aside class="book-aside">
            ${bookCover(book, 'lg')}
            <dl class="detail-rows">
                <div class="detail-row">
                    <dt class="dr-label">Pubblicato</dt>
                    <dd class="dr-value">${sanitize(book.publication_date || '—')}</dd>
                </div>
                <div class="detail-row">
                    <dt class="dr-label">Pagine</dt>
                    <dd class="dr-value">${book.pages ? sanitize(String(book.pages)) : '—'}</dd>
                </div>
                <div class="detail-row">
                    <dt class="dr-label">Inizio lettura</dt>
                    <dd class="dr-value">${sanitize(formatDate(book.start_date) || '—')}</dd>
                </div>
                <div class="detail-row">
                    <dt class="dr-label">Fine lettura</dt>
                    <dd class="dr-value">${sanitize(formatDate(book.end_date) || '—')}</dd>
                </div>
            </dl>
        </aside>

        <article class="book-main">
            <header class="book-detail-header">
                <h1>${sanitize(book.title)}</h1>
                <p class="book-detail-author">${sanitize(book.author)}</p>
                <p class="book-detail-meta">
                    <span>Aggiunto da ${sanitize(book.added_by)}</span>
                    ${period ? `<span class="period">${sanitize(period)}</span>` : ''}
                    ${book.visibility === 'group' ? '' : `<span class="visibility-tag">${icon('lock', 14)} Privato</span>`}
                </p>
            </header>

            ${book.quote ? `
            <figure class="detail-quote">
                <blockquote class="book-quote">${sanitize(book.quote)}</blockquote>
                <figcaption>Citazione preferita</figcaption>
            </figure>` : ''}

            ${book.summary ? `
            <section class="detail-section">
                <h2 class="ds-label">Il libro in una frase</h2>
                <p class="ds-text ds-summary">${sanitize(book.summary)}</p>
            </section>` : ''}

            ${book.notes ? `
            <section class="detail-section">
                <h2 class="ds-label">Note di lettura</h2>
                <p class="ds-text">${sanitize(book.notes)}</p>
            </section>` : ''}

            <div class="social-bar social-bar-detail" id="likes-section"></div>

            ${book.visibility === 'group' ? `
            <section class="comments-section" id="comments-section">
                <h2 class="section-title" id="commenti">Commenti</h2>
                <div id="comments-list"></div>
                <form class="comment-form" id="comment-form">
                    <textarea class="comment-input" id="comment-input" placeholder="Scrivi un commento" maxlength="1000" rows="3" required></textarea>
                    <button type="submit" class="comment-submit">Invia</button>
                </form>
            </section>` : ''}
        </article>
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
                showToast('Errore durante l\'invio del commento', 'error');
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
    initNavbar();   // in parallelo con i dati della pagina
    await loadBookDetails();
})();
