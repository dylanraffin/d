// Score for trailer B ("corrupted tape"): every cue sits on the same timestamps as
// the GSAP timeline in b/index.html. Output: assets/audio/score-b.wav
import { writeFileSync, mkdirSync } from "node:fs";

const SR = 48000;
const DUR = 20;
const N = SR * DUR;
const L = new Float32Array(N), R = new Float32Array(N);
const VL = new Float32Array(N), VR = new Float32Array(N); // reverb send

let seed = 1111;
const rnd = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const noise = () => rnd() * 2 - 1;

function add(i, v, pan = 0, send = 0) {
  if (i < 0 || i >= N) return;
  const gl = Math.cos((pan + 1) * Math.PI / 4), gr = Math.sin((pan + 1) * Math.PI / 4);
  L[i] += v * gl; R[i] += v * gr;
  if (send) { VL[i] += v * gl * send; VR[i] += v * gr * send; }
}

// ---------- instruments ----------
function clack(t, g = 1, pan = 0) {
  const s = Math.floor(t * SR), len = Math.floor(0.06 * SR);
  let hp = 0, prev = 0;
  for (let k = 0; k < len; k++) {
    const x = k / SR;
    const n = noise(); hp = 0.6 * (hp + n - prev); prev = n;
    const v = hp * Math.exp(-x / 0.006) * 0.9 + Math.sin(2 * Math.PI * 2300 * x) * Math.exp(-x / 0.01) * 0.35 + Math.sin(2 * Math.PI * 190 * x) * Math.exp(-x / 0.025) * 0.6;
    add(s + k, v * g, pan, 0.15);
  }
}
function impact(t, g = 1, send = 0.5) {
  const s = Math.floor(t * SR), len = Math.floor(1.4 * SR);
  let ph = 0, lp = 0;
  for (let k = 0; k < len; k++) {
    const x = k / SR;
    const f = 42 + 110 * Math.exp(-x / 0.06);
    ph += 2 * Math.PI * f / SR;
    lp += 0.25 * (noise() - lp);
    const v = Math.sin(ph) * Math.exp(-x / 0.38) * 1.0 + lp * Math.exp(-x / 0.05) * 0.9;
    add(s + k, v * g, 0, send);
  }
}
function kick(t, g = 1) {
  const s = Math.floor(t * SR), len = Math.floor(0.4 * SR);
  let ph = 0;
  for (let k = 0; k < len; k++) {
    const x = k / SR;
    ph += 2 * Math.PI * (48 + 120 * Math.exp(-x / 0.03)) / SR;
    add(s + k, Math.sin(ph) * Math.exp(-x / 0.16) * g + (k < 60 ? noise() * 0.3 * g : 0));
  }
}
function hat(t, g = 1, pan = 0.2) {
  const s = Math.floor(t * SR), len = Math.floor(0.08 * SR);
  let prev = 0, hp = 0;
  for (let k = 0; k < len; k++) {
    const n = noise(); hp = 0.9 * (hp + n - prev); prev = n;
    add(s + k, hp * Math.exp(-(k / SR) / 0.018) * 0.35 * g, pan, 0.1);
  }
}
function clap(t, g = 1) {
  const s = Math.floor(t * SR), len = Math.floor(0.3 * SR);
  let bp1 = 0, bp2 = 0;
  for (let k = 0; k < len; k++) {
    const x = k / SR;
    const burst = [0, 0.011, 0.022].reduce((a, o) => a + (x >= o ? Math.exp(-(x - o) / 0.008) : 0), 0) + Math.exp(-x / 0.09) * 0.6;
    bp1 += 0.35 * (noise() - bp1); bp2 += 0.35 * (bp1 - bp2);
    add(s + k, (bp1 - bp2) * burst * 1.6 * g, 0, 0.35);
  }
}
function bell(t, f, g = 1, pan = 0, decay = 1.4) {
  const s = Math.floor(t * SR), len = Math.floor(decay * 3 * SR);
  const parts = [[1, 1], [2.0, 0.45], [2.76, 0.3], [5.4, 0.16], [8.93, 0.08]];
  for (let k = 0; k < len; k++) {
    const x = k / SR;
    let v = 0;
    for (let p = 0; p < parts.length; p++) v += Math.sin(2 * Math.PI * f * parts[p][0] * x) * parts[p][1] * Math.exp(-x / (decay / (1 + p * 0.8)));
    v *= Math.min(1, x / 0.002);
    add(s + k, v * 0.22 * g, pan, 0.6);
  }
}
function whoosh(t0, t1, g = 1, up = true, panFrom = -0.6, panTo = 0.6) {
  const s = Math.floor(t0 * SR), len = Math.floor((t1 - t0) * SR);
  let lp = 0, lp2 = 0;
  for (let k = 0; k < len; k++) {
    const p = k / len;
    const env = Math.pow(Math.sin(Math.PI * (up ? Math.pow(p, 0.7) : 1 - Math.pow(1 - p, 0.7))), 2);
    const cut = up ? 0.01 + 0.35 * p * p : 0.36 - 0.35 * p;
    lp += cut * (noise() - lp); lp2 += cut * (lp - lp2);
    add(s + k, lp2 * env * 1.4 * g, panFrom + (panTo - panFrom) * p, 0.3);
  }
}
function riser(t0, t1, g = 1) {
  const s = Math.floor(t0 * SR), len = Math.floor((t1 - t0) * SR);
  let ph = 0, lp = 0;
  for (let k = 0; k < len; k++) {
    const p = k / len;
    const f = 180 * Math.pow(9, p);
    ph += 2 * Math.PI * f / SR;
    lp += (0.02 + 0.4 * p * p) * (noise() - lp);
    const env = Math.pow(p, 2.2);
    add(s + k, (Math.sin(ph) * 0.25 + Math.sin(ph * 1.5) * 0.1 + lp * 0.7) * env * g, Math.sin(p * 18) * 0.3, 0.4);
  }
}
function pad(t0, t1, freqs, g = 1, attack = 0.8, release = 0.8) {
  const s = Math.floor(t0 * SR), len = Math.floor((t1 - t0) * SR);
  const phs = freqs.map(() => [0, 0]);
  for (let k = 0; k < len; k++) {
    const x = k / SR, rem = (len - k) / SR;
    const env = Math.min(1, x / attack) * Math.min(1, rem / release);
    let l = 0, r = 0;
    freqs.forEach((f, i) => {
      phs[i][0] += 2 * Math.PI * f * 0.997 / SR;
      phs[i][1] += 2 * Math.PI * f * 1.003 / SR;
      const a = 1 / (1 + i * 0.35);
      l += (Math.sin(phs[i][0]) + 0.18 * Math.sin(2 * phs[i][0])) * a;
      r += (Math.sin(phs[i][1]) + 0.18 * Math.sin(2 * phs[i][1])) * a;
    });
    const trem = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.5 * x);
    const i = s + k;
    if (i >= 0 && i < N) {
      L[i] += l * env * trem * 0.05 * g; R[i] += r * env * trem * 0.05 * g;
      VL[i] += l * env * 0.02 * g; VR[i] += r * env * 0.02 * g;
    }
  }
}
function blip(t, g = 0.3) { // typing tick
  const s = Math.floor(t * SR), len = Math.floor(0.025 * SR);
  for (let k = 0; k < len; k++) add(s + k, Math.sin(2 * Math.PI * 3200 * k / SR) * Math.exp(-(k / SR) / 0.004) * g, 0.3);
}


