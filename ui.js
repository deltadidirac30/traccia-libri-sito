// =====================================================================
// ui.js — interazioni e micro-animazioni (caricato in defer)
// Tutto è un miglioramento: senza JavaScript, senza Motion o con
// "riduci movimento" attivo il sito funziona identico.
// =====================================================================
(function () {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Pagina già vista in questa sessione: i contenuti compaiono subito
    const seenPage = document.documentElement.classList.contains('tl-seen');
    const fine   = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const springOut = 'cubic-bezier(.34, 1.56, .64, 1)';

    // -----------------------------------------------------------------
    // 1. Tieni premuto per eliminare
    // -----------------------------------------------------------------
    const HOLD_MS = 900;
    const HOLD_SEL = '.delete-button';

    function holdTarget(e) {
        const btn = e.target.closest?.(HOLD_SEL);
        return btn && !btn.disabled ? btn : null;
    }

    // Un clic veloce col mouse o col dito non elimina: mostra come fare.
    // Da tastiera (detail === 0) resta il dialogo di conferma.
    document.addEventListener('click', (e) => {
        const btn = holdTarget(e);
        if (!btn) return;
        // detail 0: tastiera (→ dialogo) o il click generato dalla pressione completata
        if (e.detail === 0) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        // il rilascio del dito subito dopo una pressione completata: ignorato in silenzio
        if (Date.now() < Number(btn.dataset.holdUntil || 0)) return;
        showToast?.('Tieni premuto per eliminare');
        if (!reduce) btn.animate(
            [{ transform: 'translateX(0)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'translateX(0)' }],
            { duration: 240, easing: 'ease-in-out' });
    }, true);

    document.addEventListener('contextmenu', (e) => { if (holdTarget(e)) e.preventDefault(); });

    document.addEventListener('pointerdown', (e) => {
        const btn = holdTarget(e);
        if (!btn || e.button !== 0) return;
        const start = performance.now();
        let raf = 0, done = false;
        btn.classList.add('is-holding');
        btn.style.setProperty('--hold', 0);

        const tick = (now) => {
            const p = Math.min(1, (now - start) / HOLD_MS);
            btn.style.setProperty('--hold', p.toFixed(3));
            if (p < 1) { raf = requestAnimationFrame(tick); return; }
            done = true;
            cleanup();
            navigator.vibrate?.(18);
            window.__tlHoldConfirmed = true;
            btn.dataset.holdUntil = String(Date.now() + 1000);
            btn.click();
            // se il click non ha usato la conferma, non deve restare attiva
            setTimeout(() => { window.__tlHoldConfirmed = false; }, 0);
        };
        const cancel = () => { if (!done) cleanup(); };
        function cleanup() {
            cancelAnimationFrame(raf);
            btn.classList.remove('is-holding');
            btn.style.setProperty('--hold', 0);
            window.removeEventListener('pointerup', cancel);
            window.removeEventListener('pointercancel', cancel);
            btn.removeEventListener('pointerleave', cancel);
        }
        window.addEventListener('pointerup', cancel);
        window.addEventListener('pointercancel', cancel);
        btn.addEventListener('pointerleave', cancel);
        raf = requestAnimationFrame(tick);
    });

    if (reduce) return;

    // -----------------------------------------------------------------
    // 2. Like: piccola esplosione di cuori e scintille
    // -----------------------------------------------------------------
    const BURST = ['#a54e2b', '#e88a5f', '#9a6f26', '#2f5446', '#5a3650'];
    function burst(btn) {
        const r = btn.querySelector('.icon')?.getBoundingClientRect() ?? btn.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const n = 10;
        for (let i = 0; i < n; i++) {
            const dot = document.createElement('span');
            const heart = i % 3 === 0;
            dot.className = heart ? 'burst-heart' : 'burst-dot';
            dot.style.left = cx + 'px';
            dot.style.top  = cy + 'px';
            dot.style.color = BURST[i % BURST.length];
            if (heart) dot.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';
            document.body.appendChild(dot);
            const a = (Math.PI * 2 * i) / n + Math.random() * .5;
            const d = 18 + Math.random() * 22;
            dot.animate([
                { transform: 'translate(-50%, -50%) scale(.4)', opacity: 1 },
                { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d - 6}px)) scale(1)`, opacity: 1, offset: .6 },
                { transform: `translate(calc(-50% + ${Math.cos(a) * d * 1.25}px), calc(-50% + ${Math.sin(a) * d * 1.25 + 4}px)) scale(.6)`, opacity: 0 },
            ], { duration: 620 + Math.random() * 200, easing: 'cubic-bezier(.22, 1, .36, 1)' }).onfinish = () => dot.remove();
        }
        btn.querySelector('.icon')?.animate(
            [{ transform: 'scale(.5)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
            { duration: 420, easing: springOut });
    }
    new MutationObserver((muts) => {
        for (const m of muts) {
            const btn = m.target.closest?.('.like-btn');
            if (btn && btn.classList.contains('liked') && m.type === 'childList' && !btn.dataset.burstAt) {
                btn.dataset.burstAt = '1';
                burst(btn);
                setTimeout(() => { delete btn.dataset.burstAt; }, 400);
            }
        }
    }).observe(document.body, { childList: true, subtree: true });

    // -----------------------------------------------------------------
    // 3. Pulsanti magnetici (solo mouse) e pressione a molla
    // -----------------------------------------------------------------
    const MAGNETIC = '.btn-hero-primary, .btn-hero-secondary, .btn-nav-cta, .nav-cta, .home-header .btn-primary, #save-btn';
    if (fine) {
        document.addEventListener('pointermove', (e) => {
            const el = e.target.closest?.(MAGNETIC);
            document.querySelectorAll('.is-magnet').forEach(m => {
                if (m !== el) { m.classList.remove('is-magnet'); m.style.translate = ''; }
            });
            if (!el) return;
            const r = el.getBoundingClientRect();
            const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
            const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
            el.classList.add('is-magnet');
            el.style.translate = `${(dx * 5).toFixed(1)}px ${(dy * 4).toFixed(1)}px`;
        });
    }

    document.addEventListener('pointerdown', (e) => {
        const el = e.target.closest('button, .btn, .btn-hero-primary, .btn-hero-secondary, .btn-nav-cta, .nav-cta, .spine');
        if (!el || el.disabled || el.matches(HOLD_SEL)) return;
        el.animate([{ scale: '1' }, { scale: '.96' }], { duration: 110, easing: 'ease-out', fill: 'forwards' });
        const release = () => {
            el.animate([{ scale: '.96' }, { scale: '1' }], { duration: 380, easing: springOut, fill: 'forwards' });
            window.removeEventListener('pointerup', release);
            window.removeEventListener('pointercancel', release);
        };
        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);
    });

    // -----------------------------------------------------------------
    // 4. Copertina della scheda: inclinazione 3D e riflesso di luce
    // -----------------------------------------------------------------
    if (fine) {
        document.addEventListener('pointermove', (e) => {
            const cover = e.target.closest?.('.book-aside .cover-lg');
            document.querySelectorAll('.cover-lg.is-tilting').forEach(c => {
                if (c !== cover) {
                    c.classList.remove('is-tilting');
                    c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); c.style.setProperty('--glare', 0);
                }
            });
            if (!cover) return;
            if (!cover.querySelector('.cover-glare')) cover.insertAdjacentHTML('beforeend', '<span class="cover-glare"></span>');
            const r = cover.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
            cover.classList.add('is-tilting');
            cover.style.setProperty('--ry', ((px - .5) * 18).toFixed(2) + 'deg');
            cover.style.setProperty('--rx', ((.5 - py) * 14).toFixed(2) + 'deg');
            cover.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
            cover.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
            cover.style.setProperty('--glare', 1);
        });
    }

    // -----------------------------------------------------------------
    // 5. Pillola che segue il mouse tra le voci della barra (stile motion.dev)
    // -----------------------------------------------------------------
    if (fine) {
        const nav = document.querySelector('.nav-links');
        if (nav) {
            const pill = document.createElement('span');
            pill.className = 'nav-hover';
            pill.setAttribute('aria-hidden', 'true');
            nav.prepend(pill);
            let shown = false;
            nav.addEventListener('pointerover', (e) => {
                const a = e.target.closest('a');
                if (!a || a.classList.contains('nav-cta') || !nav.contains(a)) return;
                const nr = nav.getBoundingClientRect(), r = a.getBoundingClientRect();
                if (!shown) pill.style.transition = 'opacity .2s';   // la prima volta compare sul posto
                pill.style.transform = `translateX(${r.left - nr.left}px)`;
                pill.style.top = (r.top - nr.top) + 'px';
                pill.style.width = r.width + 'px';
                pill.style.height = r.height + 'px';
                pill.style.opacity = a.classList.contains('active') ? '0' : '1';
                if (!shown) { pill.offsetWidth; pill.style.transition = ''; shown = true; }
            });
            nav.addEventListener('pointerleave', () => { pill.style.opacity = '0'; shown = false; });
        }
    }

    // -----------------------------------------------------------------
    // 6. Luce che segue il cursore sulle card (stile kokonutui / bklit)
    // -----------------------------------------------------------------
    const SPOT = '.book-card, .group-room-card, .home-nav-card, .chart-card, .howto-steps li, .card, .home-book-list, .activity-list, .preview-window';
    if (fine) {
        document.addEventListener('pointermove', (e) => {
            const el = e.target.closest?.(SPOT);
            if (!el) return;
            const r = el.getBoundingClientRect();
            el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
            el.style.setProperty('--my', (e.clientY - r.top) + 'px');
        }, { passive: true });
    }

    // -----------------------------------------------------------------
    // 6b. Telefono: barra in basso con la pillola che scivola
    // -----------------------------------------------------------------
    const tabbar = document.querySelector('.tabbar');
    if (tabbar) {
        const tabs = [...tabbar.querySelectorAll('.tab')];
        const startI = tabbar.style.getPropertyValue('--i');
        const current = tabs.findIndex(t => t.classList.contains('active'));
        tabbar.addEventListener('click', (e) => {
            const tab = e.target.closest('.tab');
            if (!tab || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const i = tabs.indexOf(tab);
            try { sessionStorage.setItem('tl:dir', current >= 0 && i < current ? 'back' : 'fwd'); } catch (_) { /* niente */ }
            // la pillola parte subito verso la voce toccata, senza aspettare la pagina nuova
            if (!tab.classList.contains('tab-add')) { tabbar.style.setProperty('--i', i); void tabbar.offsetWidth; }
            tabs.forEach(t => t.classList.toggle('active', t === tab));
            navigator.vibrate?.(6);
        });
        // tornando indietro (pagina tenuta in memoria dal browser) la barra torna com'era
        window.addEventListener('pageshow', (e) => {
            if (!e.persisted) return;
            tabbar.style.setProperty('--i', startI);
            tabs.forEach((t, k) => t.classList.toggle('active', k === current));
        });
    }

    // -----------------------------------------------------------------
    // 6c. Al tocco (telefono e tablet) al posto degli effetti del mouse
    // -----------------------------------------------------------------
    if (!fine && !reduce) {
        // Schede: luce sotto il dito e leggera pressione
        const PRESS = '.book-card, .group-room-card, .home-nav-card, .home-book-row, .activity-item, .chart-card';
        let pressed = null, armed = 0;
        const release = (keep) => {
            clearTimeout(armed);
            const el = pressed; pressed = null;
            if (!el) return;
            if (keep && !el.classList.contains('is-pressed')) el.classList.add('is-pressed');   // tocco rapido: si vede lo stesso
            setTimeout(() => el.classList.remove('is-pressed'), keep ? 170 : 0);
        };
        document.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') return;
            const el = e.target.closest?.(PRESS);
            if (!el || e.target.closest('button, input, textarea, select, label, .like-btn, .comment-form')) return;
            const r = el.getBoundingClientRect();
            el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
            el.style.setProperty('--my', (e.clientY - r.top) + 'px');
            pressed = el;
            // un attimo di attesa: se il dito sta scorrendo la pagina non si accende nulla
            armed = setTimeout(() => { if (pressed === el) el.classList.add('is-pressed'); }, 70);
        }, { passive: true });
        document.addEventListener('pointerup', () => release(true), { passive: true });
        document.addEventListener('pointercancel', () => release(false), { passive: true });
        window.addEventListener('scroll', () => release(false), { passive: true, capture: true });

        // Scaffale: il libro toccato si alza, i vicini lo seguono un poco
        document.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') return;
            const sp = e.target.closest?.('.spine');
            if (!sp) return;
            const near = [sp.previousElementSibling, sp.nextElementSibling].filter(n => n?.classList.contains('spine'));
            sp.classList.add('is-pressed');
            near.forEach(n => n.classList.add('is-near'));
            const done = () => {
                setTimeout(() => { sp.classList.remove('is-pressed'); near.forEach(n => n.classList.remove('is-near')); }, 220);
                window.removeEventListener('pointerup', done); window.removeEventListener('pointercancel', done);
            };
            window.addEventListener('pointerup', done); window.addEventListener('pointercancel', done);
        }, { passive: true });

        // Copertina della scheda: si inclina seguendo il dito
        const tilt = (cover, x, y, k = 1) => {
            if (!cover.querySelector('.cover-glare')) cover.insertAdjacentHTML('beforeend', '<span class="cover-glare"></span>');
            const r = cover.getBoundingClientRect();
            const px = Math.min(1, Math.max(0, (x - r.left) / r.width)), py = Math.min(1, Math.max(0, (y - r.top) / r.height));
            cover.style.setProperty('--ry', ((px - .5) * 22 * k).toFixed(2) + 'deg');
            cover.style.setProperty('--rx', ((.5 - py) * 16 * k).toFixed(2) + 'deg');
            cover.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
            cover.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
            cover.style.setProperty('--glare', k);
        };
        const untilt = (cover) => {
            cover.classList.remove('is-tilting', 'is-touching');
            cover.style.setProperty('--rx', '0deg'); cover.style.setProperty('--ry', '0deg'); cover.style.setProperty('--glare', 0);
        };
        document.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') return;
            const cover = e.target.closest?.('.book-aside .cover-lg');
            if (!cover) return;
            cover.classList.add('is-touching');
            tilt(cover, e.clientX, e.clientY);
            const move = (ev) => { cover.classList.add('is-tilting'); tilt(cover, ev.clientX, ev.clientY); };
            const end = () => {
                untilt(cover);
                cover.removeEventListener('pointermove', move);
                cover.removeEventListener('pointerup', end); cover.removeEventListener('pointercancel', end);
            };
            cover.addEventListener('pointermove', move);
            cover.addEventListener('pointerup', end); cover.addEventListener('pointercancel', end);
        });

        // Android: la copertina segue anche l'inclinazione del telefono (su iPhone servirebbe un permesso: niente)
        if (document.getElementById('book-details') && 'DeviceOrientationEvent' in window
            && typeof DeviceOrientationEvent.requestPermission !== 'function') {
            let base = null, raf = 0, last = null;
            window.addEventListener('deviceorientation', (ev) => {
                if (ev.beta == null || ev.gamma == null) return;
                last = ev;
                if (raf) return;
                raf = requestAnimationFrame(() => {
                    raf = 0;
                    const cover = document.querySelector('.book-aside .cover-lg');
                    if (!cover || cover.classList.contains('is-touching')) return;
                    if (!base) base = { b: last.beta, g: last.gamma };
                    // il "dritto" si adatta piano a come si tiene il telefono
                    base.b += (last.beta - base.b) * .03; base.g += (last.gamma - base.g) * .03;
                    const ry = Math.max(-10, Math.min(10, (last.gamma - base.g) * .7));
                    const rx = Math.max(-8, Math.min(8, -(last.beta - base.b) * .5));
                    if (!cover.querySelector('.cover-glare')) cover.insertAdjacentHTML('beforeend', '<span class="cover-glare"></span>');
                    cover.style.setProperty('--ry', ry.toFixed(2) + 'deg');
                    cover.style.setProperty('--rx', rx.toFixed(2) + 'deg');
                    cover.style.setProperty('--gx', (50 + ry * 4).toFixed(1) + '%');
                    cover.style.setProperty('--gy', (35 - rx * 4).toFixed(1) + '%');
                    cover.style.setProperty('--glare', Math.min(1, (Math.abs(rx) + Math.abs(ry)) / 8).toFixed(2));
                });
            });
        }
    }

    // -----------------------------------------------------------------
    // 6d. Mentre si scorre, le schede più in basso entrano dal basso
    //     (si usa "translate": non tocca le altre trasformazioni)
    // -----------------------------------------------------------------
    const REVEAL = '.book-card, .group-room-card, .home-book-row, .activity-item, .room-member-item, .stat-card, .chart-card, .stat-tile';
    let revealBatch = 0, revealFrame = 0;
    const revealIO = (!reduce && 'IntersectionObserver' in window) ? new IntersectionObserver((entries) => {
        for (const en of entries) {
            if (!en.isIntersecting) continue;
            revealIO.unobserve(en.target);
            en.target.animate(
                [{ opacity: 0, translate: '0 26px', scale: '.98' }, { opacity: 1, translate: '0 0', scale: '1' }],
                { duration: 560, delay: Math.min(revealBatch++, 4) * 70, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'backwards' });
            if (!revealFrame) revealFrame = requestAnimationFrame(() => { revealFrame = 0; revealBatch = 0; });
        }
    }, { rootMargin: '0px 0px 80px 0px' }) : null;
    const belowFold = (el) => el.getBoundingClientRect().top > window.innerHeight + 10;
    function watchReveal(el) {
        if (revealIO && el.matches(REVEAL) && belowFold(el)) { revealIO.observe(el); return true; }
        return false;
    }
    document.querySelectorAll(REVEAL).forEach(watchReveal);

    // -----------------------------------------------------------------
    // 7. Motion: ingresso a cascata, numeri che contano, rivelazioni allo scroll
    // -----------------------------------------------------------------
    const M = window.Motion;
    if (!M) return;
    const { animate, stagger, inView } = M;
    const ease = [0.22, 1, 0.36, 1];

    // I dorsi "cadono" sullo scaffale. Si usa la proprietà translate (separata da
    // transform), così l'inclinazione e il sollevamento al passaggio restano intatti.
    function dropSpines(els, startDelay, height) {
        els.forEach((el, i) => el.animate(
            [{ translate: `0 -${height}px`, opacity: 0 }, { translate: '0 0', opacity: 1 }],
            { duration: 520, delay: startDelay + i * 28, easing: 'cubic-bezier(.34, 1.45, .64, 1)', fill: 'both' }));
    }

    const ITEMS = '.book-card, .group-room-card, .home-book-row, .activity-item, .room-member-item, .stat-card, .spine, .chart-card';
    const seen = new WeakSet();
    let queue = [];
    let scheduled = false;
    function flush() {
        scheduled = false;
        // quelli ancora sotto lo schermo entreranno quando ci si arriva scorrendo
        const fresh = queue.filter(el => el.isConnected && !watchReveal(el));
        queue = [];
        if (seenPage) return;
        // i contenuti che sostituiscono una copia già sullo schermo non rientrano
        const els = fresh.filter(el => !el.closest('[data-restored]'));
        if (!els.length) return;
        const spines = els.filter(el => el.matches('.spine'));
        const others = els.filter(el => !el.matches('.spine'));
        // I dorsi cadono sullo scaffale uno dopo l'altro, con un piccolo rimbalzo
        if (spines.length) dropSpines(spines.slice(0, 40), 0, 32);
        if (others.length) animate(others.slice(0, 12), { opacity: [0, 1], y: [10, 0], scale: [.985, 1] },
            { duration: 0.32, ease, delay: stagger(0.03) });
    }
    function collect(node) {
        if (node.nodeType !== 1) return;
        const found = node.matches(ITEMS) ? [node] : Array.from(node.querySelectorAll(ITEMS));
        for (const el of found) { if (!seen.has(el)) { seen.add(el); queue.push(el); } }
    }
    document.querySelectorAll(ITEMS).forEach(el => seen.add(el));
    new MutationObserver(muts => {
        for (const m of muts) m.addedNodes.forEach(collect);
        if (queue.length && !scheduled) { scheduled = true; queueMicrotask(flush); }
    }).observe(document.body, { childList: true, subtree: true });

    // Numeri che contano fino al valore (Attività, statistiche)
    function countUp(el) {
        if (seenPage) return;
        const target = parseInt(el.textContent.replace(/\D/g, ''), 10);
        if (!Number.isFinite(target) || target <= 0 || el.dataset.counted) return;
        el.dataset.counted = '1';
        const suffix = el.textContent.replace(/[\d.\s]/g, '');
        animate(0, target, {
            duration: Math.min(1.2, 0.4 + target / 400), ease,
            onUpdate: v => { el.textContent = Math.round(v).toLocaleString('it-IT') + suffix; },
        });
    }
    new MutationObserver(muts => {
        for (const m of muts) {
            const t = m.target.nodeType === 1 ? m.target : m.target.parentElement;
            const el = t?.closest?.('.stat-value, [data-count]');
            if (el) countUp(el);
            m.addedNodes.forEach(n => n.nodeType === 1 && n.querySelectorAll?.('[data-count]').forEach(countUp));
        }
    }).observe(document.body, { childList: true, characterData: true, subtree: true });

    // Titolo che entra parola per parola
    if (!seenPage) document.querySelectorAll('[data-words]').forEach(h => {
        const words = h.textContent.trim().split(/\s+/);
        h.style.animation = 'none';
        h.style.opacity = '1';
        h.innerHTML = words.map(w => `<span class="w">${w.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))} </span>`).join('');
        h.setAttribute('aria-label', words.join(' '));
        animate(h.querySelectorAll('.w'), { opacity: [0, 1], y: [18, 0], filter: ['blur(6px)', 'blur(0px)'] },
            { duration: 0.6, ease, delay: stagger(0.06) });
    });

    // Lo scaffale dell'hero si riempie: i libri cadono uno dopo l'altro
    const heroSpines = [...document.querySelectorAll('.hero-shelf .spine')];
    if (heroSpines.length && !seenPage) {
        heroSpines.forEach(sp => { sp.style.animation = 'none'; });
        dropSpines(heroSpines, 250, 60);
        animate('.hero-preview .preview-window', { opacity: [0, 1], y: [30, 0] }, { duration: 0.8, ease, delay: 0.5 });
    }

    // Lo scaffale dell'hero sale più lento della pagina mentre si scorre
    const hero = document.querySelector('.hero');
    if (hero && M.scroll) {
        M.scroll(animate('.hero-shelf', { y: [0, -50] }, { ease: 'linear' }), { target: hero, offset: ['start start', 'end start'] });
    }

    // Elementi della landing che compaiono quando entrano nello schermo
    if (seenPage) return;
    document.querySelectorAll('[data-reveal]').forEach(el => { el.style.opacity = '0'; });
    inView('[data-reveal]', (el) => {
        animate(el, { opacity: [0, 1], y: [24, 0] }, { duration: 0.7, ease, delay: (parseFloat(el.dataset.reveal) || 0) });
    }, { amount: 0.25 });
})();
