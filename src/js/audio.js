'use strict';
/* BLOCK CITY TYCOON — AUDIO — Web Audio synthesized SFX & music */
/* =============================== 10. AUDIO =============================== */
const SND = {
  ctx: null, master: null, rainGain: null, rainSrc: null, musicTimer: null, last: {},
  init: function () {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.5 * masterVolume(); this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },
  tone: function (freq, dur, type, vol, delay, slide) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.15, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  noise: function (dur, vol, freq, delay) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + (delay || 0);
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
    const g = this.ctx.createGain(); g.gain.value = vol || 0.2;
    src.connect(f); f.connect(g); g.connect(this.master); src.start(t);
  },
  setRain: function (on) {
    if (!this.ctx) return;
    const want = on && S.settings.sound;
    if (want && !this.rainSrc) {
      const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.6;
      const g = this.ctx.createGain(); g.gain.value = 0.035;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      this.rainSrc = src; this.rainGain = g;
    } else if (!want && this.rainSrc) { try { this.rainSrc.stop(); } catch (e) { } this.rainSrc = null; }
  },
  startMusic: function () {
    if (!this.ctx || this.musicTimer) return;
    const chords = [[261.6, 329.6, 392], [220, 261.6, 329.6], [174.6, 220, 261.6], [196, 246.9, 293.7]];
    let k = 0;
    const self = this;
    const play = function () {
      if (!S.settings.music) return;
      const c = chords[k % chords.length]; k++;
      c.forEach(function (f, i) { self.tone(f, 2.2, 'triangle', 0.03, i * 0.02); });
      for (let n = 0; n < 4; n++) self.tone(c[n % 3] * 2, 0.35, 'sine', 0.025, 0.5 * n + 0.1);
    };
    play(); this.musicTimer = setInterval(play, 2000);
  },
  stopMusic: function () { if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; } }
};
function sfx(name) {
  if (!S || !S.settings.sound || !SND.ctx) return;
  const now = performance.now();
  if (SND.last[name] && now - SND.last[name] < 70) return;
  SND.last[name] = now;
  switch (name) {
    case 'click': SND.tone(660, 0.05, 'square', 0.05); break;
    case 'build': SND.tone(220, 0.08, 'square', 0.08); SND.noise(0.12, 0.12, 800, 0.03); break;
    case 'complete': SND.tone(523, 0.09, 'triangle', 0.12); SND.tone(784, 0.16, 'triangle', 0.12, 0.09); break;
    case 'money': SND.tone(988, 0.07, 'sine', 0.12); SND.tone(1319, 0.14, 'sine', 0.12, 0.07); break;
    case 'achievement': [523, 659, 784, 1047].forEach(function (f, i) { SND.tone(f, 0.14, 'sine', 0.12, i * 0.09); }); break;
    case 'levelup': [392, 523, 659, 784, 1047].forEach(function (f, i) { SND.tone(f, 0.16, 'triangle', 0.13, i * 0.08); }); break;
    case 'notify': SND.tone(880, 0.08, 'sine', 0.07); SND.tone(1175, 0.1, 'sine', 0.06, 0.08); break;
    case 'error': SND.tone(180, 0.18, 'sawtooth', 0.08, 0, 120); break;
    case 'event': SND.tone(440, 0.2, 'sawtooth', 0.07); SND.tone(330, 0.3, 'sawtooth', 0.07, 0.2); break;
    case 'weather': SND.noise(0.8, 0.06, 900); break;
    case 'thunder': SND.noise(1.6, 0.35, 180); SND.tone(60, 0.9, 'sine', 0.2, 0, 35); break;
    case 'road': SND.noise(0.08, 0.1, 500); break;
    case 'demolish': SND.noise(0.35, 0.25, 400); SND.tone(90, 0.25, 'square', 0.06, 0, 50); break;
  }
}