// ---------- extra instruments ----------
function key(t, g = 1, pan = 0) { // typewriter strike: sharp click + body thunk
  const s = Math.floor(t * SR), len = Math.floor(0.09 * SR);
  let hp = 0, prev = 0;
  for (let k = 0; k < len; k++) {
    const x = k / SR, n = noise(); hp = 0.75 * (hp + n - prev); prev = n;
    const v = hp * Math.exp(-x / 0.004) * 1.1 + Math.sin(2 * Math.PI * 1400 * x) * Math.exp(-x / 0.006) * 0.25 + Math.sin(2 * Math.PI * 140 * x) * Math.exp(-x / 0.02) * 0.5;
    add(s + k, v * g, pan, 0.12);
  }
}
function heart(t, g = 1) { // lub-dub
  [0, 0.16].forEach((o, j) => {
    const s = Math.floor((t + o) * SR), len = Math.floor(0.35 * SR);
    let ph = 0;
    for (let k = 0; k < len; k++) {
      const x = k / SR; ph += 2 * Math.PI * (52 + 30 * Math.exp(-x / 0.03)) / SR;
      add(s + k, Math.sin(ph) * Math.exp(-x / 0.09) * g * (j ? 0.7 : 1), 0, 0.1);
    }
  });
}
function flashPop(t, g = 1) { // flashbulb: crack + rising whine
  const s = Math.floor(t * SR), len = Math.floor(0.9 * SR);
  let ph = 0;
  for (let k = 0; k < len; k++) {
    const x = k / SR; ph += 2 * Math.PI * (2200 + 5200 * (1 - Math.exp(-x / 0.4))) / SR;
    add(s + k, (noise() * Math.exp(-x / 0.012) * 1.2 + Math.sin(ph) * 0.05 * Math.exp(-x / 0.35)) * g, 0, 0.5);
  }
}
function tapeRip(t, dur, g = 1, pan = 0) { // stretchy plastic tape zip
  const s = Math.floor(t * SR), len = Math.floor(dur * SR);
  let bp = 0, bp2 = 0;
  for (let k = 0; k < len; k++) {
    const p = k / len, am = 0.55 + 0.45 * Math.sin(2 * Math.PI * (60 + 140 * p) * k / SR);
    bp += 0.45 * (noise() - bp); bp2 += 0.45 * (bp - bp2);
    add(s + k, (bp - bp2) * am * Math.sin(Math.PI * p) * 2.2 * g, pan, 0.2);
  }
}
function scribble(t, dur, g = 1) { // marker on paper
  const s = Math.floor(t * SR), len = Math.floor(dur * SR);
  let hp = 0, prev = 0;
  for (let k = 0; k < len; k++) {
    const p = k / len, n = noise(); hp = 0.85 * (hp + n - prev); prev = n;
    const am = 0.5 + 0.5 * Math.abs(Math.sin(2 * Math.PI * 7 * p));
    add(s + k, hp * am * Math.sin(Math.PI * p) * 0.5 * g, 0.2, 0.15);
  }
}
function drone(t0, t1, g = 1) { // dissonant low bed: A1 + Bb1 + E2, slow swell
  pad(t0, t1, [55, 58.27, 82.41, 110], g, 1.5, 0.6);
}


