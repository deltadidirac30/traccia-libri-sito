// supabaseClient.js è già caricato prima di questo file

let currentUser = null;

function renderList(containerId, items, renderFn, emptyMsg) {
    const el = document.getElementById(containerId);
    if (!items || items.length === 0) {
        el.innerHTML = `<p class="activity-empty">${emptyMsg}</p>`;
        return;
    }
    el.innerHTML = items.map(renderFn).join('');
}

async function loadActivity() {
    const uid = currentUser.id;

    // Le richieste che non dipendono dai libri dell'utente partono subito, insieme a quella dei libri
    const independent = Promise.all([
        db.from('books').select('*', { count: 'exact', head: true }).eq('owner_id', uid),
        db.from('group_members').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        db.from('book_comments').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        db.from('book_likes').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        db.from('book_comments')
            .select('id, content, created_at, books(id, title)')
            .eq('user_id', uid)
            .order('created_at', { ascending: false })
            .limit(5),
        db.from('book_likes')
            .select('book_id, created_at, books(id, title)')
            .eq('user_id', uid)
            .order('created_at', { ascending: false })
            .limit(5),
    ]);
    independent.catch(() => {});

    // I libri dell'utente servono per grafici e per "ricevuti"
    const { data: myBooks } = await db.from('books').select('id, title, pages, start_date, end_date').eq('owner_id', uid);
    const myBookIds = (myBooks ?? []).map(b => b.id);
    renderReadingStats(document.getElementById('reading-stats'), myBooks ?? []);

    const [
        [booksCountResult, groupsCountResult, commentsCountResult, likesCountResult, commentsSentResult, likesGivenResult],
        likesReceivedResult,
        commentsReceivedResult
    ] = await Promise.all([
        independent,
        myBookIds.length > 0
            ? db.from('book_likes')
                .select('book_id, created_at, books(id, title)')
                .in('book_id', myBookIds)
                .neq('user_id', uid)
                .order('created_at', { ascending: false })
                .limit(5)
            : Promise.resolve({ data: [] }),
        myBookIds.length > 0
            ? db.from('book_comments')
                .select('id, content, created_at, books(id, title)')
                .in('book_id', myBookIds)
                .neq('user_id', uid)
                .order('created_at', { ascending: false })
                .limit(5)
            : Promise.resolve({ data: [] })
    ]);

    // Stats
    document.getElementById('stat-books').textContent    = booksCountResult.count ?? 0;
    document.getElementById('stat-groups').textContent   = groupsCountResult.count ?? 0;
    document.getElementById('stat-comments').textContent = commentsCountResult.count ?? 0;
    document.getElementById('stat-likes').textContent    = likesCountResult.count ?? 0;

    // Commenti scritti
    renderList(
        'list-comments-sent',
        commentsSentResult.data,
        c => `<div class="activity-item">
            <span class="activity-item-text">
                <a href="scheda.html?id=${c.books?.id}" class="activity-item-book">${sanitize(c.books?.title ?? '—')}</a>
                <span class="activity-item-excerpt">${sanitize(c.content.substring(0, 80))}${c.content.length > 80 ? '…' : ''}</span>
            </span>
            <span class="activity-item-date">${formatDate(c.created_at)}</span>
        </div>`,
        'Nessun commento scritto'
    );

    // Commenti ricevuti
    renderList(
        'list-comments-received',
        commentsReceivedResult.data,
        c => `<div class="activity-item">
            <span class="activity-item-text">
                <a href="scheda.html?id=${c.books?.id}" class="activity-item-book">${sanitize(c.books?.title ?? '—')}</a>
                <span class="activity-item-excerpt">${sanitize(c.content.substring(0, 80))}${c.content.length > 80 ? '…' : ''}</span>
            </span>
            <span class="activity-item-date">${formatDate(c.created_at)}</span>
        </div>`,
        'Nessun commento ricevuto'
    );

    // Like dati
    renderList(
        'list-likes-sent',
        likesGivenResult.data,
        l => `<div class="activity-item">
            <span class="activity-item-text">
                <a href="scheda.html?id=${l.books?.id}" class="activity-item-book">${sanitize(l.books?.title ?? '—')}</a>
            </span>
            <span class="activity-item-date">${formatDate(l.created_at)}</span>
        </div>`,
        'Nessun like dato'
    );

    // Like ricevuti
    renderList(
        'list-likes-received',
        likesReceivedResult.data,
        l => `<div class="activity-item">
            <span class="activity-item-text">
                <a href="scheda.html?id=${l.books?.id}" class="activity-item-book">${sanitize(l.books?.title ?? '—')}</a>
            </span>
            <span class="activity-item-date">${formatDate(l.created_at)}</span>
        </div>`,
        'Nessun like ricevuto'
    );
}

// --- Inizializzazione ---
(async () => {
    currentUser = await requireAuth();
    if (!currentUser) return;
    initNavbar();   // in parallelo con i dati della pagina
    await loadActivity();
})();
