// Procedural sound design for the sponsor segment.
//
// Every sound is synthesized with the Web Audio API (oscillators, seeded
// noise, filters and a generated convolution reverb); there are no samples.
// scenes.js schedules each sound with SOUND.add(time, type, options) right
// next to the animation beat it belongs to, so retiming src/cues.js moves the
// sound with the picture.
//
// SOUND.render({ stem }) renders offline (deterministic). It is used by the
// preview player and by tools/sound.mjs / tools/render.mjs for export.
//   stem: 'mix' (default) | 'sfx' | 'ambience'
(function () {
  const S = (window.SOUND = { events: [], amb: null });
  S.add = (t, type, o = {}) => S.events.push(Object.assign({}, o, { t, type }));
  S.ambience = (cfg) => (S.amb = cfg);

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smooth = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  const dB = (x) => Math.pow(10, x / 20);
  S.panX = (x) => clamp(((x - 960) / 960) * 0.9, -0.85, 0.85);

  // Tonal sounds use D major pentatonic (degree 0 = D5) so they never clash.
  const PENTA = [587.33, 659.26, 739.99, 880.0, 987.77];
  const note = (d) => PENTA[((d % 5) + 5) % 5] * Math.pow(2, Math.floor(d / 5));
  S.note = note;

  // Output trim per patch so that `gain` is roughly the patch's peak level in
  // dBFS (measured with SOUND.measure(type); see tools/sound.mjs --calibrate).
const NORM = {
    pop: 2.9, tick: 2.9, click: 9.7, whoosh: 6.3, swish: 13.5, impact: -0.4, thud: 3.2, rattle: 10.1,
    sparkle: -5.1, chime: -3.9, marimba: 1.5, plink: 2, riser: 9.4, reverse: 6.1, scratch: 6.6, ffwd: 1.4,
    rewind: 3.8, key: 6.3, chatter: 4, error: 1.4, glitch: 1.5, tickTock: 15.2, powerUp: -4, surge: -0.7,
    laser: 1.4, steam: 10.3, grumble: 0.8, windup: 4, zip: 8.2, lock: 3, coin: -2.7, heartbeat: 2.7,
    paper: 13.9, recBeep: 3, scan: 9, confetti: 3.1, boop: 3.2, hum: -3.4, vinyl: 18.1,
  };
  // Master trim: puts the mix around -24 LUFS integrated with peaks near
  // -4 dBFS, so it sits under a typical -16 LUFS voiceover.
  const MASTER_DB = 4;

  // Default options per patch; event options override them.
  const DEF = {
    pop: { gain: -18, pitch: 520, send: 0.12 },
    tick: { gain: -22, pitch: 2600, send: 0.08 },
    click: { gain: -16, send: 0.05 },
    whoosh: { gain: -18, dur: 0.6, f0: 280, fp: 2200, f1: 800, peakAt: 0.6, q: 0.9, body: 0.6, air: 0.15, send: 0.18 },
    swish: { gain: -22, dur: 0.3, f0: 1200, fp: 5200, f1: 2400, peakAt: 0.5, q: 1.1, body: 0, air: 0.1, send: 0.12 },
    impact: { gain: -8, size: 1, send: 0.3 },
    thud: { gain: -12, send: 0.1 },
    rattle: { gain: -16, n: 6, send: 0.08 },
    sparkle: { gain: -22, dur: 0.9, n: 16, spread: 0.7, send: 0.5 },
    chime: { gain: -16, notes: [0, 2, 3, 5], spacing: 0.06, decay: 1.4, send: 0.4 },
    marimba: { gain: -20, deg: 0, decay: 0.45, send: 0.18 },
    plink: { gain: -30, deg: 10, send: 0.25 },
    riser: { gain: -20, dur: 1.0, send: 0.3 },
    reverse: { gain: -20, dur: 0.6, send: 0.35 },
    scratch: { gain: -14, send: 0.08 },
    ffwd: { gain: -18, dur: 0.8, send: 0.12 },
    rewind: { gain: -19, dur: 0.7, send: 0.12 },
    key: { gain: -20, send: 0.05 },
    chatter: { gain: -24, dur: 1.2, rate: 34, send: 0.05 },
    error: { gain: -18, pitch: 392, send: 0.1 },
    glitch: { gain: -21, dur: 0.22, send: 0.05 },
    tickTock: { gain: -20, tock: false, send: 0.12 },
    powerUp: { gain: -18, dur: 0.9, send: 0.25 },
    hum: { gain: -28, send: 0.08 },
    surge: { gain: -16, send: 0.25 },
    laser: { gain: -12, send: 0.2 },
    steam: { gain: -22, send: 0.08 },
    grumble: { gain: -20, send: 0.08 },
    windup: { gain: -22, dur: 0.3, send: 0.1 },
    zip: { gain: -24, dur: 0.6, f0: 500, f1: 1400, send: 0.2 },
    lock: { gain: -20, send: 0.1 },
    coin: { gain: -18, send: 0.25 },
    heartbeat: { gain: -16, send: 0.05 },
    paper: { gain: -20, dur: 0.35, send: 0.08 },
    recBeep: { gain: -24, send: 0.1 },
    scan: { gain: -22, dur: 1.0, send: 0.2 },
    confetti: { gain: -22, dur: 1.4, send: 0.2 },
    boop: { gain: -20, pitch: 740, send: 0.15 },
    vinyl: { gain: -30, send: 0 },
    // composites (gain is an offset applied to their layers)
    sting: { gain: 0, variant: 'index' },
    levelUp: { gain: -18 },
    crown: { gain: -16 },
    flip: { gain: -22 },
  };

  // ------------------------------------------------------------------ curves
  function expCurve(a, b, n = 64) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = a * Math.pow(b / a, i / (n - 1));
    return c;
  }
  function sweep3(a, p, b, pk, n = 96) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      c[i] = x < pk ? a * Math.pow(p / a, x / pk) : p * Math.pow(b / p, (x - pk) / (1 - pk));
    }
    return c;
  }
  // smooth rise to 1 at pk, then exponential fall; ends at 0
  function bellCurve(pk = 0.6, k = 4.5, n = 128) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      let v = x < pk ? Math.pow(Math.sin((Math.PI / 2) * (x / pk)), 2) : Math.exp((-k * (x - pk)) / (1 - pk));
      if (x > 0.94) v *= (1 - x) / 0.06;
      c[i] = v;
    }
    return c;
  }
  // power-law attack to pk, exponential release; ends at 0
  function arCurve(pk = 0.5, rise = 1.6, k = 5, n = 128) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      let v = x < pk ? Math.pow(x / pk, rise) : Math.exp((-k * (x - pk)) / (1 - pk));
      if (x > 0.95) v *= (1 - x) / 0.05;
      c[i] = v;
    }
    return c;
  }
  function riseCurve(p = 3, n = 128) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) c[i] = Math.pow(i / (n - 1), p);
    return c;
  }
  function trapezoid(a = 0.1, b = 0.85, n = 64) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);
      c[i] = x < a ? x / a : x > b ? Math.max(0, (1 - x) / (1 - b)) : 1;
    }
    return c;
  }
  function tanhCurve(k = 1.5, n = 1024) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    return c;
  }
  function crushCurve(levels = 6, n = 1024) {
    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      c[i] = Math.round(x * levels) / levels;
    }
    return c;
  }

  // ------------------------------------------------------------------ engine
  function noiseBuffer(ctx, seconds, kind, rng) {
    const sr = ctx.sampleRate, n = Math.floor(seconds * sr), X = 2048;
    const raw = new Float32Array(n + X);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < n + X; i++) {
      const w = rng() * 2 - 1;
      if (kind === 'white') raw[i] = w;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        raw[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
      } else { last = (last + 0.02 * w) / 1.02; raw[i] = last; }
    }
    // seamless loop: crossfade the overshoot back into the head
    const buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = raw[i];
    for (let j = 0; j < X; j++) d[j] = raw[j] * (j / X) + raw[n + j] * (1 - j / X);
    let e = 0, mean = 0;
    for (let i = 0; i < n; i++) mean += d[i];
    mean /= n;
    for (let i = 0; i < n; i++) { d[i] -= mean; e += d[i] * d[i]; }
    const k = 0.3 / Math.sqrt(e / n);
    for (let i = 0; i < n; i++) d[i] *= k;
    return buf;
  }

  function impulse(ctx, seconds, rng) {
    const sr = ctx.sampleRate, n = Math.floor(seconds * sr), pre = Math.floor(0.015 * sr);
    const buf = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let y = 0, e = 0;
      for (let i = pre; i < n; i++) {
        const t = (i - pre) / sr;
        const a = 0.1 + 0.8 * Math.exp(-t * 2.2); // tail gets darker
        y += a * (rng() * 2 - 1 - y);
        const v = y * Math.exp((-6.9 * t) / seconds) * Math.min(1, t / 0.004);
        d[i] = v;
        e += v * v;
      }
      const k = 1 / Math.sqrt(e);
      for (let i = 0; i < n; i++) d[i] *= k;
    }
    return buf;
  }

  function engine(ctx, seed = 0) {
    const nr = L.rng(90210);
    const E = { ctx, sr: ctx.sampleRate, rng: L.rng(20260927 + seed * 7919) };
    E.white = noiseBuffer(ctx, 3, 'white', nr);
    E.pink = noiseBuffer(ctx, 3, 'pink', nr);
    E.brown = noiseBuffer(ctx, 3, 'brown', nr);
    E.master = ctx.createGain();
    E.master.connect(ctx.destination);
    // shared reverb (a medium, slightly dark room)
    E.rev = ctx.createGain();
    const conv = ctx.createConvolver();
    conv.normalize = false;
    conv.buffer = impulse(ctx, 2.2, nr);
    const rhp = ctx.createBiquadFilter();
    rhp.type = 'highpass';
    rhp.frequency.value = 220;
    const ret = ctx.createGain();
    ret.gain.value = 0.5;
    E.rev.connect(rhp).connect(conv).connect(ret).connect(E.master);
    // lo-fi bus for the 2023 flashback: band-limited with a little saturation
    E.lofi = ctx.createGain();
    const lh = ctx.createBiquadFilter(); lh.type = 'highpass'; lh.frequency.value = 320;
    const ll = ctx.createBiquadFilter(); ll.type = 'lowpass'; ll.frequency.value = 3600;
    const sat = ctx.createWaveShaper(); sat.curve = tanhCurve(2.2);
    E.lofi.connect(lh).connect(ll).connect(sat).connect(E.master);
    return E;
  }

  function out(E, o, type) {
    const c = E.ctx;
    const g = c.createGain();
    g.gain.value = dB((o.gain ?? -18) + (E.noNorm ? 0 : NORM[type] || 0));
    const p = c.createStereoPanner();
    p.pan.value = clamp(o.pan || 0, -1, 1);
    if (o.pan1 !== undefined && o.pan1 !== null) {
      p.pan.setValueAtTime(p.pan.value, o.t);
      p.pan.linearRampToValueAtTime(clamp(o.pan1, -1, 1), o.t + (o.dur || 0.5));
    }
    g.connect(p);
    p.connect(o.lofi ? E.lofi : E.master);
    const send = o.send ?? 0.15;
    if (send > 0) {
      const s = c.createGain();
      s.gain.value = send;
      p.connect(s);
      s.connect(E.rev);
    }
    return g;
  }
  function osc(E, type, f, t, stop) {
    const o = E.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.start(t);
    o.stop(Math.max(stop, t + 0.01));
    return o;
  }
  function noise(E, kind, t, stop, rng = E.rng) {
    const s = E.ctx.createBufferSource();
    s.buffer = E[kind];
    s.loop = true;
    s.start(t, rng() * (s.buffer.duration - 0.05));
    s.stop(Math.max(stop, t + 0.01));
    return s;
  }
  function filt(E, type, f, Q) {
    const b = E.ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    if (Q !== undefined) b.Q.value = Q;
    return b;
  }
  // attack / (hold) / exponential decay envelope
  function env(E, t, a = 0.002, d = 0.2, peak = 1, h = 0) {
    const g = E.ctx.createGain(), p = g.gain;
    p.value = 0;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + a);
    if (h > 0) p.setValueAtTime(peak, t + a + h);
    p.exponentialRampToValueAtTime(peak * 0.0005, t + a + h + d);
    p.linearRampToValueAtTime(0, t + a + h + d + 0.01);
    return g;
  }
  // gain following a curve over [t, t + dur], then to silence
  function cgain(E, t, dur, curve, scale = 1) {
    const g = E.ctx.createGain();
    g.gain.value = 0;
    const c = new Float32Array(curve.length);
    for (let i = 0; i < c.length; i++) c[i] = curve[i] * scale;
    g.gain.setValueCurveAtTime(c, t, dur);
    g.gain.linearRampToValueAtTime(0, t + dur + 0.012);
    return g;
  }
  function play(E, type, ev) {
    const fn = P[type];
    if (!fn) throw new Error('Unknown sound: ' + type);
    fn(E, Object.assign({}, DEF[type], ev), type);
  }

  // ----------------------------------------------------------------- patches
  const P = {};

  // bubbly UI pop: pitch-dropping sine + a tiny click
  P.pop = (E, o) => {
    const t = o.t, f = o.pitch, bus = out(E, o, 'pop');
    const s = osc(E, 'sine', f * 1.9, t, t + 0.25);
    s.frequency.setValueCurveAtTime(expCurve(f * 1.9, f, 16), t, 0.035);
    s.connect(env(E, t, 0.002, 0.12)).connect(bus);
    noise(E, 'white', t, t + 0.04).connect(filt(E, 'highpass', 2500)).connect(env(E, t, 0.0008, 0.015, 0.25)).connect(bus);
  };

  // small UI tick
  P.tick = (E, o) => {
    const t = o.t, f = o.pitch, bus = out(E, o, 'tick');
    osc(E, 'sine', f, t, t + 0.08).connect(env(E, t, 0.0008, 0.045)).connect(bus);
    noise(E, 'white', t, t + 0.03).connect(filt(E, 'bandpass', Math.min(f * 1.6, 12000), 1.2)).connect(env(E, t, 0.0005, 0.012, 0.8)).connect(bus);
  };

  // mouse click: press + release
  P.click = (E, o) => {
    const bus = out(E, o, 'click');
    const hit = (t, k, fc) => {
      noise(E, 'white', t, t + 0.03).connect(filt(E, 'bandpass', fc, 1.4)).connect(env(E, t, 0.0005, 0.018, k)).connect(bus);
      osc(E, 'sine', fc * 0.55, t, t + 0.04).connect(env(E, t, 0.0005, 0.02, k * 0.35)).connect(bus);
    };
    hit(o.t, 1, 3600);
    hit(o.t + 0.075, 0.55, 4300);
  };

  // band-passed noise sweep (whoosh / swish)
  P.whoosh = (E, o, type = 'whoosh') => {
    const t = o.t, dur = o.dur, pk = o.peakAt, bus = out(E, o, type);
    const shape = bellCurve(pk, 4.5);
    const bp = filt(E, 'bandpass', o.f0, o.q);
    bp.frequency.setValueCurveAtTime(sweep3(o.f0, o.fp, o.f1, pk), t, dur);
    noise(E, 'pink', t, t + dur + 0.05).connect(bp).connect(cgain(E, t, dur, shape)).connect(bus);
    if (o.body > 0) noise(E, 'brown', t, t + dur + 0.05).connect(filt(E, 'lowpass', 320)).connect(cgain(E, t, dur, shape, o.body)).connect(bus);
    if (o.air > 0) noise(E, 'white', t, t + dur + 0.05).connect(filt(E, 'highpass', Math.max(3000, o.fp * 1.4))).connect(cgain(E, t, dur, shape, o.air)).connect(bus);
  };
  P.swish = (E, o) => P.whoosh(E, o, 'swish');

  // cinematic hit: saturated sub drop + body + crack
  P.impact = (E, o) => {
    const t = o.t, k = o.size, bus = out(E, o, 'impact');
    const s = osc(E, 'sine', 70, t, t + 1.8 * k);
    s.frequency.setValueCurveAtTime(expCurve(70, 36, 32), t, 0.5);
    const sh = E.ctx.createWaveShaper();
    sh.curve = tanhCurve(1.8);
    sh.oversample = '2x';
    s.connect(sh).connect(env(E, t, 0.002, 1.4 * k)).connect(bus);
    const lp = filt(E, 'lowpass', 2600);
    lp.frequency.setValueCurveAtTime(expCurve(2600, 280, 32), t, 0.4);
    noise(E, 'pink', t, t + 0.7).connect(lp).connect(env(E, t, 0.001, 0.42 * k, 0.8)).connect(bus);
    noise(E, 'white', t, t + 0.12).connect(filt(E, 'highpass', 2800)).connect(env(E, t, 0.0005, 0.06, 0.35)).connect(bus);
  };

  // box landing: low knock + a small bounce
  P.thud = (E, o) => {
    const bus = out(E, o, 'thud');
    const knock = (t, k) => {
      const s = osc(E, 'sine', 120, t, t + 0.4);
      s.frequency.setValueCurveAtTime(expCurve(120, 58, 32), t, 0.14);
      s.connect(env(E, t, 0.0015, 0.28, k)).connect(bus);
      noise(E, 'pink', t, t + 0.15).connect(filt(E, 'bandpass', 420, 1.3)).connect(env(E, t, 0.001, 0.09, 0.6 * k)).connect(bus);
    };
    knock(o.t, 1);
    knock(o.t + 0.11, 0.3);
  };

  // cardboard lid rattle
  P.rattle = (E, o) => {
    const bus = out(E, o, 'rattle');
    let tt = o.t;
    for (let i = 0; i < o.n; i++) {
      const k = 1 - 0.55 * (i / o.n);
      noise(E, 'pink', tt, tt + 0.08).connect(filt(E, 'bandpass', 500 + E.rng() * 700, 2.5)).connect(env(E, tt, 0.001, 0.04, k)).connect(bus);
      osc(E, 'triangle', 170 + E.rng() * 110, tt, tt + 0.08).connect(env(E, tt, 0.001, 0.05, 0.35 * k)).connect(bus);
      tt += 0.042 + E.rng() * 0.035;
    }
  };

  // shimmer of tiny glassy pings
  P.sparkle = (E, o) => {
    const bus = out(E, o, 'sparkle');
    for (let i = 0; i < o.n; i++) {
      const tt = o.t + o.dur * Math.pow(E.rng(), 1.7);
      const f = note(5 + Math.floor(E.rng() * 10));
      const k = (0.35 + 0.65 * E.rng()) * (1 - 0.5 * ((tt - o.t) / o.dur));
      const p = E.ctx.createStereoPanner();
      p.pan.value = (E.rng() * 2 - 1) * o.spread;
      p.connect(bus);
      osc(E, 'sine', f, tt, tt + 0.6).connect(env(E, tt, 0.002, 0.18 + E.rng() * 0.25, k)).connect(p);
      osc(E, 'sine', f * 2.76, tt, tt + 0.2).connect(env(E, tt, 0.001, 0.06, k * 0.25)).connect(p);
    }
  };

  // bell arpeggio; notes are pentatonic degrees (or Hz if > 40)
  function bell(E, t, f, dec, bus, k) {
    [[1, 1, 1], [2.0, 0.28, 0.5], [2.76, 0.22, 0.35], [5.4, 0.08, 0.15]].forEach(([r, gk, dk]) => {
      if (f * r > 18000) return;
      osc(E, 'sine', f * r, t, t + dec * dk + 0.1).connect(env(E, t, 0.0025, dec * dk, k * gk)).connect(bus);
    });
  }
  P.chime = (E, o) => {
    const bus = out(E, o, 'chime');
    o.notes.forEach((d, i) => bell(E, o.t + i * o.spacing, d > 40 ? d : note(d), o.decay, bus, 1 - i * 0.07));
  };

  // soft mallet note
  function mallet(E, t, f, bus, k, dec) {
    [[1, 1, 1], [3.93, 0.22, 0.2], [9.2, 0.06, 0.07]].forEach(([r, gk, dk]) => {
      if (f * r > 18000) return;
      osc(E, 'sine', f * r, t, t + dec * dk + 0.05).connect(env(E, t, 0.0015, dec * dk, k * gk)).connect(bus);
    });
    noise(E, 'white', t, t + 0.02).connect(filt(E, 'bandpass', Math.min(f * 3, 9000), 1)).connect(env(E, t, 0.0005, 0.008, 0.15 * k)).connect(bus);
  }
  P.marimba = (E, o) => mallet(E, o.t, note(o.deg), out(E, o, 'marimba'), 1, o.decay);

  // tiny high ping (for particle rain)
  P.plink = (E, o) => {
    const t = o.t, f = note(o.deg), bus = out(E, o, 'plink');
    osc(E, 'sine', f, t, t + 0.12).connect(env(E, t, 0.001, 0.07)).connect(bus);
    osc(E, 'sine', f * 2.01, t, t + 0.06).connect(env(E, t, 0.001, 0.03, 0.3)).connect(bus);
  };

  // tension riser that ends exactly at o.t
  P.riser = (E, o) => {
    const dur = o.dur, t = o.t - dur, bus = out(E, Object.assign({}, o, { t }), 'riser');
    const bp = filt(E, 'bandpass', 300, 1.6);
    bp.frequency.setValueCurveAtTime(expCurve(300, 7000, 64), t, dur);
    noise(E, 'white', t, o.t + 0.05).connect(bp).connect(cgain(E, t, dur, riseCurve(3.2))).connect(bus);
    const s = osc(E, 'sawtooth', 110, t, o.t + 0.05);
    s.frequency.setValueCurveAtTime(expCurve(110, 440, 64), t, dur);
    s.connect(filt(E, 'lowpass', 1800)).connect(cgain(E, t, dur, riseCurve(2.5), 0.12)).connect(bus);
  };

  // reverse-cymbal swell that ends exactly at o.t
  P.reverse = (E, o) => {
    const dur = o.dur, t = o.t - dur, bus = out(E, Object.assign({}, o, { t }), 'reverse');
    const hp = filt(E, 'highpass', 2500);
    hp.frequency.setValueCurveAtTime(expCurve(6000, 1800, 32), t, dur);
    noise(E, 'white', t, o.t + 0.05).connect(hp).connect(cgain(E, t, dur, riseCurve(4))).connect(bus);
    noise(E, 'pink', t, o.t + 0.05).connect(filt(E, 'bandpass', 900, 0.8)).connect(cgain(E, t, dur, riseCurve(5), 0.4)).connect(bus);
  };

  // record scratch: playback speed swinging forward/back twice
  P.scratch = (E, o) => {
    const t = o.t, dur = 0.34, bus = out(E, o, 'scratch');
    const N = 128, speed = new Float32Array(N), amp = new Float32Array(N), fc = new Float32Array(N), fc2 = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = i / (N - 1);
      const v = Math.abs(Math.sin(2 * Math.PI * x * 2.0)) * (1 - 0.3 * x);
      speed[i] = 60 + 520 * v;
      amp[i] = Math.pow(v, 0.8) * (x < 0.96 ? 1 : (1 - x) / 0.04);
      fc[i] = 500 + 2600 * v;
      fc2[i] = fc[i] * 1.4;
    }
    const s = osc(E, 'sawtooth', 200, t, t + dur + 0.02);
    s.frequency.setValueCurveAtTime(speed, t, dur);
    const bp = filt(E, 'bandpass', 1200, 0.9);
    bp.frequency.setValueCurveAtTime(fc, t, dur);
    s.connect(bp).connect(cgain(E, t, dur, amp, 0.6)).connect(bus);
    const bp2 = filt(E, 'bandpass', 2000, 1.2);
    bp2.frequency.setValueCurveAtTime(fc2, t, dur);
    noise(E, 'white', t, t + dur + 0.02).connect(bp2).connect(cgain(E, t, dur, amp, 0.5)).connect(bus);
  };

  // fast-forward: fluttering chirp that speeds up, plus a whoosh
  P.ffwd = (E, o) => {
    const t = o.t, dur = o.dur;
    const bus = out(E, Object.assign({}, o, { pan: -0.4, pan1: 0.5 }), 'ffwd');
    const s = osc(E, 'sawtooth', 220, t, t + dur + 0.02);
    s.frequency.setValueCurveAtTime(expCurve(220, 1500, 64), t, dur);
    const trem = E.ctx.createGain();
    trem.gain.value = 0.5;
    const lfo = osc(E, 'square', 14, t, t + dur + 0.02);
    lfo.frequency.setValueCurveAtTime(expCurve(14, 42, 32), t, dur);
    const la = E.ctx.createGain();
    la.gain.value = 0.45;
    lfo.connect(la).connect(trem.gain);
    s.connect(trem).connect(filt(E, 'bandpass', 1400, 0.8)).connect(cgain(E, t, dur, bellCurve(0.7, 3))).connect(bus);
    play(E, 'whoosh', { t, dur, f0: 400, fp: 4200, f1: 2000, pan: -0.4, pan1: 0.6, gain: o.gain + 2, body: 0.3, peakAt: 0.7 });
  };

  // rewind: squeaky reversed-tape chatter, plus a reverse whoosh
  P.rewind = (E, o) => {
    const t = o.t, dur = o.dur;
    const bus = out(E, Object.assign({}, o, { pan: 0.5, pan1: -0.5 }), 'rewind');
    const N = Math.max(4, Math.floor(dur / 0.035)), fr = new Float32Array(N * 2), am = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const f = 700 + E.rng() * 1300, a = 0.3 + 0.7 * E.rng();
      fr[2 * i] = f;
      fr[2 * i + 1] = f * (0.8 + 0.4 * E.rng());
      am[2 * i] = a;
      am[2 * i + 1] = a * 0.4;
    }
    for (let i = 0; i < am.length; i++) am[i] *= Math.sin(Math.PI * Math.min(1, (i / (am.length - 1)) * 1.1));
    const s = osc(E, 'sawtooth', 900, t, t + dur + 0.02);
    s.frequency.setValueCurveAtTime(fr, t, dur);
    const mix = E.ctx.createGain();
    s.connect(filt(E, 'bandpass', 1100, 3)).connect(mix);
    s.connect(filt(E, 'bandpass', 2600, 4)).connect(mix);
    mix.connect(cgain(E, t, dur, am, 0.9)).connect(bus);
    play(E, 'whoosh', { t, dur: dur + 0.1, f0: 3000, fp: 1500, f1: 400, pan: 0.6, pan1: -0.6, gain: o.gain + 1, body: 0.4, peakAt: 0.5 });
  };

  // keyboard key: click + thock + release
  P.key = (E, o) => {
    const t = o.t, r = E.rng, bus = out(E, o, 'key');
    const fc = 2600 + r() * 1800;
    noise(E, 'white', t, t + 0.04).connect(filt(E, 'bandpass', fc, 1.6)).connect(env(E, t, 0.0006, 0.016)).connect(bus);
    osc(E, 'sine', 170 + r() * 90, t, t + 0.06).connect(env(E, t, 0.001, 0.035, 0.55)).connect(bus);
    noise(E, 'pink', t, t + 0.05).connect(filt(E, 'lowpass', 900)).connect(env(E, t, 0.001, 0.025, 0.45)).connect(bus);
    const tr = t + 0.05 + r() * 0.02;
    noise(E, 'white', tr, tr + 0.03).connect(filt(E, 'bandpass', fc * 1.2, 2)).connect(env(E, tr, 0.0005, 0.01, 0.3)).connect(bus);
  };

  // garbled data: rapid square-wave blips like a confused teletype
  P.chatter = (E, o) => {
    const bus = out(E, o, 'chatter');
    let tt = o.t;
    while (tt < o.t + o.dur) {
      const f = 300 + Math.floor(E.rng() * 8) * 180;
      osc(E, 'square', f, tt, tt + 0.05).connect(filt(E, 'lowpass', 2800)).connect(env(E, tt, 0.001, 0.012, 0.25 + 0.5 * E.rng(), 0.008 + E.rng() * 0.01)).connect(bus);
      tt += (1 / o.rate) * (0.6 + 0.8 * E.rng());
    }
  };

  // UI error "bonk-bonk"
  P.error = (E, o) => {
    const bus = out(E, o, 'error');
    [[0, o.pitch], [0.085, o.pitch * 0.749]].forEach(([dt, f]) => {
      const t = o.t + dt, lp = filt(E, 'lowpass', 2200), sq = E.ctx.createGain();
      sq.gain.value = 0.25;
      osc(E, 'triangle', f, t, t + 0.15).connect(lp);
      osc(E, 'square', f, t, t + 0.15).connect(sq).connect(lp);
      lp.connect(env(E, t, 0.003, 0.07, 1, 0.03)).connect(bus);
    });
  };

  // digital glitch buzz with a stuttering gate
  P.glitch = (E, o) => {
    const t = o.t, dur = o.dur, bus = out(E, o, 'glitch');
    const gate = E.ctx.createGain();
    gate.gain.value = 0;
    let tt = t;
    while (tt < t + dur) {
      gate.gain.setValueAtTime(E.rng() > 0.35 ? 1 : 0, tt);
      tt += 0.018 + E.rng() * 0.03;
    }
    gate.gain.setValueAtTime(0, t + dur);
    const sh = E.ctx.createWaveShaper();
    sh.curve = crushCurve(6);
    const mix = E.ctx.createGain();
    osc(E, 'sawtooth', 70, t, t + dur + 0.02).connect(mix);
    osc(E, 'square', 143, t, t + dur + 0.02).connect(mix);
    mix.connect(sh).connect(filt(E, 'bandpass', 900, 0.7)).connect(gate).connect(bus);
    const gn = E.ctx.createGain();
    gn.gain.value = 0.15;
    noise(E, 'white', t, t + dur).connect(filt(E, 'highpass', 3000)).connect(gn).connect(gate);
  };

  // mechanical clock tick / tock
  P.tickTock = (E, o) => {
    const t = o.t, bus = out(E, o, 'tickTock');
    noise(E, 'white', t, t + 0.05).connect(filt(E, 'bandpass', o.tock ? 2300 : 3300, 7)).connect(env(E, t, 0.0005, 0.03)).connect(bus);
    osc(E, 'sine', o.tock ? 1050 : 1400, t, t + 0.05).connect(env(E, t, 0.0005, 0.02, 0.25)).connect(bus);
  };

  // engine power-up: resonant saw sweep with a sub
  P.powerUp = (E, o) => {
    const t = o.t, dur = o.dur, bus = out(E, o, 'powerUp');
    const lp = filt(E, 'lowpass', 220, 6);
    lp.frequency.setValueCurveAtTime(expCurve(220, 4200, 64), t, dur);
    [-9, 9].forEach((det) => {
      const s = osc(E, 'sawtooth', 70, t, t + dur + 0.7);
      s.detune.value = det;
      s.frequency.setValueCurveAtTime(expCurve(70, 280, 64), t, dur);
      s.connect(lp);
    });
    const g = cgain(E, t, dur + 0.6, arCurve(dur / (dur + 0.6), 1.6, 5));
    lp.connect(g);
    const sub = osc(E, 'sine', 35, t, t + dur + 0.7);
    sub.frequency.setValueCurveAtTime(expCurve(35, 140, 64), t, dur);
    const gs = E.ctx.createGain();
    gs.gain.value = 0.5;
    sub.connect(gs).connect(g);
    g.connect(bus);
  };

  // machine hum under the pipeline (o.t -> o.t1)
  P.hum = (E, o) => {
    const t0 = o.t, t1 = o.t1, bus = out(E, o, 'hum');
    const g = E.ctx.createGain(), p = g.gain;
    p.value = 0;
    p.setValueAtTime(0, t0);
    p.linearRampToValueAtTime(1, t0 + 0.5);
    p.setValueAtTime(1, Math.max(t0 + 0.5, t1 - 0.5));
    p.linearRampToValueAtTime(0, t1);
    const lp = filt(E, 'lowpass', 380);
    osc(E, 'sawtooth', 55, t0, t1).connect(lp);
    osc(E, 'sawtooth', 110.4, t0, t1).connect(lp);
    const am = E.ctx.createGain();
    am.gain.value = 0.75;
    const la = E.ctx.createGain();
    la.gain.value = 0.25;
    osc(E, 'sine', 3.6, t0, t1).connect(la).connect(am.gain);
    lp.connect(am).connect(g).connect(bus);
    const gn = E.ctx.createGain();
    gn.gain.value = 0.12;
    noise(E, 'pink', t0, t1).connect(filt(E, 'bandpass', 1400, 0.6)).connect(gn).connect(g);
  };

  // power surge: sub swell + a filtered chord stab
  P.surge = (E, o) => {
    const t = o.t, bus = out(E, o, 'surge');
    const s = osc(E, 'sine', 42, t, t + 1.4);
    s.frequency.setValueCurveAtTime(expCurve(42, 58, 16), t, 0.25);
    s.connect(cgain(E, t, 1.3, arCurve(0.15, 1.2, 4))).connect(bus);
    const lp = filt(E, 'lowpass', 400, 4);
    lp.frequency.setValueCurveAtTime(sweep3(400, 2600, 700, 0.2), t, 1.2);
    [73.42, 110, 146.83, 220].forEach((f) => [-6, 6].forEach((d) => {
      const v = osc(E, 'sawtooth', f, t, t + 1.4);
      v.detune.value = d;
      v.connect(lp);
    }));
    lp.connect(cgain(E, t, 1.3, arCurve(0.08, 1, 4), 0.25)).connect(bus);
  };

  // laser zap: FM down-sweep + electric crackle
  P.laser = (E, o) => {
    const t = o.t, dur = 0.32, bus = out(E, Object.assign({}, o, { dur }), 'laser');
    const c = osc(E, 'sine', 2600, t, t + dur + 0.05);
    c.frequency.setValueCurveAtTime(expCurve(2600, 160, 64), t, dur);
    const m = osc(E, 'sine', 3666, t, t + dur + 0.05);
    m.frequency.setValueCurveAtTime(expCurve(3666, 226, 64), t, dur);
    const mi = E.ctx.createGain();
    mi.gain.value = 0;
    mi.gain.setValueCurveAtTime(expCurve(1800, 20, 32), t, dur);
    m.connect(mi).connect(c.frequency);
    c.connect(env(E, t, 0.002, 0.3, 1, 0.05)).connect(bus);
    const gate = E.ctx.createGain();
    gate.gain.value = 0;
    let tt = t;
    while (tt < t + 0.4) {
      gate.gain.setValueAtTime(E.rng() > 0.5 ? 0.3 * (1 - (tt - t) / 0.4) : 0, tt);
      tt += 0.006 + E.rng() * 0.02;
    }
    gate.gain.setValueAtTime(0, t + 0.4);
    noise(E, 'white', t, t + 0.45).connect(filt(E, 'highpass', 2500)).connect(gate).connect(bus);
  };

  // steam puff
  P.steam = (E, o) => {
    const t = o.t, bus = out(E, o, 'steam');
    const bp = filt(E, 'bandpass', 5000, 0.8);
    bp.frequency.setValueCurveAtTime(expCurve(5000, 2500, 16), t, 0.25);
    noise(E, 'white', t, t + 0.35).connect(bp).connect(env(E, t, 0.015, 0.25)).connect(bus);
  };

  // cartoon "grrr"
  P.grumble = (E, o) => {
    const t = o.t, dur = 0.55, bus = out(E, o, 'grumble');
    const s = osc(E, 'sawtooth', 82, t, t + dur + 0.05);
    s.frequency.setValueCurveAtTime(new Float32Array([82, 90, 78, 86, 74]), t, dur);
    const am = E.ctx.createGain();
    am.gain.value = 0.6;
    const la = E.ctx.createGain();
    la.gain.value = 0.4;
    osc(E, 'sine', 23, t, t + dur + 0.05).connect(la).connect(am.gain);
    s.connect(am).connect(filt(E, 'lowpass', 700, 3)).connect(cgain(E, t, dur, trapezoid(0.12, 0.7))).connect(bus);
  };

  // charge-up whine that cuts at the end
  P.windup = (E, o) => {
    const t = o.t, dur = o.dur, bus = out(E, o, 'windup');
    const s = osc(E, 'triangle', 300, t, t + dur + 0.05);
    s.frequency.setValueCurveAtTime(expCurve(300, 1500, 32), t, dur);
    const am = E.ctx.createGain();
    am.gain.value = 0.6;
    const la = E.ctx.createGain();
    la.gain.value = 0.4;
    osc(E, 'sine', 22, t, t + dur + 0.05).connect(la).connect(am.gain);
    s.connect(am).connect(cgain(E, t, dur, riseCurve(1.5))).connect(bus);
  };

  // data zip travelling across the stereo field
  P.zip = (E, o) => {
    const t = o.t, dur = o.dur, bus = out(E, o, 'zip');
    const shape = bellCurve(0.5, 3);
    const s = osc(E, 'sine', o.f0, t, t + dur + 0.05);
    s.frequency.setValueCurveAtTime(expCurve(o.f0, o.f1, 64), t, dur);
    s.connect(cgain(E, t, dur, shape, 0.35)).connect(bus);
    const bp = filt(E, 'bandpass', o.f0 * 3, 3);
    bp.frequency.setValueCurveAtTime(expCurve(o.f0 * 3, o.f1 * 3, 64), t, dur);
    noise(E, 'pink', t, t + dur + 0.05).connect(bp).connect(cgain(E, t, dur, shape)).connect(bus);
  };

  // lock-in: short thump + tick
  P.lock = (E, o) => {
    const t = o.t, bus = out(E, o, 'lock');
    const s = osc(E, 'sine', 260, t, t + 0.12);
    s.frequency.setValueCurveAtTime(expCurve(260, 150, 16), t, 0.05);
    s.connect(env(E, t, 0.001, 0.08)).connect(bus);
    osc(E, 'sine', 2800, t + 0.012, t + 0.06).connect(env(E, t + 0.012, 0.0006, 0.03, 0.3)).connect(bus);
    noise(E, 'white', t, t + 0.03).connect(filt(E, 'bandpass', 3500, 1.5)).connect(env(E, t, 0.0005, 0.01, 0.5)).connect(bus);
  };

  // coin clink (two hits)
  P.coin = (E, o) => {
    const bus = out(E, o, 'coin');
    const hit = (t, f0, k) => [[1, 1, 0.55], [1.47, 0.55, 0.35], [2.09, 0.35, 0.25], [2.56, 0.22, 0.16], [3.14, 0.14, 0.1]]
      .forEach(([r, g, d]) => osc(E, 'sine', f0 * r, t, t + d + 0.05).connect(env(E, t, 0.0008, d, g * k)).connect(bus));
    hit(o.t, 2637, 1);
    hit(o.t + 0.075, 2794, 0.6);
  };

  // lub-dub
  P.heartbeat = (E, o) => {
    const bus = out(E, o, 'heartbeat');
    const beat = (t, k, f) => {
      const s = osc(E, 'sine', f, t, t + 0.3);
      s.frequency.setValueCurveAtTime(expCurve(f, f * 0.7, 16), t, 0.1);
      s.connect(env(E, t, 0.004, 0.16, k)).connect(bus);
      noise(E, 'brown', t, t + 0.12).connect(filt(E, 'lowpass', 160)).connect(env(E, t, 0.003, 0.06, 0.6 * k)).connect(bus);
    };
    beat(o.t, 1, 62);
    beat(o.t + 0.17, 0.7, 55);
  };

  // paper slide: rough band-limited noise
  P.paper = (E, o) => {
    const t = o.t, dur = o.dur, bus = out(E, o, 'paper');
    const tex = E.ctx.createGain();
    tex.gain.value = 0.7;
    let tt = t;
    while (tt < t + dur) {
      tex.gain.setValueAtTime(0.4 + 0.6 * E.rng(), tt);
      tt += 0.006 + 0.01 * E.rng();
    }
    noise(E, 'white', t, t + dur + 0.05).connect(filt(E, 'highpass', 900)).connect(filt(E, 'bandpass', 2800, 0.6))
      .connect(tex).connect(cgain(E, t, dur, bellCurve(0.35, 3.5))).connect(bus);
  };

  // two-beep "recording" cue
  P.recBeep = (E, o) => {
    const bus = out(E, o, 'recBeep');
    [0, 0.11].forEach((dt) => {
      const t = o.t + dt;
      osc(E, 'sine', 1318.5, t, t + 0.12).connect(env(E, t, 0.003, 0.06, 1, 0.045)).connect(bus);
    });
  };

  // scanner sweep: resonant band sweeping up a buzzy tone + a high trill
  P.scan = (E, o) => {
    const t = o.t, dur = o.dur, bus = out(E, o, 'scan');
    const bp = filt(E, 'bandpass', 400, 6);
    bp.frequency.setValueCurveAtTime(expCurve(400, 3200, 64), t, dur);
    osc(E, 'sawtooth', 110, t, t + dur + 0.1).connect(bp);
    osc(E, 'sawtooth', 110.7, t, t + dur + 0.1).connect(bp);
    bp.connect(cgain(E, t, dur, trapezoid(0.1, 0.8))).connect(bus);
    const trem = E.ctx.createGain();
    trem.gain.value = 0.5;
    const la = E.ctx.createGain();
    la.gain.value = 0.5;
    osc(E, 'sine', 18, t, t + dur + 0.1).connect(la).connect(trem.gain);
    osc(E, 'sine', 2200, t, t + dur + 0.1).connect(trem).connect(cgain(E, t, dur, trapezoid(0.1, 0.8), 0.12)).connect(bus);
  };

  // party-popper crack + paper flutter
  P.confetti = (E, o) => {
    const t = o.t, bus = out(E, o, 'confetti');
    noise(E, 'white', t, t + 0.1).connect(filt(E, 'bandpass', 1400, 0.8)).connect(env(E, t, 0.0006, 0.06)).connect(bus);
    osc(E, 'sine', 160, t, t + 0.12).connect(env(E, t, 0.001, 0.07, 0.6)).connect(bus);
    for (let i = 0; i < 70; i++) {
      const tt = t + 0.03 + o.dur * Math.pow(E.rng(), 1.8);
      const p = E.ctx.createStereoPanner();
      p.pan.value = (E.rng() * 2 - 1) * 0.8;
      p.connect(bus);
      noise(E, 'white', tt, tt + 0.02).connect(filt(E, 'bandpass', 2500 + E.rng() * 4500, 2))
        .connect(env(E, tt, 0.0005, 0.006 + E.rng() * 0.01, 0.2 + 0.5 * E.rng())).connect(p);
    }
  };

  // soft downward boop
  P.boop = (E, o) => {
    const t = o.t, f = o.pitch, bus = out(E, o, 'boop');
    const s = osc(E, 'sine', f, t, t + 0.25);
    s.frequency.setValueCurveAtTime(expCurve(f, f * 0.5, 16), t, 0.14);
    s.connect(env(E, t, 0.004, 0.18)).connect(bus);
  };

  // vinyl crackle + hiss for the flashback (o.t -> o.t1)
  P.vinyl = (E, o) => {
    const t0 = o.t, len = o.t1 - o.t + 0.3, sr = E.sr, n = Math.floor(len * sr), r = E.rng;
    const buf = E.ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const w = r() * 2 - 1;
        lp += 0.12 * (w - lp);
        d[i] = (w - lp) * 0.05;
      }
      const count = Math.floor(len * 38);
      for (let k = 0; k < count; k++) {
        const i0 = Math.floor(r() * n), amp = Math.pow(r(), 3) * 0.9 * (r() < 0.5 ? -1 : 1), Lk = 8 + Math.floor(r() * 40);
        for (let j = 0; j < Lk && i0 + j < n; j++) d[i0 + j] += amp * Math.exp(-j / (Lk / 4)) * (j % 2 ? -1 : 1) * 0.5;
      }
      const fi = Math.floor(0.15 * sr), fo = Math.floor(0.3 * sr);
      for (let i = 0; i < fi; i++) d[i] *= i / fi;
      for (let i = 0; i < fo; i++) d[n - 1 - i] *= i / fo;
    }
    const s = E.ctx.createBufferSource();
    s.buffer = buf;
    s.connect(filt(E, 'bandpass', 2500, 0.5)).connect(out(E, o, 'vinyl'));
    s.start(t0);
  };

  // ------------------------------------------------------------ composites
  P.sting = (E, o) => {
    const t = o.t, g = o.gain;
    if (o.variant === 'index') {
      play(E, 'reverse', { t, dur: 0.55, gain: -21 + g });
      play(E, 'impact', { t, size: 0.8, gain: -12 + g });
      play(E, 'chime', { t: t + 0.01, notes: [0, 2, 3, 5, 7], spacing: 0.035, decay: 2.2, gain: -15 + g, send: 0.45 });
      play(E, 'sparkle', { t: t + 0.05, dur: 1.4, n: 22, gain: -22 + g });
    } else if (o.variant === 'parse') {
      play(E, 'reverse', { t, dur: 0.4, gain: -23 + g });
      play(E, 'thud', { t, gain: -16 + g });
      play(E, 'chime', { t, notes: [3, 5, 7, 10], spacing: 0.055, decay: 1.8, gain: -16 + g, send: 0.45 });
      play(E, 'sparkle', { t: t + 0.05, dur: 1.0, n: 16, gain: -23 + g });
    } else {
      play(E, 'chime', { t, notes: [0, 3, 5, 7], spacing: 0.03, decay: 2.0, gain: -17 + g, send: 0.45 });
      play(E, 'impact', { t, size: 0.5, gain: -16 + g });
      play(E, 'sparkle', { t: t + 0.05, dur: 1.0, n: 12, gain: -24 + g });
    }
  };
  P.levelUp = (E, o) => {
    play(E, 'chime', { t: o.t, notes: [0, 2, 4, 5, 7], spacing: 0.04, decay: 0.9, gain: o.gain, pan: o.pan, send: 0.3 });
    play(E, 'swish', { t: o.t - 0.05, dur: 0.45, f0: 900, fp: 5000, f1: 3000, gain: o.gain - 6, pan: o.pan });
  };
  // crown drop (o.t = start of the bounce tween, 0.6 s bounce.out)
  P.crown = (E, o) => {
    play(E, 'chime', { t: o.t + 0.6 * 0.364, notes: [5, 10], spacing: 0.02, decay: 1.8, gain: o.gain, pan: o.pan });
    [0.727, 0.909, 0.977].forEach((f, i) => play(E, 'tick', { t: o.t + 0.6 * f, pitch: 3200 - i * 300, gain: o.gain - 8 - i * 4, pan: o.pan }));
  };
  P.flip = (E, o) => {
    play(E, 'swish', { t: o.t, dur: 0.16, f0: 1500, fp: 5000, f1: 3000, gain: o.gain, pan: o.pan });
    play(E, 'tick', { t: o.t + 0.12, pitch: 2200, gain: o.gain - 2, pan: o.pan });
  };

  // ------------------------------------------------------------- ambience
  // A quiet, airy Dmaj9 bed voiced above the voiceover's range. It swells on
  // hero moments, is muffled with tape wobble during the 2023 flashback, and
  // fades out with the iris.
  function ambience(E, dur, A) {
    if (!A) return;
    const c = E.ctx, rng = L.rng(777);
    const bus = out(E, { t: 0, gain: A.gain ?? -34, send: 0.35 }, 'amb');
    const N = Math.ceil(dur * 50) + 2;
    const gc = new Float32Array(N), fc = new Float32Array(N), wc = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const t = (i / (N - 1)) * dur;
      let db = 0;
      for (const [ts, sdb] of A.swells) {
        const x = t - ts;
        if (x > -0.35 && x < 3) db += sdb * (x < 0 ? smooth(1 + x / 0.35) : Math.exp(-x / 0.9));
      }
      const muffle = smooth((t - A.muffle[0]) / 0.3) * (1 - smooth((t - A.muffle[1]) / 0.2));
      const fin = smooth((t - A.start) / 1.5), fout = 1 - smooth((t - A.fadeOut) / 0.6);
      db -= 3 * muffle;
      gc[i] = fin * fout * dB(db);
      const base = 1100 * (1 + 0.5 * smooth((t - A.bright) / 1.0));
      fc[i] = (base * (1 - muffle) + 260 * muffle) * dB(db * 0.6);
      wc[i] = 16 * muffle; // tape wow depth (cents)
    }
    const vg = c.createGain();
    vg.gain.value = 0;
    vg.gain.setValueCurveAtTime(gc, 0, dur);
    const lp = filt(E, 'lowpass', fc[0], 1);
    lp.frequency.setValueCurveAtTime(fc, 0, dur);
    const wg = c.createGain();
    wg.gain.value = 0;
    wg.gain.setValueCurveAtTime(wc, 0, dur);
    osc(E, 'sine', 0.9, 0, dur).connect(wg);
    [146.83, 220.0, 329.63, 369.99, 440.0, 554.37, 659.26].forEach((f, i) => {
      const w = 0.22 / (1 + i * 0.3);
      const spread = 2.5 + i * 0.8; // cents: slow beating low, shimmer high
      [-spread, spread].forEach((det) => {
        const o = osc(E, i < 2 ? 'triangle' : 'sine', f, 0, dur);
        o.detune.value = det + (rng() - 0.5) * 1.5;
        wg.connect(o.detune);
        const g = c.createGain();
        g.gain.value = w;
        const la = c.createGain();
        la.gain.value = w * 0.6;
        osc(E, 'sine', 0.04 + rng() * 0.09, 0, dur).connect(la).connect(g.gain);
        const p = c.createStereoPanner();
        p.pan.value = (i % 2 ? 0.3 : -0.3) * (det > 0 ? 1 : -1);
        o.connect(g).connect(p).connect(lp);
      });
    });
    const ag = c.createGain();
    ag.gain.value = 0.05;
    noise(E, 'pink', 0, dur, rng).connect(filt(E, 'highpass', 6000)).connect(ag).connect(vg);
    lp.connect(filt(E, 'highpass', 120)).connect(vg).connect(bus);
  }

  // ----------------------------------------------------------- rendering
  function limit(buf, ceilDb) {
    const c = dB(ceilDb), sr = buf.sampleRate, n = buf.length;
    const L0 = buf.getChannelData(0), R0 = buf.getChannelData(1);
    const req = new Float32Array(n);
    let any = false;
    for (let i = 0; i < n; i++) {
      const p = Math.max(Math.abs(L0[i]), Math.abs(R0[i]));
      req[i] = p > c ? c / p : 1;
      if (p > c) any = true;
    }
    if (!any) return 0;
    // lookahead: minimum of the required gain over the next 3 ms
    const la = Math.floor(0.003 * sr), win = new Float32Array(n), dq = new Int32Array(n);
    let h = 0, tl = 0;
    for (let i = n - 1; i >= 0; i--) {
      while (tl > h && req[dq[tl - 1]] >= req[i]) tl--;
      dq[tl++] = i;
      while (dq[h] > i + la) h++;
      win[i] = req[dq[h]];
    }
    const rel = 1 - Math.exp(-1 / (0.08 * sr));
    let g = 1, reduced = 0;
    for (let i = 0; i < n; i++) {
      const target = win[i];
      if (target < g) g = target;
      else g += (target - g) * rel;
      if (g < 0.999) reduced++;
      L0[i] *= g;
      R0[i] *= g;
    }
    return reduced / sr;
  }

  // When an event starts and when its sound (including tails) is over.
  const PRE = { riser: (d) => d.dur, reverse: (d) => d.dur, sting: () => 0.6, levelUp: () => 0.06 };
  const TAIL = {
    chime: (d) => d.decay + 0.3 + d.notes.length * d.spacing, sting: () => 2.8, crown: () => 2.4, levelUp: () => 1.2,
    impact: (d) => 1.9 * d.size, sparkle: (d) => d.dur + 0.6, confetti: (d) => d.dur + 0.2, marimba: (d) => d.decay + 0.1,
  };
  function span(ev) {
    const d = Object.assign({}, DEF[ev.type], ev);
    const start = d.t - (PRE[d.type] ? PRE[d.type](d) : 0);
    const end = (d.t1 !== undefined ? d.t1 : d.t + (d.dur || 0)) + (TAIL[d.type] ? TAIL[d.type](d) : 0.6);
    return [Math.max(0, start), end];
  }
  function shift(ev, dt) {
    const e = Object.assign({}, ev, { t: ev.t + dt });
    if (ev.t1 !== undefined) e.t1 = ev.t1 + dt;
    return e;
  }
  // Group events into short windows. Each window renders in its own small
  // context (plus room for the reverb tail); the windows are summed. This is
  // equivalent to one big render but much faster, because a context only
  // processes the nodes of the sounds inside it.
  function windows(sr) {
    const items = S.events.map((ev) => ({ ev, s: span(ev) })).sort((a, b) => a.s[0] - b.s[0]);
    const ws = [];
    let cur = null;
    for (const it of items) {
      if (!cur || it.s[0] - cur.t0 > 3) ws.push((cur = { t0: it.s[0], end: it.s[1], events: [] }));
      cur.events.push(it.ev);
      cur.end = Math.max(cur.end, it.s[1]);
    }
    return ws.map((w, k) => ({ t0: Math.max(0, (Math.floor(w.t0 * sr) - 1) / sr), t1: w.end + 2.4, events: w.events, seed: k + 1 }));
  }

  S.render = async function ({ stem = 'mix', sampleRate = 48000 } = {}) {
    const dur = window.DURATION, sr = sampleRate, n = Math.ceil(dur * sr);
    const out = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
    const add = (buf, offset) => {
      for (let c = 0; c < 2; c++) {
        const src = buf.getChannelData(c), dst = out.getChannelData(c), m = Math.min(src.length, n - offset);
        for (let i = 0; i < m; i++) dst[offset + i] += src[i];
      }
    };
    let tailPeak = 0;
    if (stem !== 'ambience') {
      for (const w of windows(sr)) {
        const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.ceil((w.t1 - w.t0) * sr), sampleRate: sr });
        const E = engine(ctx, w.seed);
        E.master.gain.value = dB(MASTER_DB);
        for (const ev of w.events) play(E, ev.type, shift(ev, -w.t0));
        const buf = await ctx.startRendering();
        // diagnostic: a window must have decayed to silence by its end
        for (let c = 0; c < 2; c++) {
          const d = buf.getChannelData(c);
          for (let i = Math.max(0, d.length - 480); i < d.length; i++) tailPeak = Math.max(tailPeak, Math.abs(d[i]));
        }
        add(buf, Math.round(w.t0 * sr));
      }
    }
    if (stem !== 'sfx' && S.amb) {
      const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: n, sampleRate: sr });
      const E = engine(ctx);
      E.master.gain.value = dB(MASTER_DB);
      ambience(E, dur, S.amb);
      add(await ctx.startRendering(), 0);
    }
    S.windowTailDb = 20 * Math.log10(tailPeak + 1e-9);
    S.limitedSeconds = limit(out, -1);
    return out;
  };

  // Level of one patch on its own (dry, no trim) for calibration.
  S.measure = async function (type, opts = {}) {
    const sr = 48000, len = opts.len || 4;
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: len * sr, sampleRate: sr });
    const E = engine(ctx);
    E.noNorm = true;
    play(E, type, Object.assign({ t: 1.2, gain: 0, send: 0 }, opts));
    const buf = await ctx.startRendering();
    let pk = 0, e = 0;
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < d.length; i++) {
        const a = Math.abs(d[i]);
        if (a > pk) pk = a;
        e += d[i] * d[i];
      }
    }
    return { peakDb: 20 * Math.log10(pk + 1e-12), rmsDb: 10 * Math.log10(e / (2 * len * sr) + 1e-20) };
  };

  S.wav = function (buf, bits = 24) {
    const nch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate, B = bits / 8;
    const bytes = new Uint8Array(44 + n * nch * B), v = new DataView(bytes.buffer);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) bytes[o + i] = s.charCodeAt(i); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * nch * B, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nch, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * nch * B, true); v.setUint16(32, nch * B, true); v.setUint16(34, bits, true);
    w(36, 'data'); v.setUint32(40, n * nch * B, true);
    const ch = [];
    for (let c = 0; c < nch; c++) ch.push(buf.getChannelData(c));
    const max = Math.pow(2, bits - 1) - 1;
    let o = 44;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < nch; c++) {
        const x = Math.round(clamp(ch[c][i], -1, 1) * max);
        if (bits === 24) { bytes[o] = x & 255; bytes[o + 1] = (x >> 8) & 255; bytes[o + 2] = (x >> 16) & 255; o += 3; }
        else { v.setInt16(o, x, true); o += 2; }
      }
    }
    return bytes;
  };

  // Export helpers for tools/sound.mjs (the WAV is pulled out in base64 chunks).
  S.exportWav = async function (stem, bits = 24) {
    const buf = await S.render({ stem });
    S._wav = S.wav(buf, bits);
    return { bytes: S._wav.length, limitedSeconds: S.limitedSeconds };
  };
  S.wavChunk = function (i, size) {
    const u8 = S._wav.subarray(i * size, (i + 1) * size);
    let s = '';
    for (let k = 0; k < u8.length; k += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(k, k + 0x8000));
    return btoa(s);
  };
  S.types = () => Object.keys(P);
})();
