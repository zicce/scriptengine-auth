"use client";

const STORAGE_KEY = "se-ui-sound";

let context = null;
let muted = null;
let lastPlayed = 0;

function audio() {
  if (typeof window === "undefined") return null;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return null;
  if (!context) context = new Audio();
  if (context.state === "suspended") context.resume().catch(() => {});
  return context;
}

export function isSoundMuted() {
  if (muted === null) {
    try {
      muted = window.localStorage.getItem(STORAGE_KEY) === "off";
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setSoundMuted(value) {
  muted = Boolean(value);
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? "off" : "on");
  } catch {
    // Sound still follows the in-memory setting.
  }
}

function tone(ctx, { at = 0, freq, to, duration, type = "sine", volume = 0.05 }) {
  const start = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function swoosh(ctx, { duration = 0.16, from = 600, to = 2600, volume = 0.05 }) {
  const start = ctx.currentTime;
  const length = Math.ceil(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.4;
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + duration);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + duration * 0.35);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(start);
  noise.stop(start + duration + 0.02);
}

function chime(ctx, notes, { volume = 0.04, decay = 0.35, echo = 0.18 } = {}) {
  const start = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.value = 1;
  const soften = ctx.createBiquadFilter();
  soften.type = "lowpass";
  soften.frequency.value = 3200;
  const delay = ctx.createDelay(0.5);
  delay.delayTime.value = 0.09;
  const feedback = ctx.createGain();
  feedback.gain.value = echo;
  out.connect(soften).connect(ctx.destination);
  soften.connect(delay);
  delay.connect(feedback).connect(delay);
  delay.connect(ctx.destination);

  notes.forEach(({ freq, at = 0, level = 1 }) => {
    const begin = start + at;
    [1, 2.01].forEach((harmonic, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq * harmonic, begin);
      const peak = volume * level * (index ? 0.18 : 1);
      gain.gain.setValueAtTime(0.0001, begin);
      gain.gain.exponentialRampToValueAtTime(peak, begin + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, begin + decay * (index ? 0.5 : 1));
      osc.connect(gain).connect(out);
      osc.start(begin);
      osc.stop(begin + decay + 0.05);
    });
  });

  window.setTimeout(() => {
    out.disconnect();
    delay.disconnect();
    feedback.disconnect();
  }, (decay + 1) * 1000);
}

function bubble(ctx, { at = 0, from, to, duration, volume }) {
  const start = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const soften = ctx.createBiquadFilter();
  osc.type = "sine";
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + duration * 0.7);
  soften.type = "lowpass";
  soften.frequency.value = 2200;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(soften).connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function marimba(ctx, { at = 0, freq, volume }) {
  const start = ctx.currentTime + at;
  [
    { ratio: 1, level: 1, decay: 0.22 },
    { ratio: 3.93, level: 0.22, decay: 0.05 },
    { ratio: 0.5, level: 0.35, decay: 0.09 },
  ].forEach(({ ratio, level, decay }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq * ratio * 1.02, start);
    osc.frequency.exponentialRampToValueAtTime(freq * ratio, start + 0.03);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume * level, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + decay + 0.02);
  });
}

const SOUNDS = {
  click: (ctx) => tone(ctx, { freq: 1500, to: 900, duration: 0.05, volume: 0.035 }),
  pop: (ctx) => tone(ctx, { freq: 880, to: 320, duration: 0.08, volume: 0.04 }),
  nav: (ctx) => {
    marimba(ctx, { freq: 587.3, volume: 0.07 });
  },
  toggle: (ctx) => tone(ctx, { freq: 640, to: 960, duration: 0.07, type: "triangle", volume: 0.035 }),
  success: (ctx) => {
    tone(ctx, { freq: 660, duration: 0.09, volume: 0.04 });
    tone(ctx, { at: 0.08, freq: 880, duration: 0.09, volume: 0.04 });
    tone(ctx, { at: 0.16, freq: 1320, duration: 0.16, volume: 0.035 });
  },
  error: (ctx) => {
    tone(ctx, { freq: 240, to: 170, duration: 0.14, type: "square", volume: 0.018 });
    tone(ctx, { at: 0.12, freq: 190, to: 140, duration: 0.16, type: "square", volume: 0.016 });
  },
};

export function playSound(name) {
  if (typeof window === "undefined" || isSoundMuted()) return;
  const now = performance.now();
  if (name === "click" && now - lastPlayed < 40) return;
  lastPlayed = now;
  const ctx = audio();
  const sound = SOUNDS[name];
  if (!ctx || !sound) return;
  try {
    sound(ctx);
  } catch {
    // Audio is a nicety; ignore browsers that refuse to play.
  }
}
