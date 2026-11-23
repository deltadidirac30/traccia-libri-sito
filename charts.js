// =====================================================================
// charts.js — "Le tue letture" nella pagina Attività
// Calendario delle letture (stile GitHub), pagine lette al mese, numeri chiave.
// SVG disegnati a mano: nessuna libreria esterna.
// Colori: una sola tinta (terracotta), più intensa = più libri/pagine.
// =====================================================================

const MESI_LUNGHI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
    'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];

function dayOf(value) {
    const p = parseDay(value);
    return p ? new Date(p.y, p.m, p.d) : null;
}
const DAY_MS = 86400000;
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function computeReadingStats(books) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const year = today.getFullYear();

    // Finestra del calendario: 53 settimane, da lunedì a oggi
    const start = new Date(today);
    start.setDate(start.getDate() - 52 * 7 - ((today.getDay() + 6) % 7));

    const perDay = new Map();   // dayKey → [titoli]
    let finishedYear = 0, pagesYear = 0, readingNow = 0;
    const durations = [];

    for (const b of books) {
        const s = dayOf(b.start_date);
        const e = dayOf(b.end_date);
        if (s && !e && s <= today) readingNow++;
        if (e && e.getFullYear() === year && e <= today) { finishedYear++; pagesYear += Number(b.pages) || 0; }
        if (s && e && e >= s) durations.push(Math.round((e - s) / DAY_MS) + 1);
        if (!s) continue;
        const from = new Date(Math.max(s, start));
        const to   = new Date(Math.min(e ?? today, today));
        for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
            const k = dayKey(d);
            if (!perDay.has(k)) perDay.set(k, []);
            perDay.get(k).push(b.title);
        }
    }

    // Ultimi 12 mesi: pagine dei libri finiti in quel mese
    const months = [];
    for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        months.push({ y: d.getFullYear(), m: d.getMonth(), pages: 0, titles: [], days: 0 });
    }
    for (const b of books) {
        const e = dayOf(b.end_date);
        if (!e) continue;
        const mo = months.find(x => x.y === e.getFullYear() && x.m === e.getMonth());
        if (mo) { mo.pages += Number(b.pages) || 0; mo.titles.push(b.title); }
    }
    for (const [k] of perDay) {
        const [y, m] = k.split('-').map(Number);
        const mo = months.find(x => x.y === y && x.m === m);
        if (mo) mo.days++;
    }

    return {
        today, start, perDay, months,
        finishedYear, pagesYear, readingNow,
        avgDays: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null,
        readingDays: perDay.size,
    };
}

// --- Tooltip condiviso ----------------------------------------------------------
function chartTip() {
    let tip = document.getElementById('chart-tip');
    if (!tip) {
        tip = document.createElement('div');
        tip.id = 'chart-tip';
        tip.className = 'chart-tip';
        tip.setAttribute('role', 'status');
        document.body.appendChild(tip);
    }
    return tip;
}
function showTip(html, x, y) {
    const tip = chartTip();
    tip.innerHTML = html;
    tip.classList.add('show');
    const r = tip.getBoundingClientRect();
    const left = Math.min(window.innerWidth - r.width - 8, Math.max(8, x - r.width / 2));
    const top  = y - r.height - 12 < 8 ? y + 18 : y - r.height - 12;
    tip.style.transform = `translate(${left}px, ${top}px)`;
}
function hideTip() { document.getElementById('chart-tip')?.classList.remove('show'); }

// --- Calendario delle letture ---------------------------------------------------
function heatmapSvg(st, width) {
    const weeks = 53, GAP = 3, TOP = 18, LEFT = 30;
    // celle tra 10 e 16 px: riempiono il riquadro; sotto i 10 si scorre
    const CELL = Math.max(10, Math.min(16, Math.floor((width - LEFT) / weeks) - GAP));
    const STEP = CELL + GAP;
    const W = LEFT + weeks * STEP, H = TOP + 7 * STEP;
    let cells = '', monthsLbl = '';
    let lastMonth = -1;
    for (let w = 0; w < weeks; w++) {
        for (let d = 0; d < 7; d++) {
            const day = new Date(st.start.getTime() + (w * 7 + d) * DAY_MS);
            if (day > st.today) continue;
            if (d === 0 && day.getMonth() !== lastMonth && day.getDate() <= 7) {
                lastMonth = day.getMonth();
                if (w < weeks - 1) monthsLbl += `<text x="${LEFT + w * STEP}" y="11" class="chart-axis">${MESI[lastMonth]}</text>`;
            }
            const titles = st.perDay.get(dayKey(day)) ?? [];
            const lvl = Math.min(4, titles.length);
            cells += `<rect class="heat heat-${lvl}" x="${LEFT + w * STEP}" y="${TOP + d * STEP}" width="${CELL}" height="${CELL}" rx="3" data-day="${day.getTime()}"></rect>`;
        }
    }
    const dayLbl = [['lun', 0], ['mer', 2], ['ven', 4]]
        .map(([t, d]) => `<text x="0" y="${TOP + d * STEP + CELL - 2}" class="chart-axis">${t}</text>`).join('');
    return `<svg class="heatmap" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Calendario delle letture degli ultimi 12 mesi: ${st.readingDays} giorni con almeno un libro in lettura">${monthsLbl}${dayLbl}${cells}</svg>`;
}

