// Builds the master GSAP timeline. All beats are keyed to voiceover cues
// (src/cues.js) via at(lineId, wordMark).
//
// Conventions that keep every frame deterministic and seekable:
//  - initial states are set once with gsap.set() before the timeline is built;
//  - the timeline only uses to()/set() (no from()/fromTo()), so scrubbing
//    backwards restores earlier states correctly;
//  - procedural motion (waveforms, particles, counters...) lives in frame()
//    callbacks that are pure functions of time.
window.buildScenes = function () {
  const { at, rng, clamp, lerp, prog, smooth, easeOut, easeInOut } = L;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  gsap.config({ force3D: false });
  gsap.defaults({ lazy: false });
  const tl = gsap.timeline({ paused: true });
  const FR = [];
  const frame = (a, b, fn) => FR.push({ a, b, fn });
  const G = { glow: 0.8, grid: 0 }; // animated globals read by frame callbacks
  const DUR = L.duration();
  const snd = (t, type, o) => SOUND.add(t, type, o); // sound design events (src/sound.js)
  const pan = SOUND.panX;

  // ---------------------------------------------------------------- helpers
  function shot(sel, tin, tout, { fadeIn = 0.35, fadeOut = 0.3, drift = 0.025 } = {}) {
    const el = $(sel);
    gsap.set(el, { autoAlpha: 0 });
    tl.to(el, { autoAlpha: 1, duration: fadeIn, ease: 'power1.out' }, tin);
    tl.to(el, { autoAlpha: 0, duration: fadeOut, ease: 'power1.in' }, tout - fadeOut);
    if (drift) tl.to(el, { scale: 1 + drift, duration: tout - tin, ease: 'none' }, tin);
    return el;
  }
  function flash(t, peak = 0.35, fade = 0.5) {
    tl.to('#flash', { opacity: peak, duration: 0.07, ease: 'power1.out' }, t);
    tl.to('#flash', { opacity: 0, duration: fade, ease: 'power2.out' }, t + 0.07);
  }
  function shake(t, amp = 8, n = 4, el = '#world') {
    const kf = [];
    for (let i = 0; i < n; i++) kf.push({ x: (i % 2 ? -1 : 1) * amp * (1 - i / n), duration: 0.045 });
    kf.push({ x: 0, duration: 0.05 });
    tl.to(el, { keyframes: kf, ease: 'none' }, t);
  }
  function ripple(el, t, to = 1.9, dur = 0.8) {
    tl.set(el, { scale: 1, opacity: 0.85 }, t);
    tl.to(el, { scale: to, opacity: 0, duration: dur, ease: 'power2.out' }, t);
  }
  function glow(t, peak, settle = 1, hold = 0.35, back = 1.3) {
    tl.to(G, { glow: peak, duration: 0.3, ease: 'power2.out' }, t);
    tl.to(G, { glow: settle, duration: back, ease: 'power2.inOut' }, t + hold);
  }
  const cursor = {
    show(t, x, y) {
      tl.set('#cursor', { x, y }, t);
      tl.to('#cursor', { autoAlpha: 1, duration: 0.2 }, t);
    },
    move(t, x, y, d = 0.55) { tl.to('#cursor', { x, y, duration: d, ease: 'power2.inOut' }, t); },
    click(t) {
      tl.to('#cursor svg', { scale: 0.82, duration: 0.07, yoyo: true, repeat: 1, ease: 'power1.inOut' }, t - 0.04);
      tl.set('#cursor .click-ring', { scale: 0.3, opacity: 1 }, t);
      tl.to('#cursor .click-ring', { scale: 1.7, opacity: 0, duration: 0.45, ease: 'power2.out' }, t);
    },
    hide(t) { tl.to('#cursor', { autoAlpha: 0, duration: 0.25 }, t); },
  };

  // ------------------------------------------------------------ build DOM
  L.hydrate(document);
  const waves = {};
  $$('.wave').forEach((w) => (waves[w.id] = L.makeWave(w)));

  // Streaks for the fast-forward / rewind whooshes
  const streakEls = [];
  for (let i = 0; i < 22; i++) {
    const b = document.createElement('b');
    $('#streaks').appendChild(b);
    streakEls.push(b);
  }

  // Confetti for the LlamaIndex reveal
  const CONFETTI_COLORS = ['#3eb4fb', '#5475fd', '#987df8', '#d987f3', '#fe8cd2', '#ff8973', '#ff8722', '#ffffff'];
  const confetti = [];
  {
    const r = rng(11);
    for (let i = 0; i < 46; i++) {
      const e = document.createElement('i');
      const w = 10 + r() * 12, h = 6 + r() * 6;
      e.style.width = w + 'px'; e.style.height = h + 'px'; e.style.borderRadius = '3px';
      e.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      $('#confetti').appendChild(e);
      const ang = -Math.PI / 2 + (r() - 0.5) * 2.6;
      const spd = 700 + r() * 1100;
      confetti.push({ e, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, rot: r() * 360, vr: (r() - 0.5) * 1400, delay: r() * 0.08 });
    }
  }

  // PDF page tables (flashback page, routing page)
  function fillPageTable(el, rows, cols) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const b = document.createElement('b');
      if (r === 0) b.className = 'h';
      el.appendChild(b);
    }
  }
  fillPageTable($('#fb-table'), 5, 4);
  fillPageTable($('#s-route .pg-table'), 4, 4);

  // Pipeline: incoming documents
  const DOC_TYPES = ['pdf', 'scan', 'sheet', 'slide', 'pdf', 'sheet', 'scan', 'pdf', 'slide', 'pdf', 'scan', 'sheet'];
  const docs = DOC_TYPES.map((type, i) => {
    const d = document.createElement('div');
    d.className = 'doc ' + type;
    const corner = type === 'pdf' ? '#e5484d' : type === 'sheet' ? '#1f9d55' : type === 'slide' ? '#ff8722' : null;
    d.innerHTML = (corner ? `<span class="corner" style="background:${corner}"></span>` : '') +
      '<b class="t"></b><b></b><b style="width:80%"></b><b></b><b style="width:65%"></b>';
    $('#doc-stream').appendChild(d);
    return d;
  });
  const pipeParticles = [];
  for (let i = 0; i < 26; i++) {
    const e = document.createElement('i');
    $('#pipe-particles').appendChild(e);
    pipeParticles.push(e);
  }

  // Personal: speed lines + burst particles
  const speedEls = [];
  for (let i = 0; i < 12; i++) {
    const b = document.createElement('b');
    $('#speedlines').appendChild(b);
    speedEls.push(b);
  }
  const personalParts = [];
  for (let i = 0; i < 30; i++) {
    const e = document.createElement('i');
    e.style.background = CONFETTI_COLORS[i % 7];
    $('#personal-particles').appendChild(e);
    personalParts.push(e);
  }

  // Trace: parsed output table + source page table
  const VALUES = [
    ['$56.5M', '$61.2M', '$64.8M'],
    ['$31.2M', '$29.7M', '$33.4M'],
    ['12.4%', '14.1%', '15.0%'],
    ['$8.1M', '$9.3M', '$10.2M'],
  ];
  const HEAD = ['', 'Q1', 'Q2', 'Q3'];
  const mdCells = [], srcCells = [];
  HEAD.forEach((h) => {
    const d = document.createElement('div'); d.className = 'hd'; d.textContent = h; $('#md-table').appendChild(d);
    const s = document.createElement('div'); s.className = 'hd'; s.textContent = h; $('#src-table').appendChild(s);
  });
  VALUES.forEach((row) => {
    const l = document.createElement('div'); l.className = 'lab'; $('#md-table').appendChild(l);
    const sl = document.createElement('div'); sl.className = 'lab'; $('#src-table').appendChild(sl);
    row.forEach((v) => {
      const d = document.createElement('div'); d.className = 'val';
      d.innerHTML = `<i class="hlbg"></i><span>${v}</span>`;
      $('#md-table').appendChild(d); mdCells.push(d);
      const s = document.createElement('div'); s.className = 'val';
      s.innerHTML = `<i class="bbox"></i><span>${v}</span>`;
      $('#src-table').appendChild(s); srcCells.push(s);
    });
  });

  // Benchmark: axes + dots (ParseBench leaderboard data)
  const PW = 1320, PH = 600, XMIN = 0.08, XMAX = 20, YMIN = 30, YMAX = 95;
  const PX = (c) => ((Math.log10(c) - Math.log10(XMIN)) / (Math.log10(XMAX) - Math.log10(XMIN))) * PW;
  const PY = (s) => PH - ((s - YMIN) / (YMAX - YMIN)) * PH;
  {
    const ns = 'http://www.w3.org/2000/svg';
    const ax = $('#axes');
    const mk = (tag, attrs) => {
      const e = document.createElementNS(ns, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      ax.appendChild(e);
      return e;
    };
    [40, 60, 80].forEach((v) => {
      mk('line', { x1: 0, x2: PW, y1: PY(v), y2: PY(v), class: 'grid' });
      mk('text', { x: -18, y: PY(v) + 8, 'text-anchor': 'end', class: 'tick' }).textContent = v;
    });
    [[0.1, '0.1¢'], [1, '1¢'], [10, '10¢']].forEach(([c, label]) => {
      mk('line', { x1: PX(c), x2: PX(c), y1: 0, y2: PH, class: 'grid' });
      mk('text', { x: PX(c), y: PH + 40, 'text-anchor': 'middle', class: 'tick' }).textContent = label;
    });
    mk('line', { x1: 0, x2: 0, y1: 0, y2: PH, class: 'axis' });
    mk('line', { x1: 0, x2: PW, y1: PH, y2: PH, class: 'axis' });
  }
  const otherDots = [], lpDots = {};
  window.PARSEBENCH.forEach(([cost, score, name]) => {
    const d = document.createElement('div');
    d.className = 'pt' + (name ? ' lp' : '');
    L.place(d, PX(cost), PY(score));
    $('#dots').appendChild(d);
    if (name) lpDots[name] = d; else otherDots.push(d);
  });
  {
    const top = lpDots['LlamaParse Agentic Plus'];
    top.innerHTML = `<span class="lbl"><span class="llama">${L.llamaSVG(30)}</span>LlamaParse</span>`;
  }

  // Team orbit
  const MEMBER_COLORS = [
    ['#3eb4fb', '#5475fd'], ['#987df8', '#d987f3'], ['#fe8cd2', '#ff8973'], ['#ff8973', '#ff8722'],
    ['#4590fc', '#987df8'], ['#d987f3', '#fe8cd2'], ['#5475fd', '#3eb4fb'], ['#ff8722', '#fe8cd2'],
    ['#987df8', '#4590fc'], ['#fe8cd2', '#d987f3'], ['#3eb4fb', '#987df8'], ['#ff8973', '#d987f3'],
  ];
  const members = [];
  {
    const r = rng(5);
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', 1920); svg.setAttribute('height', 1080);
    $('#orbit').appendChild(svg);
    // angles (deg) on the left and right arcs, clear of the name + logo below and the heart above
    const ANGLES = [-60, -32, -4, 24, 50, 130, 156, 184, 212, 238, -80, 262];
    ANGLES.forEach((deg, i) => {
      const e = document.createElement('div');
      e.className = 'member';
      const size = 84 + Math.round(r() * 34);
      const [c1, c2] = MEMBER_COLORS[i];
      e.style.width = e.style.height = size + 'px';
      e.style.marginLeft = e.style.marginTop = -size / 2 + 'px';
      e.style.fontSize = Math.round(size * 0.5) + 'px';
      e.style.background = `linear-gradient(135deg, ${c1}, ${c2})`;
      e.innerHTML = L.icon('user');
      $('#orbit').appendChild(e);
      const line = document.createElementNS(ns, 'line');
      svg.appendChild(line);
      members.push({ e, line, a: (deg * Math.PI) / 180, rx: 560 + r() * 60, ry: 300 + r() * 50, bob: r() * 6.28 });
    });
  }
  const heartEls = [];
  for (let i = 0; i < 12; i++) {
    const e = document.createElement('div');
    e.className = 'c';
    e.style.color = ['#fe5c9c', '#fe8cd2', '#d987f3', '#ff8973'][i % 4];
    e.style.fontSize = 30 + (i % 3) * 12 + 'px';
    e.innerHTML = L.icon('heart', 'solid');
    $('#hearts').appendChild(e);
    heartEls.push(e);
  }

  // October 2026 calendar (Oct 1 is a Thursday)
  const dayFills = [];
  {
    const grid = $('#cal-grid');
    ['M', 'T', 'W', 'T', 'F', 'S', 'S'].forEach((d) => {
      const e = document.createElement('div'); e.className = 'wd'; e.textContent = d; grid.appendChild(e);
    });
    for (let i = 0; i < 3; i++) { const e = document.createElement('div'); e.className = 'day empty'; grid.appendChild(e); }
    for (let d = 1; d <= 31; d++) {
      const e = document.createElement('div');
      e.className = 'day';
      e.innerHTML = `<i class="fill"></i><span>${d}</span>`;
      const col = (d + 2) % 7, row = Math.floor((d + 2) / 7);
      e.querySelector('.fill').style.backgroundPosition = `${-col * 120}px ${-row * 106}px`;
      grid.appendChild(e);
      dayFills.push(e);
    }
  }

  // Letter splits
  const wIndex = $('#lp-swap .w-index'), wParse = $('#lp-swap .w-parse');
  const idxChars = L.splitChars(wIndex);
  const parseChars = L.splitChars(wParse);
  {
    let x = 0;
    parseChars.forEach((c) => { c.style.backgroundPosition = `${-x}px 0`; x += c.getBoundingClientRect().width; });
  }

  // ------------------------------------------------ centre + measure anchors
  gsap.set('.c', { xPercent: -50, yPercent: -50 });
  $$('.shot').forEach((s) => (s.style.visibility = 'hidden'));

  const A = {}; // resting-layout anchors in stage px
  A.liMarkDx = L.rect($('#li-wrap')).cx - L.rect($('#li-mark')).cx;
  A.idxW = L.rect(wIndex).w;
  A.parseW = L.rect(wParse).w;
  A.copyBtn = L.rect($('#copy-btn'));
  A.upgradeBtn = L.rect($('#upgrade-btn'));
  A.descGo = L.rect($('#s-link .dl-go'));
  A.charger = L.rect($('#charger'));
  A.bubble = L.rect($('#bubble'));
  A.router = L.rect($('#router'));
  A.routePage = L.rect($('#route-page'));
  A.regions = ['#reg-table', '#reg-chart', '#reg-scan'].map((s) => L.rect($(s)));
  A.models = [1, 2, 3].map((k) => L.rect($('#model-' + k)));
  A.mdCells = mdCells.map((c) => L.rect(c));
  A.srcCells = srcCells.map((c) => L.rect(c));
  A.garble = L.rect($('#garble'));
  A.fbTable = L.rect($('#fb-table'));
  A.fbPage = L.rect($('#fb-page'));

  // Positions that depend on measurement
  {
    const wb = $('#warn-box'), tb = A.fbTable, pg = A.fbPage;
    wb.style.left = tb.x - pg.x - 10 + 'px';
    wb.style.top = tb.y - pg.y - 10 + 'px';
    wb.style.width = tb.w + 20 + 'px';
    wb.style.height = tb.h + 20 + 'px';
    const g = A.garble;
    L.place($('#warn-1'), g.x + g.w - 40, g.y + 118);
    L.place($('#warn-2'), g.x + 400, g.y + 243);
    L.place($('#warn-3'), g.x + g.w - 60, g.y + 378);
  }
  // Routing paths: page region -> router -> model card
  const routePaths = [1, 2, 3].map((k, i) => {
    const p = $('#route-' + k);
    const reg = A.regions[i], m = A.models[i], rt = A.router;
    const sx = A.routePage.x + A.routePage.w + 16, sy = reg.cy;
    const ex = m.x - 14, ey = m.cy;
    p.setAttribute('d', `M ${sx} ${sy} C ${sx + 150} ${sy}, ${rt.cx - 170} ${rt.cy}, ${rt.cx} ${rt.cy} S ${ex - 200} ${ey}, ${ex} ${ey}`);
    const len = p.getTotalLength();
    p.style.strokeDasharray = len;
    p.style.strokeDashoffset = len;
    return { p, len };
  });
  // Trace connectors: output value -> source value
  const traceLinks = [];
  {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = $('#trace-svg');
    const defs = document.createElementNS(ns, 'defs');
    defs.innerHTML = '<linearGradient id="trace-grad" gradientUnits="userSpaceOnUse" x1="250" y1="0" x2="1650" y2="0">' +
      '<stop offset="0" stop-color="#3eb4fb"/><stop offset=".45" stop-color="#987df8"/><stop offset=".75" stop-color="#fe8cd2"/><stop offset="1" stop-color="#ff8722"/></linearGradient>';
    svg.appendChild(defs);
    A.mdCells.forEach((a, i) => {
      const b = A.srcCells[i];
      const sx = a.x + a.w - 26, sy = a.cy, ex = b.x + 6, ey = b.cy;
      const lift = 70 + (i % 3) * 30;
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', `M ${sx} ${sy} C ${sx + 160} ${sy - lift}, ${ex - 220} ${ey - lift}, ${ex} ${ey}`);
      path.setAttribute('stroke', 'url(#trace-grad)');
      svg.appendChild(path);
      const len = path.getTotalLength();
      path.style.strokeDasharray = len;
      path.style.strokeDashoffset = len;
      const d1 = document.createElementNS(ns, 'circle');
      d1.setAttribute('cx', sx); d1.setAttribute('cy', sy); d1.setAttribute('r', 6);
      const d2 = document.createElementNS(ns, 'circle');
      d2.setAttribute('cx', ex); d2.setAttribute('cy', ey); d2.setAttribute('r', 6);
      svg.appendChild(d1); svg.appendChild(d2);
      traceLinks.push({ path, len, d1, d2 });
    });
  }

  // =================================================== 1. interrupt
  const tPause = at('interrupt');
  const tFut = at('interrupt', 'future');
  const t1out = at('sponsor') - 0.02;
  const P1 = { p: 0.3 };
  gsap.set('#s-interrupt', { autoAlpha: 1 });
  gsap.set('#pause-btn', { autoAlpha: 0, scale: 0.3 });
  gsap.set('#pause-btn .ico-ff', { autoAlpha: 0, scale: 0.3, rotation: -90, transformOrigin: '50% 50%' });
  gsap.set('#pause-btn .ico-pause', { transformOrigin: '50% 50%' });
  gsap.set('#progress-a', { autoAlpha: 0, y: 40 });
  gsap.set('#progress-a .knob-tip', { xPercent: -50, autoAlpha: 0, scale: 0.5, transformOrigin: '50% 100%' });

  tl.to('#progress-a', { autoAlpha: 1, y: 0, duration: 0.7, ease: 'expo.out' }, 0.02);
  tl.to(P1, { p: 0.36, duration: tPause - 0.02, ease: 'none' }, 0.02);
  tl.to('#pause-btn', { autoAlpha: 1, scale: 1, duration: 0.6, ease: 'back.out(2.2)' }, tPause - 0.04);
  ripple('#pause-btn .ripple', tPause);
  shake(tPause + 0.02, 7, 4);
  glow(tPause, 1.1, 0.95);
  tl.to('#pause-btn .ico-pause', { autoAlpha: 0, scale: 0.3, rotation: 90, duration: 0.28, ease: 'power2.in' }, tFut - 0.18);
  tl.to('#pause-btn .ico-ff', { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(2)' }, tFut + 0.02);
  ripple('#pause-btn .r2', tFut + 0.05);
  tl.to(P1, { p: 0.93, duration: 0.75, ease: 'expo.inOut' }, tFut - 0.12);
  tl.to('#progress-a .knob-tip', { autoAlpha: 1, scale: 1, duration: 0.45, ease: 'back.out(2)' }, tFut - 0.02);
  tl.to(G, { grid: -900, duration: 1.0, ease: 'expo.inOut' }, tFut - 0.15);
  tl.to('#s-interrupt', { autoAlpha: 0, scale: 1.12, duration: 0.3, ease: 'power2.in' }, t1out - 0.3);
  flash(t1out - 0.1, 0.3, 0.45);
  // sound
  snd(0.02, 'swish', { dur: 0.55, f0: 700, fp: 3200, f1: 1500, gain: -26, pan: -0.25, pan1: 0.25 });
  snd(tPause - 0.02, 'scratch', { gain: -15 });
  snd(tPause, 'thud', { gain: -13 });
  snd(tPause + 0.01, 'click', { gain: -18 });
  snd(tFut - 0.18, 'tick', { pitch: 2200, gain: -22 });
  snd(tFut - 0.12, 'ffwd', { dur: 0.8, gain: -17 });
  snd(tFut, 'pop', { pitch: 880, gain: -21, pan: pan(1562) });
  snd(t1out - 0.32, 'whoosh', { dur: 0.5, f0: 500, fp: 3500, f1: 1200, gain: -19 });

  frame(0, t1out, () => {
    const pa = $('#progress-a');
    pa.querySelector('.played').style.width = P1.p * 100 + '%';
    pa.querySelector('.knob').style.left = P1.p * 100 + '%';
  });

  // =================================================== 2. sponsor -> LlamaIndex
  const t2in = at('sponsor') - 0.08;
  const t2out = at('jerry') - 0.04;
  shot('#s-brand', t2in, t2out, { drift: 0.02, fadeIn: 0.2 });
  const tPresent = at('sponsor', 'present');
  const tSponsor = at('sponsor', 'sponsor');
  gsap.set('#sponsor-pill', { autoAlpha: 0, y: -40 });
  tl.to('#sponsor-pill', { autoAlpha: 1, y: 0, duration: 0.8, ease: 'expo.out' }, t2in + 0.1);

  const giftSvg = $('#gift svg');
  const lid = $('#gift .gift-lid');
  gsap.set('#gift', { y: -780 });
  gsap.set(giftSvg, { transformOrigin: '50% 94%' });
  gsap.set('#gift .gift-shadow', { scale: 0.2, opacity: 0, transformOrigin: '50% 50%' });
  gsap.set(lid, { transformOrigin: '12% 100%' });
  const tLand = tPresent + 0.3;
  tl.to('#gift', { y: 0, duration: 0.45, ease: 'power3.in' }, tLand - 0.45);
  tl.to('#gift .gift-shadow', { scale: 1, opacity: 1, duration: 0.45, ease: 'power3.in' }, tLand - 0.45);
  tl.to(giftSvg, { scaleX: 1.14, scaleY: 0.84, duration: 0.08, ease: 'power1.out' }, tLand);
  tl.to(giftSvg, { scaleX: 1, scaleY: 1, duration: 0.75, ease: 'elastic.out(1.2, 0.35)' }, tLand + 0.08);
  shake(tLand, 6, 4);
  // the lid rattles when the sponsor is mentioned
  const rattle = (t, k) => tl.to(lid, {
    keyframes: [
      { rotation: -9 * k, y: -16 * k, duration: 0.09 }, { rotation: 5 * k, y: -4 * k, duration: 0.1 },
      { rotation: -5 * k, y: -11 * k, duration: 0.1 }, { rotation: 2 * k, y: -2 * k, duration: 0.1 },
      { rotation: 0, y: 0, duration: 0.12 },
    ], ease: 'power1.inOut',
  }, t);
  rattle(tSponsor - 0.06, 1);
  rattle(tSponsor + 0.95, 0.6);
  tl.to('#gift .gift-leak', { opacity: 1, duration: 0.08 }, tSponsor - 0.02);
  tl.to('#gift .gift-leak', { opacity: 0.4, duration: 0.5 }, tSponsor + 0.15);

  // "...one that I had on the podcast a few years ago"
  const tPod = at('podcast');
  const tYears = at('podcast', 'years');
  gsap.set('#podcast-card', { autoAlpha: 0, x: 150, rotationY: -26, transformPerspective: 1400, transformOrigin: '0% 50%' });
  gsap.set('#podcast-card .spin-icon', { transformOrigin: '50% 50%' });
  tl.to('#gift', { x: -470, scale: 0.8, duration: 0.85, ease: 'expo.inOut' }, tPod - 0.25);
  tl.to('#podcast-card', { autoAlpha: 1, x: 0, rotationY: 0, duration: 0.9, ease: 'expo.out' }, tPod + 0.02);
  tl.to('#podcast-card .pc-row .chip:first-child', { scale: 1.12, duration: 0.14, yoyo: true, repeat: 1, ease: 'power2.out' }, at('podcast', 'podcast') - 0.05);
  tl.to('#podcast-year .odo-col', { yPercent: -75, duration: 0.8, ease: 'power3.inOut' }, tYears - 0.22);
  tl.to('#podcast-card .spin-icon', { rotation: -360, duration: 0.8, ease: 'power3.inOut' }, tYears - 0.22);
  tl.to('#podcast-card .year-chip', { borderColor: 'rgba(152,125,248,.85)', backgroundColor: 'rgba(107,91,255,.28)', color: '#ffffff', duration: 0.3 }, tYears + 0.45);
  tl.to('#podcast-card .pc-played', { width: '82%', duration: tYears - tPod + 0.3, ease: 'none' }, tPod);

  // "LlamaIndex." -> the gift pops open
  const tLI = at('llamaindex');
  tl.to('#podcast-card', { autoAlpha: 0, x: 140, duration: 0.4, ease: 'power2.in' }, tLI - 0.5);
  tl.to('#gift', { x: 0, scale: 1, duration: 0.5, ease: 'expo.inOut' }, tLI - 0.48);
  tl.to(lid, { y: -320, x: 90, rotation: 34, opacity: 0, duration: 0.8, ease: 'power3.out' }, tLI + 0.02);
  tl.to('#gift .gift-leak', { opacity: 1, duration: 0.06 }, tLI);
  tl.to('#gift', { y: 320, autoAlpha: 0, duration: 0.5, ease: 'power2.in' }, tLI + 0.3);
  flash(tLI + 0.02, 0.45, 0.7);
  glow(tLI, 1.6, 1.0, 0.4, 1.6);
  gsap.set('#burst', { autoAlpha: 0, scale: 0.3 });
  tl.to('#burst', { autoAlpha: 1, scale: 1, duration: 1.0, ease: 'expo.out' }, tLI);
  tl.to('#burst', { autoAlpha: 0, duration: 1.2, ease: 'power1.in' }, tLI + 1.1);
  gsap.set('#li-mark', { x: A.liMarkDx, y: 150, scale: 0.12, autoAlpha: 0 });
  gsap.set('#li-word', { clipPath: 'inset(-25% 100% -25% 0%)', x: -40 });
  tl.to('#li-mark', { autoAlpha: 1, y: 0, scale: 1, duration: 0.65, ease: 'back.out(1.5)' }, tLI + 0.03);
  tl.to('#li-mark', { x: 0, duration: 0.65, ease: 'expo.inOut' }, tLI + 0.32);
  tl.to('#li-word', { clipPath: 'inset(-25% 0% -25% 0%)', x: 0, duration: 0.75, ease: 'expo.out' }, tLI + 0.46);
  frame(tLI, tLI + 2.2, (t) => {
    const u = t - tLI;
    confetti.forEach((c) => {
      const s = u - c.delay;
      if (s < 0) { c.e.style.opacity = 0; return; }
      const x = 960 + c.vx * s * 0.9, y = 560 + c.vy * s + 900 * s * s;
      c.e.style.transform = `translate(${x}px, ${y}px) rotate(${c.rot + c.vr * s}deg)`;
      c.e.style.opacity = 1 - clamp((s - 0.9) / 0.8);
    });
  });

  // "Yes, the very same RAG framework": the LlamaIndex logo simply holds centre stage
  frame(t2in, t2out, (t) => {
    const r = t - tLI;
    $('#burst .rays').style.transform = `rotate(${(r * 14).toFixed(2)}deg)`;
    const lvl = prog(t, tPod + 0.2, tPod + 0.8) * (1 - prog(t, tLI - 0.5, tLI - 0.1));
    L.driveWave(waves['podcast-wave'], t, lvl, 3);
  });

  // sound
  snd(t2in + 0.12, 'tick', { pitch: 1800, gain: -25 });
  snd(tLand - 0.45, 'whoosh', { dur: 0.45, f0: 2200, fp: 1200, f1: 260, peakAt: 0.9, gain: -20, body: 0.5 });
  snd(tLand, 'thud', { gain: -11 });
  snd(tSponsor - 0.06, 'rattle', { gain: -16 });
  snd(tSponsor, 'sparkle', { dur: 0.6, n: 8, gain: -27 });
  snd(tSponsor + 0.95, 'rattle', { gain: -20, n: 4 });
  snd(tPod - 0.25, 'swish', { dur: 0.4, gain: -24, pan: 0, pan1: -0.4 });
  snd(tPod + 0.02, 'whoosh', { dur: 0.55, f0: 600, fp: 2800, f1: 1000, peakAt: 0.35, gain: -19, pan: 0.8, pan1: 0.35 });
  snd(at('podcast', 'podcast') - 0.05, 'tick', { pitch: 2000, gain: -23, pan: 0.25 });
  snd(tYears - 0.24, 'rewind', { dur: 0.6, gain: -22 });
  [0.35, 0.45, 0.62].forEach((dt, i) => snd(tYears - 0.22 + dt, 'tickTock', { tock: i % 2 === 1, gain: -23, pan: 0.4 }));
  snd(tYears + 0.45, 'marimba', { deg: 7, gain: -23, pan: 0.4, decay: 0.6 });
  snd(tLI - 0.5, 'swish', { dur: 0.4, gain: -23, pan: 0.4, pan1: 0.85 });
  snd(tLI, 'sting', { variant: 'index' });
  snd(tLI + 0.02, 'confetti', { gain: -22 });
  snd(tLI + 0.46, 'swish', { dur: 0.5, f0: 1500, fp: 4500, f1: 2500, gain: -26, pan: -0.3, pan1: 0.4 });

  // =================================================== 3. Jerry Liu on the podcast
  const t3in = at('jerry') - 0.12;
  const t3out = at('except') + 0.02;
  shot('#s-jerry', t3in, t3out, { drift: 0.04 });
  gsap.set('#jerry-photo', { autoAlpha: 0, scale: 0.45, rotation: -12 });
  tl.to('#jerry-photo', { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.9, ease: 'back.out(1.4)' }, t3in + 0.02);
  gsap.set('#s-jerry .mic-badge', { scale: 0 });
  gsap.set('#s-jerry .jerry-name', { yPercent: 110 });
  tl.to('#s-jerry .jerry-name', { yPercent: 0, duration: 0.8, ease: 'expo.out' }, at('jerry', 'Jerry') - 0.12);
  gsap.set('#s-jerry .jerry-role', { autoAlpha: 0, x: -30 });
  tl.to('#s-jerry .jerry-role', { autoAlpha: 1, x: 0, duration: 0.7, ease: 'expo.out' }, at('jerry', 'founder') - 0.12);
  const tJp = at('jerry', 'podcast');
  gsap.set('#jerry-pod', { autoAlpha: 0, scale: 0.6 });
  tl.to('#jerry-pod', { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(2.2)' }, tJp - 0.08);
  tl.to('#s-jerry .mic-badge', { scale: 1, duration: 0.5, ease: 'back.out(2.5)' }, tJp - 0.02);
  gsap.set('#jerry-wave', { autoAlpha: 0 });
  tl.to('#jerry-wave', { autoAlpha: 1, duration: 0.4 }, tJp);
  gsap.set('#jerry-year', { autoAlpha: 0, rotationX: -90, transformPerspective: 600, transformOrigin: '50% 50%' });
  tl.to('#jerry-year', { autoAlpha: 1, rotationX: 0, duration: 0.65, ease: 'back.out(2)' }, at('jerry', 'twenty') - 0.1);
  const jerryRing = $('#s-jerry .spin');
  frame(t3in, t3out, (t) => {
    jerryRing.style.transform = `rotate(${(t * 40).toFixed(2)}deg)`;
    L.driveWave(waves['jerry-wave'], t, prog(t, tJp, tJp + 0.6), 7);
  });

  // sound
  snd(t3in, 'whoosh', { dur: 0.45, gain: -21 });
  snd(t3in + 0.05, 'pop', { pitch: 520, gain: -18, pan: pan(590) });
  snd(at('jerry', 'Jerry') - 0.12, 'swish', { dur: 0.35, f0: 1000, fp: 3800, f1: 2000, gain: -25, pan: 0.2 });
  snd(at('jerry', 'founder') - 0.1, 'tick', { pitch: 1900, gain: -25, pan: 0.2 });
  snd(tJp - 0.08, 'pop', { pitch: 740, gain: -20, pan: 0.05 });
  snd(tJp - 0.01, 'pop', { pitch: 988, gain: -21, pan: pan(780) });
  snd(at('jerry', 'twenty') - 0.1, 'flip', { gain: -22, pan: 0.3 });

  // =================================================== 4. LlamaParse, agentic OCR
  const t4in = at('except') - 0.1;
  const t4out = at('episode') - 0.04;
  shot('#s-parse', t4in, t4out, { drift: 0.03, fadeIn: 0.3 });
  const swap = $('#lp-swap');
  swap.style.width = A.idxW + 'px';
  gsap.set(parseChars, { yPercent: 118 });
  gsap.set('#lp-wrap', { autoAlpha: 0, scale: 0.86 });
  tl.to('#lp-wrap', { autoAlpha: 1, scale: 1, duration: 0.75, ease: 'expo.out' }, t4in);
  const tSwap = at('except', 'Lama') - 0.12;
  tl.to(idxChars, { yPercent: -118, duration: 0.42, ease: 'power3.in', stagger: 0.035 }, tSwap);
  tl.to(swap, { width: A.parseW, duration: 0.6, ease: 'expo.inOut' }, tSwap + 0.15);
  tl.to(parseChars, { yPercent: 0, duration: 0.75, ease: 'expo.out', stagger: 0.045 }, tSwap + 0.28);
  gsap.set('#lp-mark', { transformPerspective: 900 });
  tl.to('#lp-mark', { rotationY: 360, duration: 1.0, ease: 'expo.inOut' }, tSwap);
  flash(tSwap + 0.4, 0.22, 0.6);
  glow(tSwap + 0.35, 1.5, 1.0, 0.3, 1.2);
  const tOcr = at('ocr');
  const tAg = at('ocr', 'agentic');
  gsap.set('#agentic-chip', { autoAlpha: 0, y: 40 });
  tl.to('#agentic-chip', { autoAlpha: 1, y: 0, duration: 0.7, ease: 'expo.out' }, tOcr - 0.12);
  gsap.set('#scanbeam', { y: 280, opacity: 0 });
  tl.to('#scanbeam', { opacity: 1, duration: 0.1 }, tAg - 0.05);
  tl.to('#scanbeam', { y: 790, duration: 1.0, ease: 'power2.inOut' }, tAg - 0.05);
  tl.to('#scanbeam', { opacity: 0, duration: 0.2 }, tAg + 0.8);
  tl.to('#agentic-chip', { scale: 1.06, duration: 0.15, yoyo: true, repeat: 1 }, tAg + 0.55);

  // sound
  snd(t4in, 'whoosh', { dur: 0.5, f0: 400, fp: 2600, f1: 900, gain: -21 });
  for (let i = 0; i < 5; i++) snd(tSwap + i * 0.035, 'tick', { pitch: 2600 - i * 180, gain: -25, pan: 0.15 });
  snd(tSwap, 'whoosh', { dur: 1.0, peakAt: 0.5, f0: 300, fp: 2000, f1: 600, gain: -21, pan: -0.45, pan1: -0.3 });
  for (let i = 0; i < 5; i++) snd(tSwap + 0.28 + i * 0.045, 'tick', { pitch: 1800 + i * 220, gain: -24, pan: 0.15 });
  snd(tSwap + 0.4, 'sting', { variant: 'parse' });
  snd(tOcr - 0.12, 'pop', { pitch: 660, gain: -19 });
  snd(tAg - 0.05, 'scan', { dur: 1.0, gain: -22 });

  // =================================================== 5. flashback: "PDFs will remain a problem"
  const t5in = at('episode') - 0.1;
  const t5out = at('pipeline') + 0.04;
  shot('#s-flash', t5in, t5out, { fadeIn: 0.25, fadeOut: 0.12, drift: 0.02 });
  flash(t5in, 0.28, 0.4);
  tl.to(G, { glow: 0.3, duration: 0.5 }, t5in);
  gsap.set('#fb-tag', { autoAlpha: 0, x: -30 });
  tl.to('#fb-tag', { autoAlpha: 1, x: 0, duration: 0.6, ease: 'expo.out' }, t5in + 0.15);
  gsap.set('#rec-window', { autoAlpha: 0, scale: 0.9 });
  tl.to('#rec-window', { autoAlpha: 1, scale: 1, duration: 0.7, ease: 'expo.out' }, t5in + 0.05);
  const tEpJ = at('episode', 'Jerry');
  tl.to('#tile-guest', { borderColor: 'rgba(255,255,255,.8)', duration: 0.25 }, tEpJ - 0.12);
  tl.to('#tile-guest', { scale: 1.03, duration: 0.2, yoyo: true, repeat: 1 }, tEpJ - 0.12);
  const tPdf = at('pdfs');
  const tP = at('pdfs', 'P');
  const tProb = at('pdfs', 'problem');
  const tLong = at('pdfs', 'long');
  tl.to('#rec-window', { autoAlpha: 0, scale: 0.88, duration: 0.45, ease: 'power2.in' }, tPdf - 0.1);
  gsap.set('#fb-page', { autoAlpha: 0, x: -90, rotation: -6 });
  tl.to('#fb-page', { autoAlpha: 1, x: 0, rotation: -2, duration: 0.75, ease: 'expo.out' }, tP - 0.35);
  gsap.set('#fb-arrow', { autoAlpha: 0, x: -30 });
  tl.to('#fb-arrow', { autoAlpha: 1, x: 0, duration: 0.5, ease: 'expo.out' }, tP - 0.05);
  gsap.set('#garble', { autoAlpha: 0, x: 70 });
  tl.to('#garble', { autoAlpha: 1, x: 0, duration: 0.7, ease: 'expo.out' }, tP + 0.05);
  gsap.set(['#warn-1', '#warn-2', '#warn-3'], { autoAlpha: 0, scale: 0 });
  gsap.set('#warn-box', { autoAlpha: 0, scale: 1.1 });
  tl.to(['#warn-1', '#warn-2', '#warn-3'], { autoAlpha: 1, scale: 1, duration: 0.45, ease: 'back.out(2.6)', stagger: 0.12 }, tProb - 0.12);
  tl.to('#warn-box', { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, tProb - 0.02);
  shake(tProb, 10, 6, '#garble');
  gsap.set('#year-ticker', { autoAlpha: 0, y: -30 });
  tl.to('#year-ticker', { autoAlpha: 1, y: 0, duration: 0.5, ease: 'expo.out' }, tLong - 0.55);
  tl.to('#ticker-odo .odo-col', { yPercent: -25, duration: 0.2, ease: 'power2.inOut' }, tLong - 0.2);
  tl.to('#ticker-odo .odo-col', { yPercent: -50, duration: 0.2, ease: 'power2.inOut' }, tLong + 0.12);
  tl.to('#ticker-odo .odo-col', { yPercent: -75, duration: 0.2, ease: 'power2.inOut' }, at('pipeline') - 0.28);
  tl.to('#year-ticker', { color: '#ffffff', borderColor: 'rgba(152,125,248,.9)', duration: 0.15 }, at('pipeline') - 0.12);

  const GARBLE = [
    [['Q3 '], ['Rev en ue', 1], ['  12.4   '], ['8 .1', 1]],
    [['Tota l', 1], ['  $ 4 5.2 '], ['%%  ??', 1]],
    [['Operat ing  (1 2.8)  '], ['â€™', 1]],
    [['[image]', 1], ['  '], ['[image]', 1]],
    [['| | 2 0 2 3 | | 2 0 2 2 |', 1]],
    [['Net inc ome '], ['���', 1], [' 3.1']],
  ];
  const garbleTotal = GARBLE.reduce((n, line) => n + line.reduce((m, [s]) => m + s.length, 0) + 1, 0);
  const garbleEl = $('#garble-text');
  let garbleLast = -1;
  frame(t5in, t5out, (t) => {
    // recording timer + conversation waveforms
    const secs = 42 * 60 + 17 + Math.floor(Math.max(0, t - t5in));
    $('#rec-time').textContent = `00:${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    const talkHost = 0.6 + 0.4 * Math.max(0, Math.sin(t * 2.1));
    const talkGuest = 0.6 + 0.4 * Math.max(0, Math.sin(t * 2.1 + Math.PI));
    L.driveWave(waves['host-wave'], t, talkHost, 12);
    L.driveWave(waves['guest-wave'], t, talkGuest, 13);
    // garbled extraction types out
    const n = Math.floor(prog(t, tP + 0.3, tProb - 0.1) * garbleTotal);
    const bad = t >= tProb - 0.05;
    const key = n * 2 + (bad ? 1 : 0);
    if (key !== garbleLast) {
      garbleLast = key;
      let left = n, html = '';
      for (const line of GARBLE) {
        for (const [s, isBad] of line) {
          if (left <= 0) break;
          const part = s.slice(0, left);
          left -= part.length;
          html += isBad && bad ? `<span class="bad">${part}</span>` : part;
        }
        if (left <= 0) break;
        html += '\n';
        left -= 1;
      }
      garbleEl.innerHTML = html + (n < garbleTotal && t > tP + 0.3 ? '<span class="tcaret">█</span>' : '');
    }
  });

  // sound (lo-fi where it belongs to the 2023 recording)
  snd(t5in, 'reverse', { dur: 0.5, gain: -20 });
  snd(t5in, 'vinyl', { t1: at('pipeline') - 0.05, gain: -30 });
  snd(t5in + 0.2, 'recBeep', { gain: -25, pan: -0.45, lofi: true });
  snd(tEpJ - 0.12, 'tick', { pitch: 2000, gain: -25, pan: 0.3, lofi: true });
  snd(tPdf - 0.1, 'swish', { dur: 0.35, gain: -24, lofi: true });
  snd(tP - 0.35, 'paper', { gain: -19, pan: -0.55, pan1: -0.35, lofi: true });
  snd(tP - 0.05, 'tick', { pitch: 1700, gain: -26, lofi: true });
  snd(tP + 0.05, 'swish', { dur: 0.35, gain: -23, pan: 0.65, pan1: 0.4, lofi: true });
  snd(tP + 0.3, 'chatter', { dur: tProb - 0.1 - (tP + 0.3), gain: -24, pan: 0.4, lofi: true });
  ['#warn-1', '#warn-2', '#warn-3'].forEach((w, k) => snd(tProb - 0.12 + k * 0.12, 'error', { pitch: [415, 392, 370][k], gain: -18, pan: pan(parseFloat($(w).style.left)) }));
  snd(tProb, 'glitch', { dur: 0.25, gain: -21, pan: 0.4 });
  [tLong - 0.85, tLong - 0.45, tLong - 0.1, tLong + 0.22, at('pipeline') - 0.18].forEach((tt, k) => snd(tt, 'tickTock', { tock: k % 2 === 1, gain: -21 }));
  snd(at('pipeline') - 0.04, 'riser', { dur: 0.75, gain: -19 });

  // =================================================== 6. the pipeline
  const t6in = at('pipeline') - 0.04;
  const t6out = at('personal') - 0.06;
  shot('#s-pipeline', t6in, t6out, { fadeIn: 0.12, drift: 0 });
  flash(t6in, 0.42, 0.6);
  tl.to(G, { glow: 1.15, duration: 0.4 }, t6in);
  gsap.set('#s-pipeline', { scale: 1.1 });
  tl.to('#s-pipeline', { scale: 1.0, duration: t6out - t6in, ease: 'power1.out' }, t6in);
  gsap.set('#engine', { autoAlpha: 0, scale: 0.8 });
  tl.to('#engine', { autoAlpha: 1, scale: 1, duration: 0.8, ease: 'back.out(1.4)' }, t6in + 0.05);
  gsap.set('#s-pipeline .pipe-svg path', { opacity: 0 });
  tl.to('#s-pipeline .pipe-svg path', { opacity: 0.6, duration: 0.5 }, t6in + 0.2);
  gsap.set('#outputs .out-card', { autoAlpha: 0, x: -70 });
  gsap.set('#outputs .ok', { scale: 0, transformOrigin: '50% 50%' });
  tl.to('#outputs .out-card', { autoAlpha: 1, x: 0, duration: 0.6, ease: 'expo.out', stagger: 0.34 }, t6in + 0.75);
  tl.to('#outputs .ok', { scale: 1, duration: 0.4, ease: 'back.out(3)', stagger: 0.34 }, t6in + 1.0);
  const tPow = at('pipeline', 'powerful');
  const tPipe = at('pipeline', 'pipeline');
  tl.to('#engine', { scale: 1.05, duration: 0.18, ease: 'power2.out' }, tPow - 0.05);
  tl.to('#engine', { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.5)' }, tPow + 0.13);
  tl.to('#engine .engine-glow', { opacity: 1, scale: 1.25, duration: 0.4, ease: 'power2.out' }, tPow - 0.05);
  tl.to('#engine .engine-glow', { opacity: 0.7, scale: 1.1, duration: 1.2 }, tPow + 0.4);
  glow(tPow, 1.5, 1.1);
  flash(tPow, 0.12, 0.4);
  const stages = $$('#engine .stage');
  const engineScan = $('#engine .engine-scan');
  frame(t6in, t6out, (t) => {
    const u = t - t6in;
    const speed = t < tPow ? 1 : 1.9;
    // documents stream in along converging lanes
    const lanes = [-250, -130, 0, 130, 250];
    docs.forEach((d, i) => {
      const s = u * 0.5 - i / docs.length;
      if (s < 0) { d.style.opacity = 0; return; }
      const p = s % 1;
      const lane = lanes[i % lanes.length];
      const x = lerp(-150, 700, p);
      const y = 540 + lane * Math.pow(1 - p, 1.6);
      const sc = 1 - 0.6 * Math.pow(p, 3);
      d.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${sc.toFixed(3)}) rotate(${(lane / 40) * (1 - p)}deg)`;
      d.style.opacity = (Math.min(1, p * 10) * (1 - smooth(prog(p, 0.84, 0.98)))).toFixed(3);
    });
    // particles along the beam
    pipeParticles.forEach((e, k) => {
      const r = rng(k * 97 + 3);
      const sz = 4 + r() * 7;
      const p = (u * (0.55 + r() * 0.5) * speed + r()) % 1;
      const seg = k % 3;
      const x = seg === 2 ? lerp(1270, 1420, p) : lerp(-60, 660, p);
      const y = 540 + (r() - 0.5) * 26 + Math.sin(u * 5 + k) * 5;
      e.style.width = e.style.height = sz + 'px';
      e.style.background = ['#3eb4fb', '#987df8', '#fe8cd2', '#ffffff'][k % 4];
      e.style.boxShadow = `0 0 ${sz * 2}px ${e.style.background}`;
      e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      e.style.opacity = (Math.sin(Math.PI * p) * 0.9).toFixed(3);
    });
    // stage lights sweep through the engine
    const ph = (u * 0.95 * speed) % 1.25;
    const all = smooth(prog(t, tPipe - 0.1, tPipe + 0.5));
    stages.forEach((s, i) => {
      let I = Math.max(0, 1 - Math.abs(ph - i / 4 * 0.9) * 5);
      I = Math.max(I, all * (0.75 + 0.25 * Math.sin(u * 6 + i)));
      s.style.background = `rgba(107,91,255,${(0.06 + 0.4 * I).toFixed(3)})`;
      s.style.borderColor = `rgba(152,125,248,${(0.18 + 0.8 * I).toFixed(3)})`;
      s.style.color = I > 0.45 ? '#ffffff' : '#9d9da8';
      s.style.boxShadow = `0 0 ${Math.round(34 * I)}px rgba(152,125,248,${(0.8 * I).toFixed(3)})`;
    });
    const sp = (u * 0.9 * speed) % 1;
    engineScan.style.transform = `translateY(${(40 + sp * 300).toFixed(1)}px)`;
    engineScan.style.opacity = (Math.sin(Math.PI * sp) * 0.9).toFixed(3);
  });

  // sound
  snd(t6in, 'impact', { gain: -8, size: 1.2 });
  snd(t6in, 'sparkle', { dur: 1.2, n: 20, gain: -24 });
  snd(t6in + 0.05, 'powerUp', { dur: 0.8, gain: -19 });
  snd(t6in + 0.3, 'hum', { t1: t6out, gain: -29 });
  for (let tt = t6in + 0.25; tt < t6out - 0.3; tt += 0.34) snd(tt, 'swish', { dur: 0.3, f0: 1500, fp: 4500, f1: 2500, gain: -31, pan: -0.8, pan1: -0.3 });
  for (let k = 0; k < 4; k++) {
    snd(t6in + 0.75 + k * 0.34, 'swish', { dur: 0.25, gain: -28, pan: 0.45, pan1: 0.6 });
    snd(t6in + 1.0 + k * 0.34, 'marimba', { deg: 5 + k, gain: -21, pan: 0.65 });
  }
  snd(tPow - 0.05, 'surge', { gain: -17 });
  snd(tPipe - 0.1, 'chime', { notes: [0, 2, 4, 7, 9], spacing: 0.05, decay: 1.6, gain: -20 });

  // =================================================== 7. "took that a bit personally"
  const t7in = at('personal') - 0.1;
  const t7out = at('route') - 0.04;
  shot('#s-personal', t7in, t7out, { drift: 0.02 });
  gsap.set('#bubble', { autoAlpha: 0, scale: 0.7, rotation: -4, '--gb': 0 });
  tl.to('#bubble', { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.6, ease: 'back.out(1.7)' }, t7in + 0.05);
  const tChargeIn = t7in + 0.45;
  gsap.set('#charger', { x: 900 });
  tl.to('#charger', { x: 0, duration: 0.7, ease: 'expo.out' }, tChargeIn);
  const tPers = at('personal', 'personally');
  // the llama fumes: anger mark + steam puffs from the nose
  const snout = { x: 86, y: 78 };
  gsap.set('#anger', { scale: 0, rotation: -30, transformOrigin: '50% 50%' });
  tl.to('#anger', { scale: 1, rotation: 0, duration: 0.4, ease: 'back.out(3)' }, tPers - 1.05);
  tl.to('#anger', { scale: 1.25, duration: 0.12, yoyo: true, repeat: 3, ease: 'power1.inOut' }, tPers - 0.6);
  tl.to('#anger', { scale: 0, opacity: 0, duration: 0.25, ease: 'power2.in' }, tPers + 0.35);
  $$('#charger .puff').forEach((p, i) => {
    L.place(p, snout.x - 20, snout.y - 20);
    gsap.set(p, { scale: 0.3, opacity: 0 });
    const t0 = tPers - 0.95 + i * 0.2;
    tl.to(p, { opacity: 0.95, scale: 0.9, duration: 0.12, ease: 'power1.out' }, t0);
    tl.to(p, { x: -46 - i * 10, y: -18 - i * 12, scale: 1.6, duration: 0.55, ease: 'power2.out' }, t0);
    tl.to(p, { opacity: 0, duration: 0.3, ease: 'power1.in' }, t0 + 0.28);
  });
  tl.to('#charger', { keyframes: [
    { rotation: -4, duration: 0.05 }, { rotation: 4, duration: 0.05 }, { rotation: -3, duration: 0.05 },
    { rotation: 3, duration: 0.05 }, { rotation: 0, duration: 0.05 },
  ], ease: 'none' }, tPers - 0.95);
  tl.to('#charger', { x: 46, scale: 0.94, duration: 0.2, ease: 'power2.out' }, tPers - 0.3);
  tl.to('#charger', { x: -34, scale: 1.05, duration: 0.18, ease: 'expo.out' }, tPers - 0.08);
  tl.to('#charger', { x: 0, scale: 1, duration: 0.5, ease: 'power3.out' }, tPers + 0.25);
  // laser from the llama to the 2023 speech bubble
  const lx = A.charger.x + snout.x - 4, ly = A.charger.y + snout.y + 16;
  const bx = A.bubble.x + A.bubble.w - 60, by = A.bubble.cy;
  const laserLen = Math.hypot(lx - bx, ly - by);
  const laserAng = (Math.atan2(by - ly, bx - lx) * 180) / Math.PI;
  gsap.set('#laser', { x: lx, y: ly, rotation: laserAng, width: 0, opacity: 0 });
  tl.to('#laser', { opacity: 1, width: laserLen, duration: 0.14, ease: 'power2.out' }, tPers - 0.05);
  tl.to('#laser', { opacity: 0, duration: 0.4, ease: 'power1.in' }, tPers + 0.35);
  tl.to('#bubble', { '--gb': 1, borderColor: 'rgba(0,0,0,0)', backgroundColor: '#1d1b2c', duration: 0.25 }, tPers + 0.1);
  tl.to('#bubble .bubble-tail', { backgroundColor: '#1d1b2c', borderColor: 'rgba(69,144,252,.95)', duration: 0.25 }, tPers + 0.1);
  tl.to('#bubble .off', { autoAlpha: 0, scale: 0.4, duration: 0.2, stagger: 0.07, transformOrigin: '50% 50%' }, tPers + 0.08);
  gsap.set('#bubble .on', { autoAlpha: 0, scale: 0.4, transformOrigin: '50% 50%' });
  tl.to('#bubble .on', { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(2.6)', stagger: 0.08 }, tPers + 0.16);
  tl.to('#bubble', { scale: 1.07, duration: 0.12, ease: 'power2.out' }, tPers + 0.1);
  tl.to('#bubble', { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.45)' }, tPers + 0.22);
  tl.to('#world', { scale: 1.05, duration: 0.1, ease: 'power2.out' }, tPers + 0.05);
  tl.to('#world', { scale: 1, duration: 0.6, ease: 'power3.out' }, tPers + 0.15);
  shake(tPers + 0.06, 9, 5);
  flash(tPers + 0.08, 0.2, 0.4);
  glow(tPers + 0.05, 1.4, 1.0);
  frame(t7in, t7out, (t) => {
    // speed lines while the llama charges in
    const u = t - tChargeIn;
    speedEls.forEach((b, i) => {
      const r = rng(i * 17 + 5);
      const life = 0.55;
      const s = u - r() * 0.2;
      if (s < 0 || s > life) { b.style.opacity = 0; return; }
      const y = A.charger.y + 40 + r() * (A.charger.h - 60);
      const len = 160 + r() * 260;
      const x = A.charger.x + A.charger.w * 0.6 + s * 1400 * (0.6 + r() * 0.6);
      b.style.width = len + 'px';
      b.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      b.style.opacity = ((1 - s / life) * (0.3 + 0.5 * r())).toFixed(3);
    });
    // spark burst when the bubble flips
    const v = t - tPers - 0.12;
    personalParts.forEach((e, i) => {
      if (v < 0) { e.style.opacity = 0; return; }
      const r = rng(i * 31 + 9);
      const ang = r() * Math.PI * 2, spd = 350 + r() * 700, sz = 6 + r() * 9;
      const x = A.bubble.cx + Math.cos(ang) * spd * v * (1 - v * 0.4);
      const y = A.bubble.cy + Math.sin(ang) * spd * v * (1 - v * 0.4) + 200 * v * v;
      e.style.width = e.style.height = sz + 'px';
      e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      e.style.opacity = (1 - clamp(v / 0.9)).toFixed(3);
    });
  });

  // sound
  snd(t7in + 0.05, 'pop', { pitch: 440, gain: -18, pan: pan(720) });
  snd(tChargeIn, 'whoosh', { dur: 0.55, f0: 2500, fp: 1500, f1: 400, peakAt: 0.25, gain: -17, pan: 0.9, pan1: 0.4 });
  snd(tPers - 1.05, 'grumble', { gain: -20, pan: 0.4 });
  [0, 1, 2].forEach((i) => snd(tPers - 0.95 + i * 0.2, 'steam', { gain: -22, pan: 0.35 }));
  snd(tPers - 0.3, 'windup', { dur: 0.25, gain: -22, pan: 0.45 });
  snd(tPers - 0.05, 'laser', { gain: -12, pan: 0.45, pan1: -0.2 });
  snd(tPers + 0.1, 'impact', { gain: -15, size: 0.6 });
  snd(tPers + 0.12, 'sparkle', { dur: 0.8, n: 16, gain: -22 });
  snd(tPers + 0.16, 'chime', { notes: [5, 7, 10], spacing: 0.08, decay: 1.2, gain: -18, pan: pan(720) });

  // =================================================== 8. tables, charts, scans -> right model
  const t8in = at('route') - 0.12;
  const t8out = at('trace') - 0.02;
  shot('#s-route', t8in, t8out, { drift: 0.015 });
  gsap.set('#route-page', { autoAlpha: 0, x: -80 });
  tl.to('#route-page', { autoAlpha: 1, x: 0, duration: 0.7, ease: 'expo.out' }, t8in);
  gsap.set('#router', { autoAlpha: 0, scale: 0.5 });
  tl.to('#router', { autoAlpha: 1, scale: 1, duration: 0.6, ease: 'back.out(1.8)' }, t8in + 0.12);
  gsap.set('#s-route .model', { autoAlpha: 0, x: 70 });
  tl.to('#s-route .model', { autoAlpha: 1, x: 0, duration: 0.6, ease: 'expo.out', stagger: 0.09 }, t8in + 0.2);
  gsap.set('#s-route .reg-box', { autoAlpha: 0, scale: 1.12, transformOrigin: '50% 50%' });
  gsap.set('#s-route .m-check', { scale: 0, autoAlpha: 0 });
  const ROUTE_MARKS = ['tables', 'charts', 'scans'];
  const flyT = ROUTE_MARKS.map((m) => at('route', m));
  ROUTE_MARKS.forEach((m, i) => {
    const t0 = flyT[i];
    const reg = ['#reg-table', '#reg-chart', '#reg-scan'][i];
    tl.to(`${reg} .reg-box`, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' }, t0 - 0.08);
    tl.to(routePaths[i].p, { strokeDashoffset: 0, duration: 0.55, ease: 'power2.inOut' }, t0 + 0.02);
    const card = '#model-' + (i + 1);
    const arrive = t0 + 0.82;
    tl.to(card, {
      borderColor: getComputedStyle($(card)).getPropertyValue('--c').trim(),
      boxShadow: `0 30px 70px rgba(0,0,0,.5), 0 0 50px ${getComputedStyle($(card)).getPropertyValue('--c').trim()}66`,
      duration: 0.25,
    }, arrive);
    tl.to(`${card} .m-type`, { scale: 1.15, duration: 0.12, yoyo: true, repeat: 1 }, arrive);
    tl.to('#router', { scale: 1.1, duration: 0.1, yoyo: true, repeat: 1 }, t0 + 0.38);
  });
  const tRight = at('route', 'right');
  tl.to('#s-route .m-check', { scale: 1, autoAlpha: 1, duration: 0.45, ease: 'back.out(3)', stagger: 0.08 }, tRight - 0.05);
  const flyers = [1, 2, 3].map((k) => $('#fly-' + k));
  frame(t8in, t8out, (t) => {
    $('#router .router-ring').style.transform = `rotate(${(t * 50).toFixed(2)}deg)`;
    flyers.forEach((f, i) => {
      const u = prog(t, flyT[i] + 0.02, flyT[i] + 0.82);
      if (u <= 0 || u >= 1) { f.style.opacity = 0; return; }
      const e = easeInOut(u);
      const pt = routePaths[i].p.getPointAtLength(e * routePaths[i].len);
      f.style.transform = `translate(${pt.x.toFixed(1)}px, ${pt.y.toFixed(1)}px) scale(${(0.7 + 0.3 * Math.sin(Math.PI * u)).toFixed(3)})`;
      f.style.opacity = Math.min(1, u * 8, (1 - u) * 8).toFixed(3);
    });
  });

  // sound
  snd(t8in, 'swish', { dur: 0.4, gain: -22, pan: -0.8, pan1: -0.55 });
  snd(t8in + 0.15, 'pop', { pitch: 520, gain: -20, pan: pan(900) });
  snd(t8in + 0.2, 'swish', { dur: 0.45, gain: -26, pan: 0.8, pan1: 0.55 });
  ROUTE_MARKS.forEach((m, i) => {
    const t0 = flyT[i];
    snd(t0 - 0.08, 'marimba', { deg: [3, 4, 5][i], gain: -21, pan: -0.6, decay: 0.3 });
    snd(t0 + 0.02, 'zip', { dur: 0.8, f0: 500 + 150 * i, f1: 1200 + 200 * i, gain: -25, pan: -0.55, pan1: 0.6 });
    snd(t0 + 0.38, 'tick', { pitch: 2400, gain: -27, pan: pan(900) });
    snd(t0 + 0.82, 'lock', { gain: -20, pan: 0.6 });
  });
  snd(tRight - 0.05, 'chime', { notes: [4, 7, 9], spacing: 0.08, decay: 1.2, gain: -19, pan: 0.6 });

  // =================================================== 9. trace every value to its source
  const t9in = at('trace') - 0.05;
  const t9out = at('bench') - 0.05;
  shot('#s-trace', t9in, t9out, { drift: 0 });
  gsap.set('#app', { autoAlpha: 0, y: 70, rotationX: 16, transformPerspective: 2000, transformOrigin: '50% 100%' });
  tl.to('#app', { autoAlpha: 1, y: 0, rotationX: 0, duration: 0.85, ease: 'expo.out' }, t9in);
  const tEvery = at('trace', 'every');
  const tSource = at('trace', 'source');
  const first = A.mdCells[0];
  cursor.show(t9in + 0.25, 1560, 1010);
  cursor.move(t9in + 0.3, first.cx + 20, first.cy + 12, 0.5);
  const order = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  order.forEach((idx, j) => {
    const t0 = j === 0 ? t9in + 0.78 : tEvery + 0.05 + (j - 1) * 0.1;
    const cell = mdCells[idx], src = srcCells[idx], link = traceLinks[idx];
    gsap.set(cell.querySelector('.hlbg'), { autoAlpha: 0 });
    gsap.set(src.querySelector('.bbox'), { autoAlpha: 0, scale: 1.3, transformOrigin: '50% 50%' });
    gsap.set([link.d1, link.d2], { opacity: 0 });
    tl.to(cell.querySelector('.hlbg'), { autoAlpha: 1, duration: 0.18 }, t0);
    tl.to(cell, { color: '#ffffff', duration: 0.18 }, t0);
    tl.to(link.d1, { opacity: 1, duration: 0.1 }, t0);
    tl.to(link.path, { strokeDashoffset: 0, duration: 0.42, ease: 'power2.inOut' }, t0 + 0.02);
    tl.to(link.d2, { opacity: 1, duration: 0.1 }, t0 + 0.4);
    tl.to(src.querySelector('.bbox'), { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' }, t0 + 0.34);
  });
  cursor.move(tEvery + 0.3, first.cx + 90, first.cy + 170, 0.9);
  cursor.hide(tSource - 0.1);
  tl.to('#s-trace .src-table .bbox', { scale: 1.12, duration: 0.14, yoyo: true, repeat: 1, stagger: 0.02 }, tSource - 0.2);
  tl.to('#s-trace .page-num', { color: '#6b5bff', scale: 1.4, duration: 0.3, ease: 'back.out(2)', transformOrigin: '100% 100%' }, tSource - 0.15);

  // sound
  snd(t9in, 'whoosh', { dur: 0.6, f0: 300, fp: 2000, f1: 700, gain: -20 });
  order.forEach((idx, j) => {
    const t0 = j === 0 ? t9in + 0.78 : tEvery + 0.05 + (j - 1) * 0.1;
    if (j === 0) snd(t0, 'click', { gain: -18, pan: pan(A.mdCells[0].cx) });
    snd(t0 + 0.4, 'marimba', { deg: j, gain: -23, pan: pan(A.srcCells[idx].cx), decay: 0.35 });
  });
  snd(tEvery + 0.05, 'swish', { dur: 1.3, f0: 800, fp: 3000, f1: 1800, gain: -28, pan: -0.3, pan1: 0.45 });
  snd(tSource - 0.2, 'chime', { notes: [4, 7, 9, 11], spacing: 0.04, decay: 1.4, gain: -21, pan: 0.45 });
  snd(tSource - 0.15, 'tick', { pitch: 2800, gain: -24, pan: 0.65 });

  // =================================================== 10. ParseBench
  const t10in = at('bench') - 0.1;
  const t10out = at('code') - 0.06;
  shot('#s-bench', t10in, t10out, { drift: 0.015 });
  gsap.set('#bench', { autoAlpha: 0, y: 60, scale: 0.96 });
  tl.to('#bench', { autoAlpha: 1, y: 0, scale: 1, duration: 0.8, ease: 'expo.out' }, t10in);
  gsap.set('#axes', { opacity: 0 });
  tl.to('#axes', { opacity: 1, duration: 0.6 }, t10in + 0.3);
  gsap.set(['.y-label', '.x-label'], { opacity: 0 });
  tl.to(['.y-label', '.x-label'], { opacity: 1, duration: 0.5, stagger: 0.1 }, t10in + 0.45);
  const tBench = at('bench', 'benchmark');
  {
    const r = rng(21);
    const shuffled = otherDots.map((d) => [r(), d]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    gsap.set(otherDots, { scale: 0, autoAlpha: 0 });
    tl.to(shuffled, { scale: 1, autoAlpha: 0.85, duration: 0.35, ease: 'back.out(2.5)', stagger: 0.012 }, tBench - 0.25);
    shuffled.forEach((d, k) => snd(tBench - 0.2 + k * 0.012, 'plink', { deg: 8 + Math.floor(r() * 7), gain: -32, pan: pan(330 + parseFloat(d.style.left)) }));
  }
  const tTop = at('top', 'top');
  const tFrac = at('top', 'fraction');
  const lpList = ['LlamaParse Cost Effective', 'LlamaParse Agentic', 'LlamaParse Agentic Plus'].map((n) => lpDots[n]);
  gsap.set(lpList, { scale: 0, autoAlpha: 0, y: 60 });
  gsap.set('#s-bench .pt .lbl', { autoAlpha: 0, x: -14 });
  tl.to(lpList, { scale: 1, autoAlpha: 1, y: 0, duration: 0.6, ease: 'back.out(2.4)', stagger: 0.1 }, tTop - 0.25);
  tl.to('#s-bench .pt .lbl', { autoAlpha: 1, x: 0, duration: 0.5, ease: 'expo.out' }, tTop + 0.1);
  const topDot = lpDots['LlamaParse Agentic Plus'];
  const agDot = lpDots['LlamaParse Agentic'];
  L.place($('#crown'), parseFloat(topDot.style.left), parseFloat(topDot.style.top) - 50);
  gsap.set('#crown', { autoAlpha: 0, y: -40, rotation: -20 });
  tl.to('#crown', { autoAlpha: 1, y: 0, rotation: 0, duration: 0.6, ease: 'bounce.out' }, tTop + 0.05);
  L.place($('#price-tag'), parseFloat(agDot.style.left), parseFloat(agDot.style.top) - 62);
  gsap.set('#price-tag', { autoAlpha: 0, scale: 0.5, transformOrigin: '50% 100%' });
  tl.to('#price-tag', { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(2.2)' }, tFrac - 0.12);
  tl.to(agDot, { scale: 1.35, duration: 0.15, yoyo: true, repeat: 1 }, tFrac - 0.1);
  // other dots dim once LlamaParse is on top
  tl.to(otherDots, { autoAlpha: 0.45, duration: 0.5 }, tTop + 0.2);
  glow(tTop, 1.35, 1.0);

  // sound
  snd(t10in, 'whoosh', { dur: 0.6, f0: 300, fp: 2200, f1: 800, gain: -20 });
  lpList.forEach((d, k) => snd(tTop - 0.15 + k * 0.1, 'marimba', { deg: 7 + 2 * k, gain: -20, pan: pan(330 + parseFloat(d.style.left)), decay: 0.6 }));
  snd(tTop + 0.05, 'crown', { gain: -17, pan: pan(330 + parseFloat(topDot.style.left)) });
  snd(tTop + 0.1, 'sparkle', { dur: 0.8, n: 10, gain: -27, spread: 0.5 });
  snd(tFrac - 0.12, 'coin', { gain: -18, pan: pan(330 + parseFloat(agDot.style.left)) });

  // =================================================== 11. promo code + offer
  const t11in = at('code') - 0.1;
  const t11out = at('link') - 0.06;
  shot('#s-offer', t11in, t11out, { drift: 0 });
  gsap.set('#coupon-wrap', { autoAlpha: 0, rotationX: -70, y: 90, transformPerspective: 1800, transformOrigin: '50% 100%' });
  tl.to('#coupon-wrap', { autoAlpha: 1, rotationX: 0, y: 0, duration: 0.9, ease: 'expo.out' }, t11in);
  const tType = at('code', 'summer') - 0.1;
  const CODE = 'SUMMERGIFT26';
  const tCopy = at('code', 'end') - 0.2;
  cursor.show(tType + 0.4, 1600, 960);
  cursor.move(tType + 0.45, A.copyBtn.cx + 10, A.copyBtn.cy + 14, 0.6);
  cursor.click(tCopy);
  tl.to('#copy-btn', { scale: 0.9, duration: 0.07, yoyo: true, repeat: 1 }, tCopy - 0.03);
  tl.to('#copy-btn .i-copy', { opacity: 0, scale: 0.5, duration: 0.15, transformOrigin: '50% 50%' }, tCopy + 0.03);
  gsap.set('#copy-btn .i-check', { scale: 0.4, transformOrigin: '50% 50%' });
  tl.to('#copy-btn .i-check', { opacity: 1, scale: 1, duration: 0.35, ease: 'back.out(3)' }, tCopy + 0.08);
  tl.to('#copy-btn', { backgroundColor: '#22c55e', boxShadow: '0 16px 40px rgba(34,197,94,.5), inset 0 2px 0 rgba(255,255,255,.25)', duration: 0.2 }, tCopy + 0.05);
  cursor.hide(tCopy + 0.45);
  const tCred = at('credits');
  tl.to('#coupon-wrap', { y: -262, scale: 0.78, duration: 0.8, ease: 'expo.inOut' }, tCred - 0.12);
  const tTwo = at('credits', 'two');
  const tFree = at('credits', 'free');
  gsap.set('.tile-card', { autoAlpha: 0, y: 70 });
  tl.to('#tile-credits', { autoAlpha: 1, y: 0, duration: 0.7, ease: 'expo.out' }, tTwo - 0.25);
  gsap.set('#credit-label', { opacity: 0.55 });
  tl.to('#credit-label', { opacity: 1, color: '#ffffff', duration: 0.25 }, tFree - 0.1);
  tl.to('#tile-credits .tc-ico', { scale: 1.2, rotation: -12, duration: 0.15, yoyo: true, repeat: 1, ease: 'power2.out' }, tFree - 0.1);
  tl.to('#tile-credits', { borderColor: 'rgba(152,125,248,.6)', duration: 0.3 }, tFree - 0.1);
  const tHalf = at('half', 'half');
  const tThree = at('half', 'three');
  tl.to('#tile-half', { autoAlpha: 1, y: 0, duration: 0.7, ease: 'expo.out' }, tHalf - 0.3);
  gsap.set('#tile-half .month', { autoAlpha: 0, scale: 0.5, y: 20 });
  tl.to('#tile-half .month', { autoAlpha: 1, scale: 1, y: 0, duration: 0.45, ease: 'back.out(2.6)', stagger: 0.12 }, tThree - 0.08);
  tl.to('#tile-half', { borderColor: 'rgba(152,125,248,.6)', duration: 0.3 }, tThree);
  const tUp = at('upgrade', 'upgrade');
  const tThirty = at('upgrade', 'thirty');
  tl.to('#tile-days', { autoAlpha: 1, y: 0, duration: 0.7, ease: 'expo.out' }, tUp - 0.45);
  cursor.show(tUp - 0.4, 1780, 1050);
  cursor.move(tUp - 0.35, A.upgradeBtn.cx + 30, A.upgradeBtn.cy + 10, 0.4);
  cursor.click(tUp + 0.1);
  tl.to('#upgrade-btn', { scale: 0.92, duration: 0.07, yoyo: true, repeat: 1 }, tUp + 0.07);
  cursor.hide(tUp + 0.5);
  tl.to('#rt-fg', { strokeDashoffset: 0, duration: 1.0, ease: 'power2.out' }, tThirty - 0.12);
  tl.to('#tile-days', { borderColor: 'rgba(152,125,248,.6)', duration: 0.3 }, tThirty);
  frame(t11in, t11out, (t) => {
    const n = Math.floor(prog(t, tType, tType + 1.0) * CODE.length + 0.0001);
    $('#code-text').textContent = CODE.slice(0, n);
    const typing = t < tType + 1.05;
    $('#caret').style.opacity = t < tCopy + 0.1 && (typing || (t * 2.2) % 1 < 0.55) ? 1 : 0;
    const v = Math.round(250 * easeOut(prog(t, tTwo, tTwo + 0.9)));
    $('#credit-num').textContent = '$' + v;
  });

  // sound
  snd(t11in, 'whoosh', { dur: 0.7, f0: 300, fp: 2400, f1: 900, peakAt: 0.5, gain: -19 });
  for (let k = 0; k < CODE.length; k++) snd(tType + ((k + 1) / CODE.length) * 1.0 - 0.004, 'key', { gain: -20, pan: -0.4 + 0.6 * (k / (CODE.length - 1)) });
  snd(tCopy, 'click', { gain: -17, pan: pan(A.copyBtn.cx) });
  snd(tCopy + 0.08, 'chime', { notes: [5, 9], spacing: 0.07, decay: 1.0, gain: -18, pan: pan(A.copyBtn.cx) });
  snd(tCred - 0.12, 'swish', { dur: 0.6, f0: 600, fp: 2500, f1: 1400, gain: -25 });
  snd(tTwo - 0.25, 'swish', { dur: 0.45, gain: -24, pan: pan(420) });
  for (let k = 1; k <= 25; k++) snd(tTwo + 0.9 * (1 - Math.cbrt(1 - k / 25)), 'tick', { pitch: 1700 + 45 * k, gain: -27, pan: pan(420) });
  snd(tTwo + 0.92, 'coin', { gain: -19, pan: pan(420) });
  snd(tHalf - 0.3, 'swish', { dur: 0.45, gain: -24 });
  [0, 1, 2].forEach((k) => snd(tThree - 0.08 + k * 0.12, 'pop', { pitch: SOUND.note([0, 2, 4][k]), gain: -19, pan: pan(840 + k * 110) }));
  snd(tUp - 0.45, 'swish', { dur: 0.45, gain: -24, pan: pan(1500) });
  snd(tUp + 0.1, 'click', { gain: -17, pan: pan(A.upgradeBtn.cx) });
  snd(tUp + 0.14, 'levelUp', { gain: -19, pan: pan(A.upgradeBtn.cx) });
  for (let k = 1; k <= 30; k++) snd(tThirty - 0.12 + 1.0 * (1 - Math.sqrt(1 - k / 30)), 'tick', { pitch: 2400 + 25 * k, gain: -29, pan: pan(1500) });
  snd(tThirty + 0.9, 'marimba', { deg: 9, gain: -21, pan: pan(1500), decay: 0.8 });

  // =================================================== 12. link in the description
  const t12in = at('link') - 0.1;
  const t12out = at('team') - 0.05;
  shot('#s-link', t12in, t12out, { drift: 0 });
  gsap.set('#link-lockup', { autoAlpha: 0, y: -30 });
  tl.to('#link-lockup', { autoAlpha: 1, y: 0, duration: 0.7, ease: 'expo.out' }, t12in + 0.05);
  gsap.set('#desc', { autoAlpha: 0, y: 240, rotationX: 22, transformPerspective: 1800, transformOrigin: '50% 100%' });
  tl.to('#desc', { autoAlpha: 1, y: 0, rotationX: 0, duration: 0.9, ease: 'expo.out' }, t12in);
  const tFirst = at('link', 'first');
  const tBelow = at('link', 'below');
  gsap.set('#desc-link', { '--hl': 0 });
  gsap.set('#desc-link .num', { scale: 0 });
  tl.to('#desc-link', { '--hl': 1, backgroundColor: 'rgba(107,91,255,.24)', duration: 0.3 }, tFirst - 0.12);
  tl.to('#desc-link', { scale: 1.035, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out' }, tFirst - 0.1);
  tl.to('#desc-link .num', { scale: 1, duration: 0.45, ease: 'back.out(3)' }, tFirst - 0.1);
  cursor.show(tFirst - 0.55, 1560, 980);
  cursor.move(tFirst - 0.5, A.descGo.cx + 6, A.descGo.cy + 10, 0.55);
  cursor.click(tFirst + 0.35);
  tl.to('#desc-link .dl-go', { scale: 0.88, duration: 0.07, yoyo: true, repeat: 1 }, tFirst + 0.31);
  cursor.hide(tBelow - 0.2);
  gsap.set('#below', { autoAlpha: 0, y: -30 });
  tl.to('#below', { autoAlpha: 1, y: 0, duration: 0.5, ease: 'back.out(2)' }, tBelow - 0.2);
  frame(t12in, t12out, (t) => {
    const b = $('#below svg');
    b.style.transform = `translateY(${(Math.abs(Math.sin((t - tBelow) * 5.5)) * 16).toFixed(1)}px)`;
  });

  // sound
  snd(t12in, 'whoosh', { dur: 0.7, f0: 300, fp: 2200, f1: 900, gain: -20 });
  snd(tFirst - 0.12, 'sparkle', { dur: 0.5, n: 6, gain: -28 });
  snd(tFirst - 0.1, 'pop', { pitch: 880, gain: -19, pan: pan(478) });
  snd(tFirst + 0.35, 'click', { gain: -16, pan: pan(A.descGo.cx) });
  snd(tFirst + 0.38, 'swish', { dur: 0.35, gain: -24, pan: pan(A.descGo.cx), pan1: 0.9 });
  snd(tBelow - 0.2, 'pop', { pitch: 660, gain: -20 });
  snd(tBelow + 0.05, 'boop', { gain: -21 });

  // =================================================== 13. support Jerry and the team
  const t13in = at('team') - 0.05;
  const t13out = at('october') - 0.05;
  shot('#s-team', t13in, t13out, { drift: 0.03 });
  gsap.set('#team-photo', { autoAlpha: 0, scale: 0.5 });
  tl.to('#team-photo', { autoAlpha: 1, scale: 1, duration: 0.8, ease: 'back.out(1.6)' }, t13in + 0.05);
  const tFriend = at('team', 'friend');
  const tAmazing = at('team', 'amazing');
  gsap.set('#heart', { autoAlpha: 0, scale: 0, rotation: -20 });
  tl.to('#heart', { autoAlpha: 1, scale: 1, rotation: 12, duration: 0.55, ease: 'back.out(3)' }, tFriend - 0.08);
  gsap.set('#team-name', { autoAlpha: 0, y: 24 });
  tl.to('#team-name', { autoAlpha: 1, y: 0, duration: 0.7, ease: 'expo.out' }, at('team', 'Jerry') - 0.12);
  gsap.set('#team-name .amp', { autoAlpha: 0 });
  tl.to('#team-name .amp', { autoAlpha: 1, duration: 0.4 }, tAmazing);
  gsap.set(members.map((m) => m.e), { autoAlpha: 0, scale: 0 });
  gsap.set(members.map((m) => m.line), { opacity: 0 });
  tl.to(members.map((m) => m.e), { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(2.2)', stagger: 0.045 }, tAmazing - 0.2);
  tl.to(members.map((m) => m.line), { opacity: 1, duration: 0.4, stagger: 0.045 }, tAmazing - 0.1);
  gsap.set('#team-lockup', { autoAlpha: 0, y: 20 });
  tl.to('#team-lockup', { autoAlpha: 1, y: 0, duration: 0.6, ease: 'expo.out' }, tAmazing + 0.15);
  glow(tAmazing, 1.35, 1.05);
  const teamRing = $('#team-photo .photo-ring');
  frame(t13in, t13out, (t) => {
    teamRing.style.transform = `rotate(${(t * 40).toFixed(2)}deg)`;
    const u = t - t13in;
    members.forEach((m) => {
      const a = m.a + u * 0.07;
      const x = 960 + Math.cos(a) * m.rx;
      const y = 480 + Math.sin(a) * m.ry + Math.sin(u * 1.6 + m.bob) * 8;
      m.e.style.left = x.toFixed(1) + 'px';
      m.e.style.top = y.toFixed(1) + 'px';
      m.line.setAttribute('x1', 960); m.line.setAttribute('y1', 480);
      m.line.setAttribute('x2', x.toFixed(1)); m.line.setAttribute('y2', y.toFixed(1));
    });
    const beat = Math.max(0, Math.sin((t - tFriend) * 7.5));
    $('#heart svg').style.transform = `scale(${(1 + 0.12 * Math.pow(beat, 6)).toFixed(3)})`;
    heartEls.forEach((h, i) => {
      const r = rng(i * 13 + 2);
      const t0 = tFriend + 0.2 + i * 0.22;
      const s = t - t0;
      if (s < 0 || s > 1.8) { h.style.opacity = 0; return; }
      const x = 960 + (i % 2 ? 1 : -1) * (230 + r() * 260); // keep clear of Jerry's photo
      const y = 820 - s * 260;
      h.style.left = (x + Math.sin(s * 4 + i) * 20).toFixed(1) + 'px';
      h.style.top = y.toFixed(1) + 'px';
      h.style.opacity = (Math.sin(Math.PI * s / 1.8) * 0.85).toFixed(3);
    });
  });

  // sound
  snd(t13in + 0.05, 'pop', { pitch: 440, gain: -18 });
  snd(tFriend - 0.08, 'pop', { pitch: 880, gain: -18, pan: pan(1085) });
  for (let tt = tFriend + Math.PI / 2 / 7.5; tt < t13out - 0.2; tt += (2 * Math.PI) / 7.5) snd(tt - 0.03, 'heartbeat', { gain: -17 });
  snd(at('team', 'Jerry') - 0.12, 'swish', { dur: 0.4, gain: -25 });
  members.forEach((m, k) => snd(tAmazing - 0.17 + k * 0.045, 'pop', { pitch: SOUND.note(k), gain: -23, pan: pan(960 + Math.cos(m.a) * m.rx) }));
  snd(tAmazing + 0.05, 'chime', { notes: [0, 4, 7, 9, 11], spacing: 0.06, decay: 1.6, gain: -21 });
  snd(tAmazing + 0.15, 'swish', { dur: 0.4, gain: -26 });

  // =================================================== 14. the whole October month
  const t14in = at('october') - 0.1;
  const t14out = at('back') - 0.1;
  shot('#s-october', t14in, t14out, { drift: 0.02 });
  gsap.set('#cal', { autoAlpha: 0, y: 70, scale: 0.95 });
  tl.to('#cal', { autoAlpha: 1, y: 0, scale: 1, duration: 0.8, ease: 'expo.out' }, t14in);
  gsap.set('#cal-code', { autoAlpha: 0, scale: 0.6, rotation: -8 });
  tl.to('#cal-code', { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.55, ease: 'back.out(2.4)' }, t14in + 0.4);
  const tWhole = at('october', 'whole');
  const fillStart = tWhole - 0.75;
  dayFills.forEach((d, i) => {
    const t0 = fillStart + i * 0.036;
    const fill = d.querySelector('.fill');
    gsap.set(fill, { opacity: 0 });
    tl.to(fill, { opacity: 1, duration: 0.3, ease: 'power1.out' }, t0);
    tl.to(d, { color: '#ffffff', scale: 1.08, duration: 0.14, ease: 'power2.out' }, t0);
    tl.to(d, { scale: 1, duration: 0.3, ease: 'power2.out' }, t0 + 0.14);
  });
  const tOct = at('october', 'October');
  tl.to('#cal-month', { scale: 1.08, duration: 0.18, yoyo: true, repeat: 1, transformOrigin: '0% 50%', ease: 'power2.out' }, tOct - 0.08);
  tl.to('#cal', { borderColor: 'rgba(152,125,248,.55)', duration: 0.4 }, tOct);
  glow(tOct, 1.3, 1.0);

  // sound
  snd(t14in, 'whoosh', { dur: 0.6, gain: -20 });
  snd(t14in + 0.4, 'pop', { pitch: 740, gain: -20, pan: pan(1230) });
  dayFills.forEach((d, i) => {
    const day = i + 1, col = (day + 2) % 7, row = Math.floor((day + 2) / 7);
    snd(fillStart + i * 0.036, 'marimba', { deg: row + col, gain: -23, pan: (col - 3) * 0.15, decay: 0.3 });
  });
  snd(tOct - 0.08, 'sparkle', { dur: 0.7, n: 10, gain: -25 });

  // =================================================== 15. back to the video
  const t15in = at('back') - 0.15;
  const tBack = at('back', 'back');
  shot('#s-outro', t15in, DUR + 1, { drift: 0, fadeIn: 0.25 });
  gsap.set('#end-lockup', { autoAlpha: 0, scale: 0.9 });
  gsap.set('#end-row', { autoAlpha: 0, y: 30 });
  tl.to('#end-lockup', { autoAlpha: 1, scale: 1, duration: 0.6, ease: 'expo.out' }, t15in);
  tl.to('#end-row', { autoAlpha: 1, y: 0, duration: 0.6, ease: 'expo.out' }, t15in + 0.12);
  tl.to(['#end-lockup', '#end-row'], { autoAlpha: 0, scale: 0.92, duration: 0.3, ease: 'power2.in' }, tBack - 0.15);
  gsap.set('#play-btn', { autoAlpha: 0, scale: 0.3 });
  tl.to('#play-btn', { autoAlpha: 1, scale: 1, duration: 0.55, ease: 'back.out(2.2)' }, tBack + 0.05);
  ripple('#play-btn .ripple', tBack + 0.12);
  const P15 = { p: 0.93 };
  gsap.set('#progress-b', { autoAlpha: 0, y: 40 });
  tl.to('#progress-b', { autoAlpha: 1, y: 0, duration: 0.5, ease: 'expo.out' }, tBack + 0.05);
  const tRewind = tBack + 0.3;
  tl.to(P15, { p: 0.36, duration: 0.7, ease: 'expo.inOut' }, tRewind);
  tl.to(G, { grid: 0, duration: 0.9, ease: 'expo.inOut' }, tRewind - 0.05);
  tl.to(P15, { p: 0.38, duration: 0.8, ease: 'none' }, tRewind + 0.72);
  const tIris = DUR - 0.85;
  gsap.set('#iris', { width: 4200, height: 4200, xPercent: -50, yPercent: -50, opacity: 0 });
  tl.set('#iris', { opacity: 1 }, tIris);
  tl.to('#iris', { width: 0, height: 0, duration: 0.55, ease: 'power3.in' }, tIris);
  tl.to('#blackout', { opacity: 1, duration: 0.05 }, tIris + 0.52);
  frame(t15in, DUR, () => {
    const pb = $('#progress-b');
    pb.querySelector('.played').style.width = P15.p * 100 + '%';
    pb.querySelector('.knob').style.left = P15.p * 100 + '%';
  });

  // sound
  snd(t15in, 'sting', { variant: 'end', gain: -1 });
  snd(tBack - 0.15, 'swish', { dur: 0.35, gain: -23 });
  snd(tBack + 0.05, 'pop', { pitch: 440, gain: -17 });
  snd(tBack + 0.07, 'click', { gain: -18 });
  snd(tRewind - 0.05, 'rewind', { dur: 0.75, gain: -18 });
  snd(tIris, 'whoosh', { dur: 0.55, f0: 3000, fp: 1400, f1: 200, peakAt: 0.9, gain: -19, body: 0.5 });
  snd(tIris + 0.52, 'thud', { gain: -15 });

  // ambience bed: swells on the hero moments, muffled during the flashback
  SOUND.ambience({
    start: 0.1, fadeOut: tIris, muffle: [t5in, t6in], bright: t6in, gain: -31,
    swells: [[tLI, 3], [tSwap + 0.4, 2.5], [t6in, 4], [tPers + 0.1, 2], [tTop, 2], [tCopy, 2], [tAmazing, 3], [tOct, 2], [t15in, 3]],
  });

  // ============================================================ global layers
  const streakBursts = [{ t0: tFut - 0.12, dir: -1 }, { t0: tRewind - 0.05, dir: 1 }];
  const glowA = $('#glow-a'), glowB = $('#glow-b'), glowC = $('#glow-c');
  const grid = $('#grid');
  frame(0, DUR + 1, (t) => {
    const k = G.glow;
    glowA.style.transform = `translate(${(470 + 260 * Math.sin(t * 0.21)).toFixed(1)}px, ${(320 + 170 * Math.cos(t * 0.17)).toFixed(1)}px)`;
    glowB.style.transform = `translate(${(1450 + 240 * Math.sin(t * 0.19 + 2)).toFixed(1)}px, ${(720 + 150 * Math.cos(t * 0.23 + 1)).toFixed(1)}px)`;
    glowC.style.transform = `translate(${(980 + 320 * Math.sin(t * 0.13 + 4)).toFixed(1)}px, ${(930 + 110 * Math.cos(t * 0.2 + 3)).toFixed(1)}px)`;
    glowA.style.opacity = glowB.style.opacity = glowC.style.opacity = Math.min(1.6, k).toFixed(3);
    grid.style.backgroundPosition = `${(-t * 9 + G.grid).toFixed(1)}px ${(-t * 4).toFixed(1)}px`;
    // fast-forward / rewind streaks
    let burst = null;
    for (const s of streakBursts) if (t >= s.t0 && t <= s.t0 + 1.0) burst = s;
    streakEls.forEach((b, i) => {
      if (!burst) { b.style.opacity = 0; return; }
      const rr = rng(i * 131 + 7);
      const y = 70 + rr() * 940, len = 200 + rr() * 560, spd = 2600 + rr() * 2800, delay = rr() * 0.3;
      const u = t - burst.t0 - delay;
      if (u < 0) { b.style.opacity = 0; return; }
      const x = burst.dir < 0 ? 2000 - u * spd : -len - 100 + u * spd;
      b.style.width = len.toFixed(0) + 'px';
      b.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)` + (burst.dir < 0 ? ' scaleX(-1)' : '');
      b.style.opacity = ((0.2 + 0.55 * rr()) * (1 - clamp(u / 0.65))).toFixed(3);
    });
  });

  // ================================================================= export
  tl.set({}, {}, DUR); // make sure the timeline spans the whole piece
  window.MASTER = tl;
  window.DURATION = DUR;
  window.SEEK = function (t) {
    t = clamp(t, 0, DUR);
    tl.totalTime(t, true);
    for (const f of FR) f.fn(clamp(t, f.a, f.b));
  };
};
