// supabaseClient.js è già caricato prima di questo file

let currentUser = null;

function renderList(containerId, items, renderFn, emptyMsg) {
    const el = document.getElementById(containerId);
    if (!items || items.length === 0) {
        el.innerHTML = `<p style="color:var(--t3);font-size:14px;">${emptyMsg}</p>`;
        return;
    }
    el.innerHTML = items.map(renderFn).join('');
}

async function loadActivity() {
    const uid = currentUser.id;

    // Tutte le query in parallelo
    const [
        booksCountResult,
        groupsCountResult,
        commentsCountResult,
        likesCountResult,
        commentsSentResult,
        likesGivenResult,
        likesReceivedResult,
        commentsReceivedResult
    ] = await Promise.all([
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
        db.from('book_likes')
            .select('book_id, created_at, books!inner(id, title)')
            .eq('books.owner_id', uid)
            .order('created_at', { ascending: false })
            .limit(5),
        db.from('book_comments')
            .select('id, content, created_at, books!inner(id, title)')
            .eq('books.owner_id', uid)
            .neq('user_id', uid)
            .order('created_at', { ascending: false })
            .limit(5)
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
                — ${sanitize(c.content.substring(0, 50))}${c.content.length > 50 ? '…' : ''}
            </span>
            <span class="activity-item-date">${new Date(c.created_at).toLocaleDateString('it-IT')}</span>
        </div>`,
        'Nessun commento ancora.'
    );

    // Commenti ricevuti
    renderList(
        'list-comments-received',
        commentsReceivedResult.data,
        c => `<div class="activity-item">
            <span class="activity-item-text">
                <a href="scheda.html?id=${c.books?.id}" class="activity-item-book">${sanitize(c.books?.title ?? '—')}</a>
                — ${sanitize(c.content.substring(0, 50))}${c.content.length > 50 ? '…' : ''}
            </span>
            <span class="activity-item-date">${new Date(c.created_at).toLocaleDateString('it-IT')}</span>
        </div>`,
        'Nessun commento ricevuto.'
    );

    // Like dati
    renderList(
        'list-likes-sent',
        likesGivenResult.data,
        l => `<div class="activity-item">
            <span class="activity-item-text">
                <a href="scheda.html?id=${l.books?.id}" class="activity-item-book">${sanitize(l.books?.title ?? '—')}</a>
            </span>
            <span class="activity-item-date">${new Date(l.created_at).toLocaleDateString('it-IT')}</span>
        </div>`,
        'Nessun like dato ancora.'
    );

    // Like ricevuti
    renderList(
        'list-likes-received',
        likesReceivedResult.data,
        l => `<div class="activity-item">
            <span class="activity-item-text">
                <a href="scheda.html?id=${l.books?.id}" class="activity-item-book">${sanitize(l.books?.title ?? '—')}</a>
            </span>
            <span class="activity-item-date">${new Date(l.created_at).toLocaleDateString('it-IT')}</span>
        </div>`,
        'Nessun like ricevuto.'
    );
}

// --- Inizializzazione ---
(async () => {
    currentUser = await requireAuth();
    if (!currentUser) return;
    await initNavbar();
    await loadActivity();
})();