// --- Pagine lette al mese (colonne) ---------------------------------------------
function niceMax(v) {
    if (v <= 0) return 100;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v) return k * p;
    return 10 * p;
}
function barsSvg(st, width) {
    const W = Math.max(300, Math.round(width)), H = 220, L = 40, R = 8, T = 22, B = 26;
    const max = niceMax(Math.max(...st.months.map(m => m.pages)));
    const band = (W - L - R) / st.months.length;
    const bw = Math.min(24, band * 0.56);
    const y = (v) => T + (H - T - B) * (1 - v / max);
    const ticks = [0, max / 2, max];
    let grid = ticks.map(t => `
        <line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" class="chart-grid${t === 0 ? ' chart-base' : ''}"></line>
        <text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" class="chart-axis">${Math.round(t).toLocaleString('it-IT')}</text>`).join('');
    const peak = st.months.reduce((a, m, i) => (m.pages > st.months[a].pages ? i : a), 0);
    let bars = '', labels = '', hits = '';
    st.months.forEach((m, i) => {
        const cx = L + band * i + band / 2;
        const x0 = cx - bw / 2, top = y(m.pages), base = y(0);
        if (m.pages > 0) {
            const r = Math.min(4, (base - top) / 2);
            bars += `<path class="bar" d="M${x0},${base} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + bw - r} Q${x0 + bw},${top} ${x0 + bw},${top + r} V${base} Z"></path>`;
        }
        if (i === peak && m.pages > 0) labels += `<text x="${cx}" y="${top - 6}" text-anchor="middle" class="chart-value">${m.pages.toLocaleString('it-IT')}</text>`;
        labels += `<text x="${cx}" y="${H - 8}" text-anchor="middle" class="chart-axis">${MESI[m.m]}</text>`;
        hits += `<rect class="bar-hit" x="${L + band * i}" y="${T}" width="${band}" height="${H - T - B}" data-i="${i}"></rect>`;
    });
    return `<svg class="bars" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Pagine lette al mese negli ultimi 12 mesi">${grid}${bars}${labels}${hits}</svg>`;
}

