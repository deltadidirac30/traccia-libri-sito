// supabaseClient.js è già caricato prima di questo file

let currentUser = null;
let currentGroupId = null;

function getGroupIdFromUrl() {
    return new URLSearchParams(window.location.search).get('id');
}

// --- Copia il codice invito ---
function copyInviteCode(code) {
    navigator.clipboard.writeText(code)
        .then(() => showToast('Codice copiato', 'success'))
        .catch(() => showToast('Codice: ' + code, 'info'));
}
window.copyInviteCode = copyInviteCode;

// --- Toggle like su un libro ---
async function toggleLike(bookId, btn) {
    btn.disabled = true;
    const wasLiked = btn.classList.contains('liked');
    const countEl  = btn.querySelector('.like-num');

    if (wasLiked) {
        const { error } = await db.from('book_likes').delete().eq('book_id', bookId).eq('user_id', currentUser.id);
        if (!error) {
            btn.classList.remove('liked');
            btn.setAttribute('aria-pressed', 'false');
            btn.innerHTML = likeInner(false, Math.max(0, parseInt(countEl.textContent) - 1));
        } else {
            showToast('Errore durante la rimozione del like', 'error');
        }
    } else {
        const { error } = await db.from('book_likes').insert({ book_id: bookId, user_id: currentUser.id });
        if (!error) {
            btn.classList.add('liked');
            btn.setAttribute('aria-pressed', 'true');
            btn.innerHTML = likeInner(true, parseInt(countEl.textContent) + 1);
        } else {
            showToast('Errore durante il like', 'error');
        }
    }
    btn.disabled = false;
}

// --- Carica commenti per un libro ---
async function loadComments(bookId) {
    const wrap = document.getElementById(`comments-${bookId}`);
    if (!wrap) return;

    wrap.innerHTML = '<p class="loading-text">Caricamento…</p>';

    const { data: comments } = await db
        .from('book_comments')
        .select('id, content, created_at, user_id, profiles(nickname)')
        .eq('book_id', bookId)
        .order('created_at', { ascending: true });

    let listHtml = '';
    if (!comments || comments.length === 0) {
        listHtml = '<p class="comments-empty">Ancora nessun commento</p>';
    } else {
        for (const c of comments) {
            const isOwn = c.user_id === currentUser.id;
            listHtml += `
                <div class="comment-item" data-id="${c.id}">
                    <div class="comment-header">
                        <span class="comment-author">${sanitize(c.profiles?.nickname ?? '?')}</span>
                        <span class="comment-date">${formatDate(c.created_at)}</span>
                        ${isOwn ? `<button class="comment-delete-btn" data-comment-id="${c.id}" data-book-id="${bookId}" aria-label="Elimina commento">${icon('x', 14)}</button>` : ''}
                    </div>
                    <p class="comment-text">${sanitize(c.content)}</p>
                </div>`;
        }
    }

    wrap.innerHTML = `
        <div id="comments-list-${bookId}">${listHtml}</div>
        <form class="comment-form" data-book-id="${bookId}">
            <textarea class="comment-input" placeholder="Scrivi un commento" maxlength="1000" rows="2" required></textarea>
            <button type="submit" class="comment-submit">Invia</button>
        </form>`;
}

// --- Promuovi membro ad admin ---
async function promoteToAdmin(groupId, targetUserId) {
    showConfirm('Vuoi rendere questo membro amministratore del gruppo?', async () => {
        const { error } = await db.rpc('promote_to_admin', {
            p_group_id: groupId,
            p_target: targetUserId
        });
        if (error) {
            showToast('Errore durante la promozione', 'error');
        } else {
            showToast('Membro promosso ad amministratore', 'success');
            await loadRoom();
        }
    }, 'Promuovi', false);
}
window.promoteToAdmin = promoteToAdmin;

// --- Rimuovi membro (solo admin) ---
async function removeMember(groupId, targetUserId) {
    const { error } = await db.rpc('remove_group_member', {
        p_group_id: groupId,
        p_target: targetUserId
    });
    if (error) {
        showToast('Errore durante la rimozione', 'error');
    } else {
        showToast('Membro rimosso', 'success');
        await loadRoom();
    }
}
window.removeMember = removeMember;

// --- Lascia il gruppo ---
async function leaveGroup(groupId) {
    showConfirm('Sei sicuro di voler lasciare questo gruppo?', async () => {
        const { error } = await db
            .from('group_members')
            .delete()
            .eq('group_id', groupId)
            .eq('user_id', currentUser.id);
        if (error) {
            showToast('Errore durante l\'uscita dal gruppo', 'error');
        } else {
            showToast('Hai lasciato il gruppo', 'success');
            window.location.href = 'gruppi.html';
        }
    });
}
window.leaveGroup = leaveGroup;