// ---------- tape instruments ----------
function hum(t0, t1, g = 1) { // mains hum + harmonics, like a cheap VCR
  const s = Math.floor(t0 * SR), len = Math.floor((t1 - t0) * SR);
  for (let k = 0; k < len; k++) {
    const x = k / SR, env = Math.min(1, x / 0.05) * Math.min(1, (len - k) / SR / 0.05);
    const v = Math.sin(2 * Math.PI * 60 * x) * 0.5 + Math.sin(2 * Math.PI * 120 * x) * 0.3 + Math.sin(2 * Math.PI * 180 * x) * 0.15 + noise() * 0.02;
    add(s + k, v * env * 0.07 * g, 0);
  }
}
function staticBurst(t0, t1, g = 1) {
  const s = Math.floor(t0 * SR), len = Math.floor((t1 - t0) * SR);
  let hold = 0;
  for (let k = 0; k < len; k++) {
    if (k % 5 === 0) hold = noise();
    const p = k / len, env = Math.min(1, p * 12) * Math.min(1, (1 - p) * 8);
    add(s + k, hold * env * 0.55 * g, (noise()) * 0.3, 0.05);
  }
}
function musicBox(t, f, g = 1, dur = 0.9, wobble = 0.012) { // warped lullaby note
  const s = Math.floor(t * SR), len = Math.floor(dur * SR);
  let ph = 0;
  for (let k = 0; k < len; k++) {
    const x = k / SR, tt = t + x;
    ph += 2 * Math.PI * f * (1 + wobble * Math.sin(2 * Math.PI * 0.8 * tt) + wobble * 0.5 * Math.sin(2 * Math.PI * 6.3 * tt)) / SR;
    const v = (Math.sin(ph) + 0.35 * Math.sin(3 * ph) + 0.12 * Math.sin(5.03 * ph)) * Math.exp(-x / 0.32) * Math.min(1, x / 0.003);
    add(s + k, v * 0.16 * g, 0.15, 0.7);
  }
}
function glitchBlip(t, g = 1) {
  const s = Math.floor(t * SR), len = Math.floor((0.02 + rnd() * 0.06) * SR);
  const f = 180 + rnd() * 2800, pan = (rnd() - 0.5) * 1.4;
  for (let k = 0; k < len; k++) add(s + k, (Math.sin(2 * Math.PI * f * k / SR) > 0 ? 1 : -1) * 0.13 * g, pan, 0.05);
}
function tapeStop(t, dur, f0, g = 1) { // pitch dives to nothing
  const s = Math.floor(t * SR), len = Math.floor(dur * SR);
  let ph = 0;
  for (let k = 0; k < len; k++) {
    const p = k / len, f = f0 * Math.pow(1 - p, 2.2) + 8;
    ph += 2 * Math.PI * f / SR;
    const saw = 2 * ((ph / (2 * Math.PI)) % 1) - 1;
    add(s + k, (saw * 0.25 + Math.sin(ph * 0.5) * 0.3) * (1 - p * 0.6) * g, 0, 0.2);
  }
}
function bitcrush(t0, t1, bits, hold) { // degrade the dry mix in a window
  const s = Math.floor(t0 * SR), e = Math.min(N, Math.floor(t1 * SR)), q = Math.pow(2, bits - 1);
  let hl = 0, hr = 0;
  for (let i = s; i < e; i++) {
    if ((i - s) % hold === 0) { hl = Math.round(L[i] * q) / q; hr = Math.round(R[i] * q) / q; }
    L[i] = hl; R[i] = hr;
  }
}
function stutterImpact(t, g = 1) { [0, 0.035, 0.07, 0.105].forEach((o, i) => impact(t + o, g * [1, 0.55, 0.7, 0.45][i], 0.5)); }

