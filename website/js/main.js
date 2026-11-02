/* Smart Money Institute — site interactions (no dependencies) */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const SVGNS = 'http://www.w3.org/2000/svg';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const svgEl = (tag, attrs = {}, parent) => {
    const el = document.createElementNS(SVGNS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };
  const pad = (n) => String(n).padStart(2, '0');

  /* ------------------------------------------------------------------
     Headline word split (blur-in, word by word)
  ------------------------------------------------------------------ */
  $$('[data-split]').forEach((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let i = 0;
    nodes.forEach((node) => {
      const frag = document.createDocumentFragment();
      node.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
        const w = document.createElement('span');
        w.className = 'w';
        w.style.setProperty('--i', i++);
        w.textContent = part;
        frag.appendChild(w);
      });
      node.replaceWith(frag);
    });
  });

  /* ------------------------------------------------------------------
     Reveal on scroll
  ------------------------------------------------------------------ */
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); revealIO.unobserve(e.target); }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  $$('[data-reveal], [data-split]').forEach((el) => revealIO.observe(el));

  /* ------------------------------------------------------------------
     Header: scrolled state, mobile menu, current section
  ------------------------------------------------------------------ */
  const header = $('#siteHeader');
  const nav = $('.nav');
  const navToggle = $('#navToggle');
  const heroImg = $('.hero-img');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      header.classList.toggle('is-scrolled', y > 40);
      if (heroImg && !reduceMotion && y < window.innerHeight * 1.3) heroImg.style.setProperty('--sy', `${y * 0.18}px`);
      ticking = false;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const closeNav = () => { nav.classList.remove('is-open'); navToggle.setAttribute('aria-expanded', 'false'); };
  navToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = nav.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', String(open));
  });
  $$('.nav-links a').forEach((a) => a.addEventListener('click', closeNav));
  document.addEventListener('click', (e) => { if (!nav.contains(e.target)) closeNav(); });

  const navLinks = $$('.nav-links a[href^="#"]');
  const sectionIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      navLinks.forEach((a) => a.classList.toggle('is-current', a.getAttribute('href') === `#${e.target.id}`));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  navLinks.forEach((a) => { const s = $(a.getAttribute('href')); if (s) sectionIO.observe(s); });

  /* ------------------------------------------------------------------
     Hero: pointer parallax
  ------------------------------------------------------------------ */
  const hero = $('.hero');
  const heroCards = $('.hero-visual');
  if (hero && heroCards && !reduceMotion && window.matchMedia('(pointer: fine)').matches) {
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      heroImg.style.setProperty('--mx', `${px * -22}px`);
      heroImg.style.setProperty('--my', `${py * -14}px`);
      heroCards.style.setProperty('--cx', `${px * 16}px`);
      heroCards.style.setProperty('--cy', `${py * 12}px`);
    });
  }

  /* ------------------------------------------------------------------
     Marquee: duplicate content for a seamless loop
  ------------------------------------------------------------------ */
  const track = $('.marquee-track');
  if (track) {
    $$('span', track).forEach((s) => {
      const c = s.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      track.appendChild(c);
    });
  }

  /* ------------------------------------------------------------------
     Count-up numbers
  ------------------------------------------------------------------ */
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      countIO.unobserve(e.target);
      const el = e.target;
      const end = Number(el.dataset.count);
      if (reduceMotion) { el.textContent = end; return; }
      const t0 = performance.now();
      const dur = 1400;
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        el.textContent = Math.round(end * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, { threshold: 0.6 });
  $$('[data-count]').forEach((el) => countIO.observe(el));

  /* ------------------------------------------------------------------
     Hero mini chart (sweep -> CHoCH -> FVG entry)
  ------------------------------------------------------------------ */
  const mini = $('#miniChart');
  if (mini) {
    const data = [[60, 62, 55, 56], [56, 58, 50, 51], [51, 54, 47, 52], [52, 53, 44, 45], [45, 48, 40, 47], [47, 49, 35, 47.5],
      [47.5, 58, 47, 57], [57, 68, 56, 67], [67, 69, 62, 63], [63, 64, 59.5, 60.5], [60.5, 70, 60, 69], [69, 76, 68, 75], [75, 78, 72, 73], [73, 85, 72, 84]];
    const W = 220, H = 96, n = data.length, sx = W / n;
    const X = (i) => (i + 0.5) * sx;
    const Y = (p) => 6 + ((88 - p) / (88 - 32)) * (H - 12);
    svgEl('rect', { x: X(7) - 2, y: Y(62), width: X(12) - X(7) + 4, height: Y(58) - Y(62), fill: 'rgba(255,255,255,0.12)', rx: 2 }, mini);
    svgEl('line', { x1: X(1.5), x2: X(6), y1: Y(40), y2: Y(40), stroke: 'rgba(255,255,255,0.45)', 'stroke-dasharray': '3 3', 'stroke-width': 1.2 }, mini);
    svgEl('line', { x1: X(2), x2: X(7.2), y1: Y(54), y2: Y(54), stroke: '#ffffff', 'stroke-dasharray': '2 2', 'stroke-width': 1.2 }, mini);
    data.forEach(([o, h, l, c], i) => {
      const bull = c >= o;
      const col = bull ? '#ffffff' : 'rgba(245,245,245,0.55)';
      svgEl('line', { x1: X(i), x2: X(i), y1: Y(h), y2: Y(l), stroke: col, 'stroke-width': 1 }, mini);
      svgEl('rect', {
        x: X(i) - sx * 0.3, y: Y(Math.max(o, c)), width: sx * 0.6, height: Math.max(1.5, Math.abs(Y(o) - Y(c))), rx: 1,
        fill: bull ? '#ffffff' : 'rgba(245,245,245,0.08)', stroke: bull ? 'none' : 'rgba(245,245,245,0.55)', 'stroke-width': 0.8,
      }, mini);
    });
    svgEl('circle', { cx: X(9), cy: Y(60.5), r: 3.2, fill: '#fff' }, mini);
    svgEl('circle', { cx: X(9), cy: Y(60.5), r: 7, fill: 'none', stroke: 'rgba(255,255,255,0.45)' }, mini);
  }

  /* ------------------------------------------------------------------
     Curriculum tabs
  ------------------------------------------------------------------ */
  const tabs = $$('.tab');
  const selectTab = (tab, focus = false) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const p = document.getElementById(t.getAttribute('aria-controls'));
      p.hidden = !on;
      p.classList.toggle('is-active', on);
    });
    if (focus) tab.focus();
    tab.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(t));
    t.addEventListener('keydown', (e) => {
      const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
      if (keys[e.key]) { e.preventDefault(); selectTab(tabs[(i + keys[e.key] + tabs.length) % tabs.length], true); }
    });
  });

  /* ------------------------------------------------------------------
     SMC walkthrough chart
  ------------------------------------------------------------------ */
  const smcSvg = $('#smcSvg');
  if (smcSvg) {
    // [open, high, low, close] — hand-built textbook bullish SMC setup
    const C = [
      [136.0, 139.4, 135.4, 138.9], [138.9, 140.2, 137.9, 138.3], [138.3, 138.7, 136.2, 136.7], [136.7, 138.9, 136.3, 138.4],
      [138.4, 140.15, 137.9, 138.8], [138.8, 139.1, 135.9, 136.3], [136.3, 136.8, 133.1, 133.6], [133.6, 134.9, 132.6, 134.3],
      [134.3, 134.6, 130.4, 130.9], [130.9, 131.5, 127.9, 128.4], [128.4, 129.6, 126.9, 129.1], [129.1, 129.4, 125.1, 125.6],
      [125.6, 126.3, 121.9, 122.4], [122.4, 123.0, 119.6, 120.1], [120.1, 121.0, 117.1, 117.8], [117.8, 121.6, 117.5, 121.1],
      [121.1, 124.6, 120.8, 124.0], [124.0, 124.3, 121.0, 121.5], [121.5, 122.0, 118.4, 118.9], [118.9, 119.5, 117.15, 117.6],
      [117.6, 119.4, 117.3, 118.8], [118.8, 119.6, 114.0, 119.3], [119.3, 120.6, 117.8, 118.2], [118.2, 124.0, 117.9, 123.5],
      [123.5, 130.5, 123.2, 130.0], [130.0, 132.8, 127.6, 132.0], [132.0, 132.4, 129.0, 129.5], [129.5, 129.8, 126.9, 127.2],
      [127.2, 127.5, 124.6, 125.6], [125.6, 129.2, 124.9, 128.8], [128.8, 131.8, 128.4, 131.5], [131.5, 132.0, 129.9, 130.6],
      [130.6, 134.6, 130.2, 134.2], [134.2, 137.1, 133.8, 136.8], [136.8, 137.3, 135.4, 136.0], [136.0, 139.2, 135.7, 138.9],
      [138.9, 141.4, 138.5, 140.9], [140.9, 141.2, 138.9, 139.4],
    ];
    const W = 880, H = 430, L = 12, R = 124, T = 22, B = 26;
    const N = C.length, step = (W - L - R) / N, bw = step * 0.56;
    const pMin = 112.5, pMax = 143;
    const X = (i) => L + (i + 0.5) * step;
    const Y = (p) => T + ((pMax - p) / (pMax - pMin)) * (H - T - B);
    const last = [20, 21, 25, 28, 37];

    const grid = svgEl('g', { class: 'svg-grid' }, smcSvg);
    const axis = svgEl('g', { class: 'svg-axis' }, smcSvg);
    for (let p = 115; p <= 140; p += 5) {
      svgEl('line', { x1: L, x2: W - 40, y1: Y(p), y2: Y(p) }, grid);
      svgEl('text', { x: W - 34, y: Y(p) + 3.5 }, axis).textContent = p.toFixed(1);
    }

    const label = (parent, x, y, text, anchor = 'start') => {
      const g = svgEl('g', {}, parent);
      const w = text.length * 6.7 + 14;
      const rx = anchor === 'end' ? x - w : anchor === 'middle' ? x - w / 2 : x;
      svgEl('rect', { class: 'lbl-bg', x: rx, y: y - 13, width: w, height: 19, rx: 6 }, g);
      svgEl('text', { x: rx + 7, y: y + 0.5 }, g).textContent = text;
      return g;
    };
    const ann = (cls, from) => svgEl('g', { class: `ann ${cls}`, 'data-from': from }, smcSvg);

    // back layer: zones
    const fvgB = ann('ann-fvg', 4);
    svgEl('rect', { x: X(23.5), y: Y(127.6), width: X(31) - X(23.5), height: Y(124.0) - Y(127.6), rx: 3 }, fvgB);
    const obB = ann('ann-ob', 4);
    svgEl('rect', { x: X(22) - bw / 2 - 2, y: Y(120.6), width: X(31) - X(22) + bw / 2 + 2, height: Y(117.8) - Y(120.6), rx: 3 }, obB);
    const tradeB = ann('ann-trade', 5);
    svgEl('rect', { class: 'tp', x: X(28), y: Y(140), width: X(36.6) - X(28), height: Y(126) - Y(140), rx: 3 }, tradeB);
    svgEl('rect', { class: 'sl', x: X(28), y: Y(126), width: X(36.6) - X(28), height: Y(122.5) - Y(126), rx: 3 }, tradeB);

    // candles
    const candles = C.map(([o, h, l, c], i) => {
      const g = svgEl('g', { class: `cndl ${c >= o ? 'bull' : 'bear'}` }, smcSvg);
      svgEl('line', { class: 'wick', x1: X(i), x2: X(i), y1: Y(h), y2: Y(l) }, g);
      svgEl('rect', { class: 'body', x: X(i) - bw / 2, y: Y(Math.max(o, c)), width: bw, height: Math.max(1.6, Math.abs(Y(o) - Y(c))), rx: 1.6 }, g);
      return g;
    });

    // front layer: lines + labels
    const liq = ann('ann-liq', 1);
    svgEl('line', { x1: X(1), x2: X(37.6), y1: Y(140.2), y2: Y(140.2) }, liq);
    svgEl('line', { x1: X(14), x2: X(37.6), y1: Y(117.1), y2: Y(117.1) }, liq);
    [[1, 140.2], [4, 140.15], [14, 117.1], [19, 117.15]].forEach(([i, p]) => svgEl('circle', { cx: X(i), cy: Y(p), r: 3.2, fill: '#f5f5f5' }, liq));
    label(liq, X(6), Y(140.2) - 8, 'BSL · equal highs $$$');
    label(liq, X(2.6), Y(117.1) + 22, 'SSL · equal lows $$$');

    const sweep = ann('ann-sweep', 2);
    svgEl('circle', { cx: X(21), cy: Y(114.9), r: 15 }, sweep);
    label(sweep, X(21) - 22, Y(114.2) + 9, 'Liquidity sweep', 'end');

    const choch = ann('ann-choch', 3);
    svgEl('line', { x1: X(16), x2: X(24.6), y1: Y(124.6), y2: Y(124.6) }, choch);
    label(choch, X(16) + 4, Y(124.6) - 9, 'CHoCH');

    const fvgF = ann('ann-fvg', 4);
    label(fvgF, X(31) + 6, Y(125.8) + 4, 'FVG');
    const obF = ann('ann-ob', 4);
    label(obF, X(31) + 6, Y(119.2) + 4, 'Order block');

    const tradeF = ann('ann-trade', 5);
    svgEl('line', { x1: X(28), x2: X(36.6), y1: Y(126), y2: Y(126) }, tradeF);
    label(tradeF, X(36.6) + 6, Y(126) + 4, 'Entry');
    const tp = label(tradeF, X(36.6) + 6, Y(139) + 4, 'TP · 1:4');
    tp.querySelector('text').classList.add('tp-t');
    const sl = label(tradeF, X(36.6) + 6, Y(122.5) + 8, 'SL');
    sl.querySelector('text').classList.add('sl-t');

    const anns = $$('.ann', smcSvg);
    const stepsEls = $$('.smc-step');
    const bar = $('#smcBar');
    const caption = $('#smcCaption');
    const playBtn = $('#smcPlay');
    let current = 1, timer = null, playing = !reduceMotion, visible = false;

    const setStep = (s) => {
      current = s;
      stepsEls.forEach((el) => {
        const n = Number(el.dataset.step);
        el.classList.toggle('is-active', n === s);
        el.classList.toggle('is-done', n < s);
      });
      candles.forEach((g, i) => g.classList.toggle('off', i > last[s - 1]));
      anns.forEach((a) => a.classList.toggle('on', Number(a.dataset.from) <= s));
      bar.style.width = `${(s / 5) * 100}%`;
      bar.style.transition = 'width .5s';
      const active = stepsEls[s - 1];
      caption.innerHTML = `<b>${active.querySelector('b').textContent}.</b> ${active.querySelector('em').textContent}`;
    };
    const schedule = () => {
      clearTimeout(timer);
      if (!playing || !visible) return;
      timer = setTimeout(() => { setStep(current === 5 ? 1 : current + 1); schedule(); }, current === 5 ? 6500 : 4200);
    };
    const setPlaying = (p) => {
      playing = p;
      playBtn.classList.toggle('is-paused', !p);
      playBtn.setAttribute('aria-label', p ? 'Pause walkthrough' : 'Play walkthrough');
      schedule();
    };
    stepsEls.forEach((el) => $('button', el).addEventListener('click', () => { setStep(Number(el.dataset.step)); setPlaying(false); }));
    playBtn.addEventListener('click', () => setPlaying(!playing));
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; schedule(); }, { threshold: 0.35 }).observe(smcSvg);
    setStep(1);
    setPlaying(playing);
  }

  /* ------------------------------------------------------------------
     Method network lines
  ------------------------------------------------------------------ */
  const netLines = $('#netLines');
  if (netLines) {
    $$('.net-node').forEach((n) => {
      const x = parseFloat(n.style.getPropertyValue('--x')) * 6;
      const y = parseFloat(n.style.getPropertyValue('--y')) * 4.6;
      svgEl('line', { x1: 300, y1: 230, x2: x, y2: y }, netLines);
    });
  }

  /* ------------------------------------------------------------------
     Forex sessions in IST (DST-aware via Intl time zones)
  ------------------------------------------------------------------ */
  const SESSIONS = [
    { name: 'Sydney', tz: 'Australia/Sydney', open: 7, close: 16 },
    { name: 'Tokyo', tz: 'Asia/Tokyo', open: 9, close: 18 },
    { name: 'London', tz: 'Europe/London', open: 8, close: 17 },
    { name: 'New York', tz: 'America/New_York', open: 8, close: 17 },
  ];
  // ICT killzones, defined in New York time
  const KILLZONES = [
    { name: 'London killzone', tz: 'America/New_York', open: 2, close: 5 },
    { name: 'New York killzone', tz: 'America/New_York', open: 7, close: 10 },
  ];
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const IST = 330;

  const tzParts = (tz, d) => {
    const o = {};
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', weekday: 'short', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(d).forEach((p) => { o[p.type] = p.value; });
    return o;
  };
  const tzOffset = (tz, d) => {
    const o = tzParts(tz, d);
    const asUTC = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute, +o.second);
    return Math.round((asUTC - d.getTime()) / 60000);
  };
  const windowInfo = (s, now) => {
    const o = tzParts(s.tz, now);
    const local = (+o.hour % 24) * 60 + +o.minute;
    const day = WD.indexOf(o.weekday);
    const weekend = day === 0 || day === 6;
    const openM = s.open * 60, closeM = s.close * 60;
    const isOpen = !weekend && local >= openM && local < closeM;
    const off = tzOffset(s.tz, now);
    const toIST = (m) => (((m - off + IST) % 1440) + 1440) % 1440;
    let mins;
    if (isOpen) mins = closeM - local;
    else {
      let days = local < openM ? 0 : 1;
      let d = (day + days) % 7;
      while (d === 0 || d === 6) { days++; d = (d + 1) % 7; }
      mins = days * 1440 + openM - local;
    }
    return { isOpen, mins, openIST: toIST(openM), closeIST: toIST(closeM), progress: isOpen ? (local - openM) / (closeM - openM) : 0 };
  };
  const fmtDur = (m) => (m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h` : `${Math.floor(m / 60)}h ${pad(m % 60)}m`);
  const fmtIST = (m) => { const h = Math.floor(m / 60) % 24; return `${h % 12 || 12}:${pad(m % 60)} ${h < 12 ? 'AM' : 'PM'}`; };
  const segs = (a, b) => (b > a ? [[a, b]] : [[a, 1440], [0, b]]);

  const miniList = $('#miniSessions');
  const cardsEl = $('#sessionCards');
  const rowsEl = $('#tlRows');
  const nowEl = $('#tlNow');
  const istEl = $('#istNow');
  const kzEl = $('#kzStatus');

  if (rowsEl) {
    // build rows once
    [...SESSIONS, { name: 'Killzones', kz: true }].forEach((s) => {
      const row = document.createElement('div');
      row.className = 'tl-row';
      row.innerHTML = `<span class="tl-name">${s.name}</span><div class="tl-track"></div>`;
      rowsEl.appendChild(row);
    });
    SESSIONS.forEach((s) => {
      const c = document.createElement('div');
      c.className = 'scard';
      c.innerHTML = `<div class="scard-top"><b>${s.name}</b><span class="status">CLOSED</span></div><div class="scard-time">--</div><div class="scard-cd">--</div>`;
      cardsEl.appendChild(c);
    });
  }

  const updateSessions = () => {
    const now = new Date();
    const info = SESSIONS.map((s) => windowInfo(s, now));
    const kz = KILLZONES.map((k) => windowInfo(k, now));
    const istMin = (now.getUTCHours() * 60 + now.getUTCMinutes() + IST) % 1440;

    if (miniList) {
      const order = [2, 3, 1]; // London, New York, Tokyo
      $$('li', miniList).forEach((li, k) => {
        const it = info[order[k]];
        li.classList.toggle('open', it.isOpen);
        $('b', li).style.width = `${Math.round(it.progress * 100)}%`;
        $('em', li).textContent = it.isOpen ? `closes ${fmtDur(it.mins).replace(' ', '')}` : `opens ${fmtDur(it.mins).replace(' ', '')}`;
      });
    }
    if (!rowsEl) return;
    istEl.textContent = fmtIST(istMin);
    nowEl.style.setProperty('--p', (istMin / 1440).toFixed(4));
    const rows = $$('.tl-row', rowsEl);
    info.forEach((it, i) => {
      const track = $('.tl-track', rows[i]);
      track.innerHTML = segs(it.openIST, it.closeIST).map(([a, b]) => `<span class="tl-seg" style="left:${(a / 14.4).toFixed(3)}%;width:${((b - a) / 14.4).toFixed(3)}%"></span>`).join('');
      rows[i].classList.toggle('open', it.isOpen);
      const card = cardsEl.children[i];
      card.classList.toggle('open', it.isOpen);
      $('.status', card).textContent = it.isOpen ? 'OPEN' : 'CLOSED';
      $('.scard-time', card).textContent = `${fmtIST(it.openIST)} – ${fmtIST(it.closeIST)}`;
      $('.scard-cd', card).textContent = `${it.isOpen ? 'Closes' : 'Opens'} in ${fmtDur(it.mins)}`;
    });
    const kzTrack = $('.tl-track', rows[SESSIONS.length]);
    kzTrack.innerHTML = kz.flatMap((it) => segs(it.openIST, it.closeIST)).map(([a, b]) => `<span class="tl-seg kz" style="left:${(a / 14.4).toFixed(3)}%;width:${((b - a) / 14.4).toFixed(3)}%"></span>`).join('');
    const liveKz = kz.findIndex((k) => k.isOpen);
    if (liveKz >= 0) kzEl.textContent = `${KILLZONES[liveKz].name} live`;
    else {
      const next = kz.reduce((a, b, i) => (b.mins < kz[a].mins ? i : a), 0);
      kzEl.textContent = `${KILLZONES[next].name.replace(' killzone', ' KZ')} in ${fmtDur(kz[next].mins)}`;
    }
  };
  updateSessions();
  setInterval(updateSessions, 20000);

  /* ------------------------------------------------------------------
     Challenge blueprint calculator
  ------------------------------------------------------------------ */
  const calc = $('#calc');
  if (calc) {
    const state = { size: 100000, risk: 0.5, rr: 3 };
    const range = $('#riskRange');
    const money = (v) => `$${Math.round(v).toLocaleString('en-US')}`;
    const render = () => {
      const { size, risk, rr } = state;
      $('#cP1').textContent = money(size * 0.08);
      $('#cP2').textContent = money(size * 0.05);
      $('#cDL').textContent = money(size * 0.05);
      $('#cML').textContent = money(size * 0.1);
      $('#cRisk').textContent = money((size * risk) / 100);
      $('#cWins').textContent = Math.ceil(8 / (risk * rr) - 1e-9);
      $('#cLoss').textContent = Math.ceil(10 / risk - 1e-9) - 1;
      $('#riskOut').textContent = `${risk}%`;
      range.style.setProperty('--fill', `${((risk - 0.25) / 1.75) * 100}%`);
      const v = $('#cVerdict');
      v.classList.toggle('mid', risk > 0.5 && risk <= 1);
      v.classList.toggle('high', risk > 1);
      $('span:last-child', v).textContent = risk <= 0.5
        ? 'Conservative: the zone we coach for evaluations.'
        : risk <= 1 ? 'Balanced: workable, but only with strict daily rules.'
          : 'Aggressive: a single bad day can end the challenge.';
    };
    $$('.seg', calc).forEach((seg) => {
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        $$('button', seg).forEach((x) => x.classList.toggle('is-active', x === b));
        state[seg.dataset.seg] = Number(b.dataset.v);
        render();
      });
    });
    range.addEventListener('input', () => { state.risk = Number(range.value); render(); });
    render();
  }

  /* ------------------------------------------------------------------
     1-on-1 chat: messages appear one by one
  ------------------------------------------------------------------ */
  const chat = $('#chatBody');
  if (chat) {
    const msgs = $$('.msg', chat);
    new IntersectionObserver(([e], io) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      msgs.forEach((m, i) => setTimeout(() => m.classList.add('show'), reduceMotion ? 0 : 250 + i * 650));
    }, { threshold: 0.35 }).observe(chat);
  }

  /* ------------------------------------------------------------------
     Modal + lead form (front-end only; connect to your backend)
  ------------------------------------------------------------------ */
  const modal = $('#modal');
  const form = $('#leadForm');
  const formWrap = $('#modalFormWrap');
  const success = $('#modalSuccess');
  const planSelect = $('#planSelect');
  let lastFocus = null;

  const openModal = (plan) => {
    lastFocus = document.activeElement;
    if (plan && planSelect.querySelector(`option[value="${plan}"]`)) planSelect.value = plan;
    formWrap.hidden = false;
    success.hidden = true;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    setTimeout(() => $('input', form).focus(), 120);
  };
  const closeModal = () => {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    if (lastFocus) lastFocus.focus();
  };
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open-modal]');
    if (opener) { e.preventDefault(); closeNav(); openModal(opener.dataset.plan); return; }
    if (e.target.closest('[data-close-modal]')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (!modal.classList.contains('is-open')) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'Tab') {
      const f = $$('button, input, select, a[href]', modal).filter((el) => el.offsetParent !== null);
      const first = f[0], lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
    }
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const checks = {
      name: (data.name || '').trim().length >= 2,
      phone: (data.phone || '').replace(/\D/g, '').length >= 10,
      email: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((data.email || '').trim()),
    };
    let ok = true;
    Object.entries(checks).forEach(([k, valid]) => {
      form.elements[k].closest('.fld').classList.toggle('err', !valid);
      if (!valid && ok) { form.elements[k].focus(); ok = false; }
    });
    if (!ok) return;
    // TODO: send `data` to your backend / Google Sheet / CRM here.
    $('#successName').textContent = data.name.trim().split(' ')[0];
    formWrap.hidden = true;
    success.hidden = false;
    form.reset();
  });
  $$('input', form).forEach((inp) => inp.addEventListener('input', () => inp.closest('.fld').classList.remove('err')));

  /* ------------------------------------------------------------------
     Misc
  ------------------------------------------------------------------ */
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
