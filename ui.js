// =====================================================================
// ui.js — micro-animazioni con Motion (motion.dev), caricato in defer.
// Solo miglioramenti: se Motion non si carica o l'utente preferisce meno
// movimento, il sito funziona identico, senza animazioni.
// =====================================================================
(function () {
    const M = window.Motion;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!M || reduce) return;

    const { animate, stagger } = M;
    const ease = [0.22, 1, 0.36, 1];

    // --- 1. Un solo ingresso: le liste compaiono con una piccola cascata ---
    const ITEMS = '.book-card, .group-room-card, .home-book-row, .activity-item, .room-member-item, .stat-card';
    const seen = new WeakSet();
    let queue = [];
    let scheduled = false;

    function flush() {
        scheduled = false;
        const els = queue.filter(el => el.isConnected);
        queue = [];
        if (!els.length) return;
        // massimo 8 elementi animati, gli altri compaiono subito
        animate(els.slice(0, 8), { opacity: [0, 1], y: [10, 0] },
            { duration: 0.42, ease, delay: stagger(0.045) });
    }

    function collect(node) {
        if (node.nodeType !== 1) return;
        const found = node.matches(ITEMS) ? [node] : Array.from(node.querySelectorAll(ITEMS));
        for (const el of found) {
            if (seen.has(el)) continue;
            seen.add(el);
            queue.push(el);
        }
    }

    // Gli elementi già presenti (pagine statiche) li segniamo come visti
    document.querySelectorAll(ITEMS).forEach(el => seen.add(el));

    new MutationObserver(mutations => {
        for (const m of mutations) m.addedNodes.forEach(collect);
        if (queue.length && !scheduled) { scheduled = true; queueMicrotask(flush); }
    }).observe(document.body, { childList: true, subtree: true });

    // --- 2. I numeri dell'attività contano fino al valore ---
    document.querySelectorAll('.stat-value').forEach(el => {
        new MutationObserver((_, obs) => {
            const target = parseInt(el.textContent, 10);
            if (!Number.isFinite(target) || target <= 0) return;
            obs.disconnect();
            animate(0, target, {
                duration: Math.min(0.9, 0.35 + target * 0.02),
                ease,
                onUpdate: v => { el.textContent = Math.round(v); },
            });
        }).observe(el, { childList: true, characterData: true, subtree: true });
    });

    // --- 3. Pressione: i pulsanti si abbassano appena, il cuore si riempie ---
    document.addEventListener('pointerdown', e => {
        const el = e.target.closest('button, .btn, .btn-hero-primary, .btn-hero-secondary, .btn-nav-cta, .nav-cta');
        if (!el || el.disabled) return;
        animate(el, { scale: 0.97 }, { duration: 0.12, ease });
        const release = () => {
            animate(el, { scale: 1 }, { duration: 0.2, ease });
            window.removeEventListener('pointerup', release);
            window.removeEventListener('pointercancel', release);
        };
        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);
    });

    // Quando un like viene messo, il cuore cresce un attimo (niente rimbalzi)
    new MutationObserver(mutations => {
        for (const m of mutations) {
            const btn = m.target.closest?.('.like-btn');
            if (btn && btn.classList.contains('liked')) {
                const heart = btn.querySelector('.icon');
                if (heart && !heart.dataset.popped) {
                    heart.dataset.popped = '1';
                    animate(heart, { scale: [0.6, 1] }, { duration: 0.32, ease });
                }
            }
        }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
})();