// ---------- score (timestamps mirror b/index.html) ----------
const SPIKES = [1.45, 1.95, 2.55, 3.1, 3.6, 3.95, 4.25, 4.45, 10.9, 11.0, 11.15, 11.25, 11.5, 11.95, 12.4, 12.85, 13.3, 13.75, 14.6, 16.6, 17.2, 18.4];
hum(0, 19.4, 1);
whoosh(0, 0.45, 0.35, true, 0, 0);       // motor spin-up
clack(0.1, 1.0, 0); clack(0.16, 0.6, 0);  // PLAY button
blip(0.12, 0.35); blip(0.7, 0.35);
staticBurst(0.95, 1.42, 1.0);
// warped lullaby (A minor), stuttering on glitch spikes, dragged down at 10.9
const mel = [659.25, 523.25, 440, 493.88, 523.25, 493.88, 415.3, 329.63];
for (let i = 0, t = 1.5; t < 10.85; i++, t += 0.32) {
  const near = SPIKES.find((sp) => Math.abs(sp - t) < 0.16);
  const f = mel[i % mel.length] * (t > 7.2 ? Math.pow(2, -1 / 12) : 1);
  if (near) [0, 0.045, 0.09].forEach((o) => musicBox(t + o, f, 0.8, 0.25));
  else musicBox(t, f, 1, 0.9, t > 8.2 ? 0.025 : 0.012);
}
drone(1.4, 11.3, 1.3);
// torn cover
SPIKES.filter((t) => t < 4.6).forEach((t) => { impact(t, 0.55, 0.3); for (let k = 0; k < 5; k++) glitchBlip(t + k * 0.03, 0.9); });
[1.95, 2.55, 3.1, 3.6, 3.95].forEach((t) => { kick(t, 0.9); clap(t, 0.35); });
// evidence montage: each cut slams, heartbeat underneath
[4.6, 4.88, 5.12, 5.42, 5.65, 5.85, 6.08, 6.35, 6.6, 6.85, 7.05, 7.25, 7.5, 7.75].forEach((t, i) => { clack(t, 0.9, i % 2 ? 0.4 : -0.4); kick(t, 0.6); });
[5.85, 7.25].forEach((t) => impact(t, 0.9, 0.5));
for (let t = 4.6; t < 8.1; t += 0.5) heart(t, 0.7);
[6.4].forEach((t) => { impact(t, 0.8, 0.6); bell(t, 233.08, 0.5, 0, 1.4); bell(t, 220, 0.5, 0.2, 1.4); });
// detective → suspect
Array.from("You're the detective.").forEach((c, i) => c !== " " && key(8.3 + i * 0.03, 0.45, -0.3 + (i % 5) * 0.15));
for (let t = 9.3; t < 10.1; t += 1 / 30) glitchBlip(t, 0.55);
riser(9.3, 10.1, 0.6);
impact(10.1, 1.1, 0.8); kick(10.1, 1.0);
[220, 233.08, 329.63, 349.23].forEach((f, i) => bell(10.12 + i * 0.02, f * 2, 0.45, -0.4 + i * 0.27, 2.2));
tapeStop(10.75, 0.55, 300, 0.5);
SPIKES.filter((t) => t >= 10.9 && t < 11.3).forEach((t) => { for (let k = 0; k < 6; k++) glitchBlip(t + k * 0.025, 1.0); });
staticBurst(11.22, 11.42, 0.9);
// title
[11.5, 11.95, 12.4].forEach((t) => { stutterImpact(t, 1.05); kick(t, 1.0); clap(t, 0.6); });
impact(12.85, 1.3, 0.9); kick(12.85, 1.0);
pad(11.5, 14.6, [55, 58.27, 110, 130.81, 155.56], 1.4, 0.05, 0.3);
[13.3, 13.75].forEach((t) => { for (let k = 0; k < 6; k++) glitchBlip(t + k * 0.03, 1.0); });
tapeStop(14.1, 0.5, 520, 0.9);
staticBurst(14.5, 14.66, 1.0);
// book + date
impact(14.6, 1.2, 0.9);
pad(14.6, 19.4, [55, 110, 164.81, 207.65, 261.63], 1.2, 0.4, 0.3);
Array.from("AVAILABLE IN").forEach((c, i) => c !== " " && blip(15.3 + i * 0.04, 0.25));
Array.from("OCTOBER").forEach((c, i) => { blip(15.85 + i * 0.07, 0.3); kick(15.85 + i * 0.07, 0.35); });
impact(16.35, 0.9, 0.7);
[16.6, 18.4].forEach((t) => { for (let k = 0; k < 5; k++) glitchBlip(t + k * 0.03, 0.9); });
impact(17.2, 1.0, 0.8); kick(17.2, 0.9);
[659.25, 523.25, 440, 415.3].forEach((f, i) => musicBox(17.45 + i * 0.42, f * 0.5, 1.0, 1.2, 0.03));
// CRT power-off
tapeStop(19.3, 0.4, 900, 0.6);
impact(19.5, 0.8, 0.3);
for (let k = 0; k < 2400; k++) add(Math.floor(19.62 * SR) + k, Math.sin(2 * Math.PI * 15000 * k / SR) * 0.04 * Math.exp(-k / SR / 0.15), 0);
// degrade the worst moments
bitcrush(0.95, 1.42, 5, 7);
bitcrush(10.85, 11.42, 5, 9);
bitcrush(14.1, 14.66, 6, 6);