// --- Montaggio ------------------------------------------------------------------
function renderReadingStats(el, books) {
    if (!el) return;
    const dated = (books ?? []).filter(b => b.start_date || b.end_date);
    if (!dated.length) {
        el.innerHTML = `
            <div class="empty-state empty-state-compact">
                <span class="empty-icon">${icon('book', 20)}</span>
                <h3>Le tue letture, in un colpo d'occhio</h3>
                <p>Aggiungi le date di inizio e fine ai tuoi libri: qui compariranno il calendario delle letture e le pagine lette ogni mese.</p>
                <a href="miei_libri.html" class="btn-secondary btn">Vai ai miei libri</a>
            </div>`;
        return;
    }
    const st = computeReadingStats(dated);
    const year = st.today.getFullYear();

    el.innerHTML = `
        <div class="reading-tiles">
            <div class="stat-card"><div class="stat-value" data-count>${st.finishedYear}</div><div class="stat-label">Libri finiti nel ${year}</div></div>
            <div class="stat-card"><div class="stat-value" data-count>${st.pagesYear.toLocaleString('it-IT')}</div><div class="stat-label">Pagine lette nel ${year}</div></div>
            <div class="stat-card"><div class="stat-value" data-count>${st.avgDays ?? 0}</div><div class="stat-label">Giorni in media per libro</div></div>
            <div class="stat-card"><div class="stat-value" data-count>${st.readingNow}</div><div class="stat-label">In lettura adesso</div></div>
        </div>

        <div class="chart-card">
            <div class="chart-head">
                <div>
                    <h3 class="chart-title">Calendario delle letture</h3>
                    <p class="chart-sub">${st.readingDays} giorni con un libro aperto negli ultimi 12 mesi</p>
                </div>
                <div class="heat-legend" aria-hidden="true">meno
                    <span class="heat-swatch heat-0"></span><span class="heat-swatch heat-1"></span><span class="heat-swatch heat-2"></span><span class="heat-swatch heat-3"></span><span class="heat-swatch heat-4"></span>
                    più</div>
            </div>
            <div class="heatmap-scroll"></div>
        </div>

        <div class="chart-card">
            <div class="chart-head">
                <div>
                    <h3 class="chart-title">Pagine lette al mese</h3>
                    <p class="chart-sub">Pagine dei libri finiti, ultimi 12 mesi</p>
                </div>
            </div>
            <div class="bars-wrap"></div>
        </div>

        <table class="sr-only">
            <caption>Le tue letture negli ultimi 12 mesi</caption>
            <thead><tr><th>Mese</th><th>Giorni di lettura</th><th>Libri finiti</th><th>Pagine</th></tr></thead>
            <tbody>${st.months.map(m => `<tr><td>${MESI_LUNGHI[m.m]} ${m.y}</td><td>${m.days}</td><td>${m.titles.length}</td><td>${m.pages}</td></tr>`).join('')}</tbody>
        </table>`;

    // Disegno alla misura reale del riquadro (e di nuovo se cambia)
    const sc = el.querySelector('.heatmap-scroll');
    const bw = el.querySelector('.bars-wrap');
    const draw = () => {
        sc.innerHTML = heatmapSvg(st, sc.clientWidth);
        bw.innerHTML = barsSvg(st, bw.clientWidth);
        sc.scrollLeft = sc.scrollWidth;   // parte dal mese più recente
    };
    draw();
    let lastW = sc.clientWidth, rt = 0;
    new ResizeObserver(() => {
        if (Math.abs(sc.clientWidth - lastW) < 8) return;
        lastW = sc.clientWidth;
        clearTimeout(rt); rt = setTimeout(draw, 120);
    }).observe(sc);

    // Tooltip: calendario
    const heat = sc;
    heat.addEventListener('pointerover', (e) => {
        const c = e.target.closest('rect[data-day]');
        if (!c) return;
        const day = new Date(Number(c.dataset.day));
        const titles = st.perDay.get(dayKey(day)) ?? [];
        const r = c.getBoundingClientRect();
        const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
        showTip(`<strong>${formatDate(iso)}</strong>
            ${titles.length ? titles.map(t => `<span>${sanitize(t)}</span>`).join('') : '<span class="muted">Nessun libro in lettura</span>'}`,
            r.left + r.width / 2, r.top);
    });
    heat.addEventListener('pointerleave', hideTip);

    // Tooltip: colonne
    const bars = bw;
    bars.addEventListener('pointerover', (e) => {
        const h = e.target.closest('.bar-hit');
        if (!h) return;
        const m = st.months[Number(h.dataset.i)];
        bars.querySelectorAll('.bar-hit').forEach(x => x.classList.toggle('active', x === h));
        const r = h.getBoundingClientRect();
        showTip(`<strong>${MESI_LUNGHI[m.m]} ${m.y}</strong>
            <span>${m.pages.toLocaleString('it-IT')} pagine · ${m.titles.length} ${m.titles.length === 1 ? 'libro finito' : 'libri finiti'}</span>
            ${m.titles.slice(0, 4).map(t => `<span class="muted">${sanitize(t)}</span>`).join('')}`,
            r.left + r.width / 2, r.top + 20);
    });
    bars.addEventListener('pointerleave', () => { hideTip(); bars.querySelectorAll('.bar-hit').forEach(x => x.classList.remove('active')); });

    // Le colonne crescono dal basso quando entrano nello schermo
    if (window.Motion && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const barEls = [...el.querySelectorAll('.bar')];
        barEls.forEach(b => { b.style.transformOrigin = 'center bottom'; b.style.transformBox = 'fill-box'; b.style.transform = 'scaleY(0)'; });
        window.Motion.inView(bars, () => {
            window.Motion.animate(barEls, { transform: ['scaleY(0)', 'scaleY(1)'] },
                { type: 'spring', stiffness: 260, damping: 24, delay: window.Motion.stagger(0.04) });
        }, { amount: 0.4 });
        const cells = [...el.querySelectorAll('.heat:not(.heat-0)')];
        window.Motion.inView(heat, () => {
            window.Motion.animate(cells, { opacity: [0, 1], transform: ['scale(.4)', 'scale(1)'] },
                { duration: 0.35, delay: window.Motion.stagger(0.003) });
        }, { amount: 0.3 });
        cells.forEach(c => { c.style.transformOrigin = 'center'; c.style.transformBox = 'fill-box'; c.style.opacity = '0'; });
    }
}
