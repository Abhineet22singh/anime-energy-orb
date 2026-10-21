/**
 * audio.js – Procedural Web Audio API sound synthesis for Anime Energy Orb
 * Creates authentic anime energy hum, charge-up whine, electrical crackles, and burst sounds.
 */

class SoundFX {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.humGain = null;
    this.humOsc = null;
    this.subOsc = null;
    this.chargeOsc = null;
    this.chargeGain = null;
    this.filter = null;
    this.noiseNode = null;
    this.crackleGain = null;
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      // Master output
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      // Low pass filter
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.setValueAtTime(800, this.ctx.currentTime);
      this.filter.Q.setValueAtTime(4, this.ctx.currentTime);
      this.filter.connect(this.masterGain);

      // 1. Continuous Energy Hum (Fundamental 65Hz - 130Hz)
      this.humOsc = this.ctx.createOscillator();
      this.humOsc.type = 'sine';
      this.humOsc.frequency.setValueAtTime(75, this.ctx.currentTime);

      this.subOsc = this.ctx.createOscillator();
      this.subOsc.type = 'triangle';
      this.subOsc.frequency.setValueAtTime(150, this.ctx.currentTime);

      this.humGain = this.ctx.createGain();
      this.humGain.gain.setValueAtTime(0, this.ctx.currentTime);

      this.humOsc.connect(this.humGain);
      this.subOsc.connect(this.humGain);
      this.humGain.connect(this.filter);

      this.humOsc.start();
      this.subOsc.start();

      // 2. High frequency charging whine (Sawtooth with rising sweep)
      this.chargeOsc = this.ctx.createOscillator();
      this.chargeOsc.type = 'sawtooth';
      this.chargeOsc.frequency.setValueAtTime(220, this.ctx.currentTime);

      this.chargeGain = this.ctx.createGain();
      this.chargeGain.gain.setValueAtTime(0, this.ctx.currentTime);

      const chargeFilter = this.ctx.createBiquadFilter();
      chargeFilter.type = 'bandpass';
      chargeFilter.frequency.setValueAtTime(1200, this.ctx.currentTime);
      chargeFilter.Q.setValueAtTime(8, this.ctx.currentTime);

      this.chargeOsc.connect(chargeFilter);
      chargeFilter.connect(this.chargeGain);
      this.chargeGain.connect(this.masterGain);
      this.chargeOsc.start();

      // 3. Electrical crackle buffer
      this._initCrackle();

      this.isInitialized = true;
    } catch (e) {
      console.warn('Web Audio initialization error:', e);
    }
  }

  _initCrackle() {
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(3000, this.ctx.currentTime);

    this.crackleGain = this.ctx.createGain();
    this.crackleGain.gain.setValueAtTime(0, this.ctx.currentTime);

    whiteNoise.connect(noiseFilter);
    noiseFilter.connect(this.crackleGain);
    this.crackleGain.connect(this.masterGain);
    whiteNoise.start();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  update(intensity, charge, speed) {
    if (!this.isInitialized || !this.enabled) return;

    const now = this.ctx.currentTime;
    const active = intensity > 0.05;

    // Hum volume & pitch modulation
    const targetHum = active ? Math.min(intensity * 0.35, 0.45) : 0;
    this.humGain.gain.setTargetAtTime(targetHum, now, 0.08);

    const baseFreq = 75 + charge * 45 + speed * 30;
    this.humOsc.frequency.setTargetAtTime(baseFreq, now, 0.05);
    this.subOsc.frequency.setTargetAtTime(baseFreq * 2, now, 0.05);
    this.filter.frequency.setTargetAtTime(600 + intensity * 800 + charge * 1200, now, 0.08);

    // Charge whine
    const targetChargeWhine = charge > 0.1 ? Math.min(charge * 0.25, 0.3) : 0;
    this.chargeGain.gain.setTargetAtTime(targetChargeWhine, now, 0.05);
    this.chargeOsc.frequency.setTargetAtTime(220 + charge * 600, now, 0.05);

    // Crackle volume based on intensity + arcs
    const targetCrackle = active ? Math.min((0.02 + charge * 0.05) * intensity, 0.08) : 0;
    this.crackleGain.gain.setTargetAtTime(targetCrackle, now, 0.1);
  }

  /**
   * Play explosive burst when releasing a charged orb
   */
  playBurst(power = 1.0) {
    if (!this.isInitialized || !this.enabled) return;
    try {
      const now = this.ctx.currentTime;

      // Punchy sub-bass impact
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);

      gain.gain.setValueAtTime(0.6 * power, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.45);

      // Resonant whoosh
      const noise = this.ctx.createBufferSource();
      const bSize = Math.floor(this.ctx.sampleRate * 0.5);
      const b = this.ctx.createBuffer(1, bSize, this.ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < bSize; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bSize * 0.3));
      noise.buffer = b;

      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.setValueAtTime(800, now);
      f.frequency.exponentialRampToValueAtTime(250, now + 0.45);
      f.Q.setValueAtTime(3, now);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.4 * power, now);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      noise.connect(f);
      f.connect(nGain);
      nGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.5);
    } catch (e) {
      // Audio errors should not interrupt animation loop
    }
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.enabled ? 0.35 : 0, this.ctx.currentTime);
    }
    return this.enabled;
  }
}

export const soundFX = new SoundFX();
