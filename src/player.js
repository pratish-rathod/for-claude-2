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
    const chkSound = document.getElementById('chk-sound');
    const audio = new Audio();
    let hasAudio = false;
    // sound design (rendered once on first play, then played in sync)
    let ac = null, sdBuf = null, sdSrc = null, sdT0 = 0, sdCtx0 = 0, sdLoading = null;
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
    function ensureSound() {
      if (sdBuf) return Promise.resolve();
      if (!sdLoading) {
        btn.textContent = 'Rendering sound...';
        btn.disabled = true;
        sdLoading = window.SOUND.render({ stem: 'mix' })
          .then((b) => { sdBuf = b; })
          .catch((e) => { console.error(e); chkSound.checked = false; })
          .finally(() => { btn.disabled = false; btn.textContent = playing ? 'Pause' : 'Play'; });
      }
      return sdLoading;
    }
    function stopSound() {
      if (!sdSrc) return;
      try { sdSrc.stop(); } catch (e) { /* already stopped */ }
      sdSrc.disconnect();
      sdSrc = null;
    }
    function startSound() {
      stopSound();
      if (!chkSound.checked || !sdBuf || !ac) return;
      if (ac.state === 'suspended') ac.resume();
      sdSrc = ac.createBufferSource();
      sdSrc.buffer = sdBuf;
      sdSrc.connect(ac.destination);
      sdCtx0 = ac.currentTime + 0.03;
      sdT0 = t;
      sdSrc.start(sdCtx0, t);
    }
    function setPlaying(p) {
      playing = p;
      btn.textContent = p ? 'Pause' : 'Play';
      if (p) startSound(); else stopSound();
      if (hasAudio) {
        if (p) { audio.currentTime = t; audio.play(); } else audio.pause();
      }
      last = performance.now();
    }
    function loop(now) {
      if (playing) {
        if (sdSrc) t = sdT0 + Math.max(0, ac.currentTime - sdCtx0);
        else t = hasAudio ? audio.currentTime : t + (now - last) / 1000;
        last = now;
        if (t >= DUR) { t = DUR; setPlaying(false); }
        draw();
      }
      requestAnimationFrame(loop);
    }

    btn.onclick = async () => {
      if (t >= DUR) t = 0;
      if (!playing && chkSound.checked) {
        ac = ac || new AudioContext(); // created inside the click so the browser allows playback
        await ensureSound();
      }
      setPlaying(!playing);
    };
    scrub.oninput = () => {
      t = (scrub.value / 1000) * DUR;
      if (hasAudio) audio.currentTime = t;
      if (playing) startSound();
      draw();
    };
    chk.onchange = draw;
    chkSound.onchange = () => {
      if (!chkSound.checked) stopSound();
      else if (playing) { ac = ac || new AudioContext(); ensureSound().then(() => playing && startSound()); }
    };
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
    if (chkSound.checked) setTimeout(() => ensureSound().then(() => { if (!playing) btn.textContent = 'Play'; }), 300);
  }
})();
