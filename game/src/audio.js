// SUNKEN FOUNDRY — procedural WebAudio bleeps. No audio files.

export class AudioEngine {
  constructor() {
    this.enabled = true;
    this.ctx = null;
  }

  ensure() {
    if (!this.ctx) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) this.ctx = new AC();
      } catch (e) { /* audio unavailable */ }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  tone(freq, dur, type = 'square', vol = 0.08, slideTo = null) {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }

  flip() { this.tone(320, 0.05, 'square', 0.05, 520); }
  bumper() { this.tone(180, 0.12, 'sine', 0.12, 90); this.tone(720, 0.06, 'triangle', 0.06, 900); }
  sling() { this.tone(240, 0.07, 'square', 0.06, 140); }
  target() { this.tone(880, 0.06, 'triangle', 0.08, 660); }
  lane() { this.tone(660, 0.08, 'sine', 0.08, 990); }
  plate() { this.tone(140, 0.25, 'sawtooth', 0.12, 60); this.tone(980, 0.15, 'triangle', 0.07, 620); }
  core() { this.tone(90, 0.18, 'sawtooth', 0.14, 45); this.tone(520, 0.1, 'square', 0.06, 260); }
  bossDie() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'triangle', 0.09), i * 90)); }
  drain() { this.tone(220, 0.4, 'sawtooth', 0.1, 55); }
  save() { this.tone(660, 0.12, 'sine', 0.09, 990); }
  launch() { this.tone(160, 0.25, 'sawtooth', 0.08, 640); }
  surge() { this.tone(440, 0.3, 'sawtooth', 0.09, 1320); }
  buy() { this.tone(784, 0.08, 'triangle', 0.09); setTimeout(() => this.tone(1046, 0.12, 'triangle', 0.09), 70); }
  deny() { this.tone(160, 0.15, 'square', 0.07, 110); }
  win() { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.09), i * 110)); }
  lose() { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'sawtooth', 0.08), i * 140)); }
  tilt() { this.tone(110, 0.5, 'sawtooth', 0.12, 55); }
  nudge() { this.tone(200, 0.05, 'square', 0.04, 160); }
  hazard() { this.tone(300, 0.15, 'square', 0.07, 90); }
}
