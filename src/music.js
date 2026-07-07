// ─── Synthesized layered music engine (Web Audio, zero assets) ───────────────
// Four stems (bass, chords, drums, arp) whose volumes are driven by gameplay
// intensity. Also exposes a beat grid so SFX can be quantized to the music
// (the Lumines trick) and an onBeat callback for heartbeat-style effects.

export class MusicEngine {
  constructor(ctx) {
    this.ctx = ctx;
    this.started = false;

    this.master = ctx.createGain();
    this.master.gain.value = 0.0;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 18000;
    this.master.connect(this.filter);
    this.filter.connect(ctx.destination);

    this.layers = {};
    for (const name of ['bass', 'chords', 'drums', 'arp']) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.master);
      this.layers[name] = g;
    }
    this.layerTargets = { bass: 0.28, chords: 0.1, drums: 0, arp: 0 };

    this.bpm = 110;
    this.step = 0; // 16th-note counter, 4 bars = 64 steps
    this.nextStepTime = 0;
    this.progression = [
      { root: 45, minor: true },
      { root: 41, minor: false },
      { root: 36, minor: false },
      { root: 43, minor: false },
    ];
    this.onBeat = null;
    this.intensity = 0;
    this._timer = null;
  }

  get stepDur() {
    return 60 / this.bpm / 4;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.nextStepTime = this.ctx.currentTime + 0.1;
    this.master.gain.setTargetAtTime(0.5, this.ctx.currentTime, 1.2);
    this._timer = setInterval(() => this._schedule(), 30);
  }

  setTheme({ bpm, progression }) {
    this.bpm = bpm;
    this.progression = progression;
  }

  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
    const I = this.intensity;
    this.layerTargets.bass = 0.28;
    this.layerTargets.chords = 0.1 + I * 0.1;
    this.layerTargets.drums = I < 0.05 ? 0.05 : 0.1 + I * 0.3;
    this.layerTargets.arp = Math.max(0, I - 0.35) * 0.4;
  }

  // Underwater lowpass during Zone
  setZoneFilter(active) {
    this.filter.frequency.setTargetAtTime(active ? 420 : 18000, this.ctx.currentTime, 0.25);
  }

  // Call each frame — smooths layer gains toward targets
  update(dt) {
    for (const k in this.layers) {
      const g = this.layers[k].gain;
      g.value += (this.layerTargets[k] - g.value) * Math.min(1, dt * 2.5);
    }
  }

  // Next audio-clock time on the step grid (divisionSteps=2 → 8th notes)
  nextGridTime(divisionSteps = 2) {
    if (!this.started) return this.ctx.currentTime;
    const now = this.ctx.currentTime;
    let t = this.nextStepTime;
    let s = this.step;
    let guard = 0;
    while ((t < now + 0.02 || s % divisionSteps !== 0) && guard++ < 64) {
      t += this.stepDur;
      s++;
    }
    return t;
  }

  _schedule() {
    const ahead = this.ctx.currentTime + 0.12;
    while (this.nextStepTime < ahead) {
      this._playStep(this.step, this.nextStepTime);
      this.nextStepTime += this.stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  _playStep(step, time) {
    const bar = Math.floor(step / 16);
    const chord = this.progression[bar % this.progression.length];
    const inBar = step % 16;

    if (inBar % 4 === 0 && this.onBeat) this.onBeat(time, Math.floor(step / 4));

    // Drums (skip node creation when the layer is silent)
    if (this.layers.drums.gain.value > 0.01) {
      if (inBar % 4 === 0) this._kick(time);
      if (step % 2 === 0) this._hat(time, inBar % 4 === 2 ? 0.5 : 0.25);
    }

    // Bass: root eighth notes with an octave bounce
    if (step % 2 === 0) {
      this._bassNote(time, chord.root + (step % 8 === 4 ? 12 : 0));
    }

    // Pad chord at each bar start
    if (inBar === 0 && this.layers.chords.gain.value > 0.005) {
      this._pad(time, chord);
    }

    // Arpeggio 16ths, one octave up
    if (this.layers.arp.gain.value > 0.01) {
      const tones = this._chordTones(chord);
      this._arpNote(time, tones[step % tones.length] + 24);
    }
  }

  _chordTones(chord) {
    return [chord.root, chord.root + (chord.minor ? 3 : 4), chord.root + 7, chord.root + 12];
  }

  _freq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  _kick(time) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, time);
    o.frequency.exponentialRampToValueAtTime(45, time + 0.09);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.9, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    o.connect(g);
    g.connect(this.layers.drums);
    o.start(time);
    o.stop(time + 0.15);
  }

  _hat(time, vol) {
    const dur = 0.03;
    const size = Math.ceil(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, size, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < size; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (size * 0.3));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.layers.drums);
    src.start(time);
    src.stop(time + dur);
  }

  _bassNote(time, midi) {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = this._freq(midi);
    const g = this.ctx.createGain();
    const dur = this.stepDur * 1.8;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.8, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    o.connect(g);
    g.connect(this.layers.bass);
    o.start(time);
    o.stop(time + dur);
  }

  _pad(time, chord) {
    const barDur = this.stepDur * 16;
    for (const midi of this._chordTones(chord)) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = this._freq(midi + 12);
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.linearRampToValueAtTime(0.09, time + barDur * 0.25);
      g.gain.setValueAtTime(0.09, time + barDur * 0.7);
      g.gain.linearRampToValueAtTime(0.0001, time + barDur);
      o.connect(lp);
      lp.connect(g);
      g.connect(this.layers.chords);
      o.start(time);
      o.stop(time + barDur);
    }
  }

  _arpNote(time, midi) {
    const o = this.ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = this._freq(midi);
    const g = this.ctx.createGain();
    const dur = this.stepDur * 0.9;
    g.gain.setValueAtTime(0.15, time);
    g.gain.exponentialRampToValueAtTime(0.001, time + dur);
    o.connect(g);
    g.connect(this.layers.arp);
    o.start(time);
    o.stop(time + dur);
  }
}
