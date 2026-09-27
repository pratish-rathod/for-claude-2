// Preview player + render hooks.
//   index.html            -> preview with scrubber, captions and optional voiceover
//   index.html?render     -> bare 1920x1080 stage driven by window.__seek(t) (used by tools/render.mjs)
//   index.html?t=12.5     -> open the preview at a given time
(function () {
  const params = new URLSearchParams(location.search);
  const RENDER = params.has('render');
  const stage = document.getElementById('stage');
  if (RENDER) document.body.classList.add('render');

  function fit() {
    if (RENDER) { stage.style.transform = ''; return; }
    const vw = innerWidth, vh = innerHeight - 64;
    const k = Math.min(vw / 1920, vh / 1080);
    stage.style.transform = `translate(${(vw - 1920 * k) / 2}px, ${(vh - 1080 * k) / 2}px) scale(${k})`;
  }

  const images = Array.from(document.images).map((img) => (img.decode ? img.decode().catch(() => {}) : Promise.resolve()));
  const fonts = [
    document.fonts.load('700 100px Inter'), document.fonts.load('500 30px Inter'), document.fonts.load('800 80px Inter'),
    document.fonts.load('700 40px "JetBrains Mono"'), document.fonts.load('500 20px "JetBrains Mono"'),
  ];

  window.__ready = false;
  Promise.all([...fonts, ...images]).then(() => document.fonts.ready).then(() => {
    window.buildScenes();
    window.__duration = window.DURATION;
    window.__seek = (t) => window.SEEK(t);
    fit();
    if (RENDER) { window.SEEK(0); window.__ready = true; return; }
    initPreview();
    window.__ready = true;
  });

  function initPreview() {
    const DUR = window.DURATION;
    const scrub = document.getElementById('scrub');
    const clock = document.getElementById('clock');
    const btn = document.getElementById('btn-play');
    const caption = document.getElementById('caption');
    const chk = document.getElementById('chk-captions');
    const audio = new Audio();
    let hasAudio = false;
    let t = Math.min(DUR, +params.get('t') || 0);
    let playing = false;
    let last = performance.now();

    function lineAt(time) {
      for (const c of window.CUES) if (time >= c.start - 0.05 && time <= c.end + 0.15) return c.text;
      return '';
    }
    function draw() {
      window.SEEK(t);
      scrub.value = Math.round((t / DUR) * 1000);
      clock.textContent = t.toFixed(2) + 's';
      caption.textContent = chk.checked ? lineAt(t) : '';
    }
    function setPlaying(p) {
      playing = p;
      btn.textContent = p ? 'Pause' : 'Play';
      if (hasAudio) {
        if (p) { audio.currentTime = t; audio.play(); } else audio.pause();
      }
      last = performance.now();
    }
    function loop(now) {
      if (playing) {
        t = hasAudio ? audio.currentTime : t + (now - last) / 1000;
        last = now;
        if (t >= DUR) { t = DUR; setPlaying(false); }
        draw();
      }
      requestAnimationFrame(loop);
    }

    btn.onclick = () => { if (t >= DUR) t = 0; setPlaying(!playing); };
    scrub.oninput = () => { t = (scrub.value / 1000) * DUR; if (hasAudio) audio.currentTime = t; draw(); };
    chk.onchange = draw;
    document.getElementById('vo-file').onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      audio.src = URL.createObjectURL(f);
      hasAudio = true;
      audio.currentTime = t;
    };
    addEventListener('keydown', (e) => {
      if (e.code === 'Space') { e.preventDefault(); btn.onclick(); }
      if (e.code === 'ArrowRight') { t = Math.min(DUR, t + (e.shiftKey ? 1 : 1 / 30)); draw(); }
      if (e.code === 'ArrowLeft') { t = Math.max(0, t - (e.shiftKey ? 1 : 1 / 30)); draw(); }
    });
    addEventListener('resize', fit);
    draw();
    requestAnimationFrame(loop);
  }
})();