// ---------- reverb (Schroeder) ----------
function reverb(inp, offs) {
  const out = new Float32Array(N);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356].map((d) => ({ d: Math.round((d + offs) * SR / 44100), buf: null, i: 0, lp: 0 }));
  combs.forEach((c) => (c.buf = new Float32Array(c.d)));
  for (let n = 0; n < N; n++) {
    let acc = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.lp = y * 0.7 + c.lp * 0.3;
      c.buf[c.i] = inp[n] + c.lp * 0.84;
      c.i = (c.i + 1) % c.d;
      acc += y;
    }
    out[n] = acc / combs.length;
  }
  for (const d of [225, 556, 441]) {
    const dd = Math.round((d + offs) * SR / 44100), buf = new Float32Array(dd);
    let i = 0;
    for (let n = 0; n < N; n++) {
      const b = buf[i], x = out[n];
      const y = -0.5 * x + b;
      buf[i] = x + 0.5 * y;
      out[n] = y; i = (i + 1) % dd;
    }
  }
  return out;
}
const WL = reverb(VL, 0), WR = reverb(VR, 23);

// ---------- master ----------
let peak = 0;
const ML = new Float32Array(N), MR = new Float32Array(N);
for (let n = 0; n < N; n++) {
  const t = n / SR;
  const fade = t > DUR - 0.5 ? (DUR - t) / 0.5 : 1;
  ML[n] = Math.tanh((L[n] + WL[n] * 0.9) * 0.9) * fade;
  MR[n] = Math.tanh((R[n] + WR[n] * 0.9) * 0.9) * fade;
  peak = Math.max(peak, Math.abs(ML[n]), Math.abs(MR[n]));
}
const norm = 0.89 / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVE", 8);
buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) {
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, ML[n] * norm)) * 32767), 44 + n * 4);
  buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, MR[n] * norm)) * 32767), 46 + n * 4);
}
mkdirSync("assets/audio", { recursive: true });
writeFileSync("assets/audio/score-b.wav", buf);
console.log(`score-b.wav written — ${DUR}s, peak normalised from ${peak.toFixed(2)}`);
