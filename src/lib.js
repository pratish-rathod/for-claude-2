// Small helpers shared by the scenes. Everything is deterministic: the picture
// at time t depends only on t, so any frame can be rendered in any order.
(function () {
  const L = (window.L = {});

  // ---- seeded random ----
  L.rng = function (seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // ---- math ----
  L.clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  L.lerp = (a, b, t) => a + (b - a) * t;
  L.prog = (t, t0, t1) => L.clamp((t - t0) / (t1 - t0));
  L.smooth = (x) => x * x * (3 - 2 * x);
  L.easeOut = (x) => 1 - Math.pow(1 - x, 3);
  L.easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  // ---- voiceover cues ----
  L.cues = {};
  window.CUES.forEach((c) => (L.cues[c.id] = c));
  // at('route', 'tables') -> absolute seconds of that word; at('route') -> line start.
  L.at = function (id, mark) {
    const c = L.cues[id];
    if (!c) throw new Error('Unknown cue ' + id);
    if (mark === undefined) return c.start;
    if (mark === 'end') return c.end;
    const f = typeof mark === 'number' ? mark : c.marks[mark];
    if (f === undefined) throw new Error('Unknown mark ' + id + '.' + mark);
    return c.start + f * (c.end - c.start);
  };
  L.duration = () => window.CUES[window.CUES.length - 1].end + window.TAIL;

  // ---- icons (Lucide) ----
  L.icon = (name, cls = '') =>
    `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${window.ICONS[name]}</svg>`;

  // ---- LlamaIndex llama mark ----
  let gradId = 0;
  const STOPS = [
    [0, '#3eb4fb'], [0.22, '#4590fc'], [0.36, '#5475fd'], [0.5, '#987df8'],
    [0.64, '#d987f3'], [0.78, '#fe8cd2'], [0.9, '#ff8973'], [1, '#ff8722'],
  ];
  L.llamaSVG = function (size) {
    const id = 'llama-g' + gradId++;
    const stops = STOPS.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('');
    return (
      `<svg width="${size}" height="${size}" viewBox="96 96 1728 1728">` +
      `<defs><linearGradient id="${id}" x1="420" y1="300" x2="1500" y2="1640" gradientUnits="userSpaceOnUse">${stops}</linearGradient></defs>` +
      `<rect x="96" y="96" width="1728" height="1728" rx="360" fill="#000" stroke="rgba(255,255,255,.16)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>` +
      `<path d="${window.LLAMA_PATH}" fill="url(#${id})"/></svg>`
    );
  };

  // Replace <i data-icon> and <span class="llama" data-size> placeholders.
  L.hydrate = function (root) {
    root.querySelectorAll('i[data-icon]').forEach((i) => {
      const tmp = document.createElement('div');
      tmp.innerHTML = L.icon(i.dataset.icon, i.className);
      const svg = tmp.firstChild;
      if (i.id) svg.id = i.id;
      i.replaceWith(svg);
    });
    root.querySelectorAll('.llama[data-size]').forEach((s) => {
      s.innerHTML = L.llamaSVG(+s.dataset.size);
    });
  };

  // Split an element's text into per-character spans.
  L.splitChars = function (el) {
    const text = el.textContent;
    el.textContent = '';
    return [...text].map((ch) => {
      const s = document.createElement('span');
      s.className = 'ch';
      s.textContent = ch === ' ' ? ' ' : ch;
      el.appendChild(s);
      return s;
    });
  };

  // Fill a .wave container with bars.
  L.makeWave = function (el) {
    const n = +el.dataset.bars || 30;
    const bars = [];
    for (let i = 0; i < n; i++) {
      const b = document.createElement('b');
      b.style.backgroundPosition = `${-i * 13}px 0`;
      el.appendChild(b);
      bars.push(b);
    }
    return bars;
  };

  // Animate waveform bars procedurally. level(t) in 0..1 scales loudness.
  L.driveWave = function (bars, t, level, seed = 1) {
    const r = L.rng(seed);
    for (let i = 0; i < bars.length; i++) {
      const f1 = 5 + r() * 9, f2 = 2 + r() * 4, ph = r() * 6.28;
      const env = 0.35 + 0.65 * Math.abs(Math.sin(t * f2 + ph));
      const v = 0.12 + 0.88 * level * env * (0.55 + 0.45 * Math.abs(Math.sin(t * f1 + i * 0.7)));
      bars[i].style.transform = `scaleY(${v.toFixed(3)})`;
    }
  };

  // Place an element's centre at (x, y) in stage pixels.
  L.place = (el, x, y) => {
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  };

  // Stage-space rectangle of an element (ignores the preview scale).
  L.rect = function (el) {
    const stage = document.getElementById('stage');
    const s = stage.getBoundingClientRect();
    const k = s.width / 1920;
    const r = el.getBoundingClientRect();
    return {
      x: (r.left - s.left) / k, y: (r.top - s.top) / k,
      w: r.width / k, h: r.height / k,
      cx: (r.left - s.left + r.width / 2) / k, cy: (r.top - s.top + r.height / 2) / k,
    };
  };
})();