// --- Elimina gruppo (solo admin) ---
async function deleteGroup(groupId, groupName) {
    showConfirm(`Eliminare definitivamente il gruppo "${groupName}" e tutti i suoi dati?`, async () => {
        const { error } = await db.from('groups').delete().eq('id', groupId);
        if (error) {
            showToast('Errore durante l\'eliminazione del gruppo', 'error');
        } else {
            showToast('Gruppo eliminato', 'success');
            window.location.href = 'gruppi.html';
        }
    });
}
window.deleteGroup = deleteGroup;

// --- Carica la stanza ---
async function loadRoom() {
    const groupId = getGroupIdFromUrl();
    if (!groupId) {
        document.getElementById('group-header').innerHTML = '<p>ID gruppo non valido.</p>';
        return;
    }
    currentGroupId = groupId;

    const [groupResult, booksResult, membersResult] = await Promise.all([
        db.from('groups').select('*').eq('id', groupId).single(),
        db.from('books').select('*').contains('group_ids', [groupId]).eq('visibility', 'group').order('created_at', { ascending: false }),
        db.from('group_members')
            .select('user_id, role, joined_at, profiles(nickname)')
            .eq('group_id', groupId)
            .order('role', { ascending: false })
            .order('joined_at', { ascending: true })
    ]);

    const group   = groupResult.data;
    const books   = booksResult.data ?? [];
    const members = membersResult.data ?? [];

    if (!group) {
        document.getElementById('group-header').innerHTML = '<p>Gruppo non trovato.</p>';
        return;
    }

    const myMembership = members.find(m => m.user_id === currentUser.id);
    const isAdmin      = myMembership?.role === 'admin';

    // --- Render header ---
    document.getElementById('group-header').innerHTML = `
        <div class="room-header">
            <div>
                <h1>${sanitize(group.name)}</h1>
                <p class="room-header-meta">${members.length} ${members.length === 1 ? 'membro' : 'membri'} · ${books.length} ${books.length === 1 ? 'libro condiviso' : 'libri condivisi'}</p>
            </div>
            ${isAdmin ? `
            <div class="room-header-actions">
                <div class="room-invite-box">
                    <span class="room-invite-label">Codice invito</span>
                    <code class="room-invite-code">${sanitize(group.invite_code)}</code>
                    <button class="btn-secondary btn-sm" onclick="copyInviteCode('${sanitize(group.invite_code)}')">${icon('copy', 14)} Copia</button>
                </div>
                <button class="delete-button" onclick="deleteGroup('${group.id}', '${sanitize(group.name)}')">Elimina gruppo</button>
            </div>` : `
            <div class="room-header-actions">
                <button class="btn-secondary" onclick="leaveGroup('${group.id}')">Lascia gruppo</button>
            </div>`}
        </div>`;

    // --- Render libri ---
    const booksContainer = document.getElementById('books-container');

    if (books.length === 0) {
        booksContainer.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">${icon('book', 20)}</span>
                <h3>Ancora nessun libro</h3>
                <p>Aggiungi il primo libro e condividilo con questo gruppo.</p>
                <a href="aggiungi_libro.html" class="btn-primary btn">Aggiungi un libro</a>
            </div>`;
    } else {
        // Batch carica likes e commenti
        const bookIds = books.map(b => b.id);
        const [{ data: allLikes }, { data: myLikes }, { data: allComments }] = await Promise.all([
            db.from('book_likes').select('book_id').in('book_id', bookIds),
            db.from('book_likes').select('book_id').in('book_id', bookIds).eq('user_id', currentUser.id),
            db.from('book_comments').select('book_id').in('book_id', bookIds)
        ]);

        const likeCounts     = {};
        const commentCounts  = {};
        const myLikedSet     = new Set(myLikes?.map(l => l.book_id) ?? []);

        for (const l of allLikes ?? []) {
            likeCounts[l.book_id] = (likeCounts[l.book_id] ?? 0) + 1;
        }
        for (const c of allComments ?? []) {
            commentCounts[c.book_id] = (commentCounts[c.book_id] ?? 0) + 1;
        }

        booksContainer.innerHTML = '<div id="books-list"></div>';
        const grid = document.getElementById('books-list');

        for (const book of books) {
            const isOwner    = book.owner_id === currentUser.id;
            const liked      = myLikedSet.has(book.id);
            const likeCount  = likeCounts[book.id] ?? 0;
            const commentCount = commentCounts[book.id] ?? 0;

            const actionsHtml = (isOwner || isAdmin)
                ? `<div class="book-card-actions"><button class="delete-button"
                           onclick="deleteBook('${book.id}')">Elimina</button></div>`
                : '';

            const card = document.createElement('div');
            card.className = 'book-card';
            card.dataset.bookId = book.id;
            const period = readingPeriod(book.start_date, book.end_date);
            card.innerHTML = `
                <a href="scheda.html?id=${book.id}" class="book-card-main">
                    ${bookCover(book)}
                    <div class="book-card-text">
                        <div class="book-card-title">${sanitize(book.title)}</div>
                        <div class="book-card-author">${sanitize(book.author)}</div>
                        <div class="book-card-meta">
                            <span>${sanitize(book.added_by)}</span>
                            ${period ? `<span class="period">${sanitize(period)}</span>` : ''}
                        </div>
                    </div>
                </a>
                <div class="book-card-footer">
                    <div class="social-bar">
                        <button class="like-btn ${liked ? 'liked' : ''}" data-book-id="${book.id}" aria-pressed="${liked}">
                            ${likeInner(liked, likeCount)}
                        </button>
                        <button class="comment-toggle-btn" data-book-id="${book.id}" aria-expanded="false">
                            ${icon('message')}<span>${commentCount}</span><span class="sr-only">commenti</span>
                        </button>
                    </div>
                    ${actionsHtml}
                </div>
                <div class="comments-section" id="comments-${book.id}" style="display:none;"></div>`;
            grid.appendChild(card);
        }

        // Event delegation — click
        grid.addEventListener('click', async (e) => {
            // Like toggle
            const likeBtn = e.target.closest('.like-btn');
            if (likeBtn) {
                await toggleLike(likeBtn.dataset.bookId, likeBtn);
                return;
            }
            // Commenti toggle
            const commentBtn = e.target.closest('.comment-toggle-btn');
            if (commentBtn) {
                const bookId = commentBtn.dataset.bookId;
                const wrap   = document.getElementById(`comments-${bookId}`);
                if (wrap.style.display === 'none') {
                    wrap.style.display = 'block';
                    commentBtn.setAttribute('aria-expanded', 'true');
                    await loadComments(bookId);
                } else {
                    wrap.style.display = 'none';
                    commentBtn.setAttribute('aria-expanded', 'false');
                }
                return;
            }
            // Elimina commento
            const delCommentBtn = e.target.closest('.comment-delete-btn');
            if (delCommentBtn) {
                const { commentId, bookId } = delCommentBtn.dataset;
                const { error } = await db.from('book_comments').delete().eq('id', commentId);
                if (!error) {
                    delCommentBtn.closest('.comment-item').remove();
                    showToast('Commento eliminato', 'success');
                }
            }
        });

        // Event delegation — submit form commento
        grid.addEventListener('submit', async (e) => {
            const form = e.target.closest('.comment-form');
            if (!form) return;
            e.preventDefault();
            const textarea = form.querySelector('textarea');
            const content  = textarea.value.trim();
            const bookId   = form.dataset.bookId;
            if (!content) return;
            const btn = form.querySelector('.comment-submit');
            btn.disabled = true;
            const { error } = await db.from('book_comments').insert({
                book_id: bookId,
                user_id: currentUser.id,
                content
            });
            if (error) {
                showToast('Errore durante l\'invio', 'error');
            } else {
                textarea.value = '';
                await loadComments(bookId);
            }
            btn.disabled = false;
        });
    }

    // --- Render membri ---
    document.getElementById('members-container').innerHTML = `
        <h2 class="section-title">Membri <span class="section-count">${members.length}</span></h2>
        <ul class="room-member-list">
            ${members.map(m => `
                <li class="room-member-item">
                    <span class="avatar" aria-hidden="true">${sanitize((m.profiles?.nickname ?? '?').charAt(0).toUpperCase())}</span>
                    <span class="room-member-nick">${sanitize(m.profiles?.nickname ?? '?')}${m.user_id === currentUser.id ? ' <span class="room-member-you">(tu)</span>' : ''}</span>
                    <span class="room-member-role ${m.role === 'admin' ? 'role-admin' : 'role-member'}">
                        ${m.role === 'admin' ? 'Admin' : 'Membro'}
                    </span>
                    ${isAdmin && m.user_id !== currentUser.id
                        ? `<div class="room-member-actions">
                               ${m.role === 'member'
                                   ? `<button class="edit-button"
                                              onclick="promoteToAdmin('${groupId}', '${m.user_id}')">Promuovi ad admin</button>`
                                   : ''}
                               <button class="delete-button"
                                       onclick="removeMember('${groupId}', '${m.user_id}')">Rimuovi</button>
                           </div>`
                        : ''}
                </li>`).join('')}
        </ul>`;
}

// --- Elimina libro ---
async function deleteBook(bookId) {
    showConfirm('Eliminare questo libro?', async () => {
        const { error } = await db.from('books').delete().eq('id', bookId);
        if (error) {
            showToast('Errore durante l\'eliminazione', 'error');
        } else {
            showToast('Libro eliminato', 'success');
            await loadRoom();
        }
    });
}
window.deleteBook = deleteBook;

// --- Inizializzazione ---
(async () => {
    currentUser = await requireAuth();
    if (!currentUser) return;
    await initNavbar();
    await loadRoom();
})();
