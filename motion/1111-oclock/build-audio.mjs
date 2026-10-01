// Synthesises the score for the 11:11 reel: every cue is placed on the same
// timestamps as the GSAP timeline in index.html. Output: assets/audio/score.wav
import { writeFileSync, mkdirSync } from "node:fs";

const SR = 48000;
const DUR = 15;
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

// ---------- score (timestamps mirror index.html) ----------
const A2 = 110, E3 = 164.81, Gs3 = 207.65, Cs4 = 277.18, E4 = 329.63, B4 = 493.88, Cs5 = 554.37, E5 = 659.25, B5 = 987.77, E6 = 1318.5, Gs5 = 830.61, A5 = 880;

// 01 flip
pad(0, 6.1, [A2, E3, B4], 0.9, 1.2, 0.4);
whoosh(0, 0.5, 0.35, false);
[0, 0.06, 0.12, 0.18, 0.24].forEach((t, i) => clack(t + 0.32, 0.55, -0.4 + i * 0.2));
const fast = [0.42, 0.53, 0.64, 0.75, 0.86, 0.97];
fast.forEach((t) => { clack(t, 0.35, 0.35); clack(t + 0.1, 0.5, 0.35); });
[[1.18, 0.26], [1.55, 0.3], [2.0, 0.32]].forEach(([t, d]) => { clack(t, 0.5, 0.35); clack(t + d, 0.95, 0.35); });
clack(1.55, 0.45, 0.1); clack(1.85, 0.8, 0.1);
impact(2.32, 0.95);
[E5, B5, E6, B5 * 2].forEach((f, i) => bell(2.34 + i * 0.075, f, 0.8 - i * 0.08, -0.5 + i * 0.33, 1.1));
whoosh(2.55, 3.02, 0.9, true, -0.3, 0.3);
whoosh(2.98, 3.5, 0.6, false, 0.3, -0.3);

// 02 clock — mechanical whirr: one click every 30° of minute-hand travel
const expoInOut = (p) => p === 0 ? 0 : p === 1 ? 1 : p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2;
{
  const total = 360 * 11 + 66, start = 3.3, dur = 1.7;
  let next = 0;
  for (let k = 0; k <= 4000; k++) {
    const p = k / 4000, ang = expoInOut(p) * total;
    if (ang >= next) { clack(start + p * dur, 0.18 + 0.12 * Math.sin(Math.PI * p), Math.sin(next / 57) * 0.5); next += 30; }
  }
}
for (let t = 3.1; t < 3.3; t += 0.06) hat(t, 0.5);
whoosh(3.6, 4.95, 0.55, true, -0.7, 0.7);
impact(5.0, 1.0);
[A5, Cs5 * 2, E6].forEach((f, i) => bell(5.0 + i * 0.03, f, 0.75, -0.4 + i * 0.4, 1.6));
for (let t = 5.0; t < 5.5; t += 0.125) hat(t + 0.0625, 0.6, -0.2);
whoosh(5.45, 6.0, 1.0, true, 0, 0);

// 03 type hits
[6.0, 6.4, 6.8, 7.2].forEach((t, i) => { impact(t, 0.75, 0.3); kick(t, 0.9); clack(t, 0.7, (i % 2 ? 0.5 : -0.5)); });
pad(6.0, 9.1, [A2 / 2, E3 / 2], 1.3, 0.05, 0.3);
bell(7.2, Gs5, 0.6, 0, 1.2);
whoosh(7.6, 8.05, 0.8, true, -0.8, 0.8);
for (let b = 0; b < 3; b++) kick(7.8 + b * 0.5, 1.0);
for (let t = 7.8; t < 9.05; t += 0.125) hat(t, (Math.round((t - 7.8) / 0.125) % 2 ? 0.9 : 0.45), 0.25);
clap(8.3, 0.9); clap(8.8, 0.9);
[E4, Gs3 * 2, B4, Cs5, E5, B4, Cs5, E5].forEach((f, i) => bell(7.8 + i * 0.15, f, 0.35, (i % 2 ? 0.4 : -0.4), 0.5));
whoosh(8.85, 9.32, 0.9, true, 0.5, -0.5);
bell(9.22, E6, 0.6, 0, 0.8); bell(9.24, B5 * 2, 0.4, 0.3, 0.8);

// 04 wish
pad(9.4, 11.0, [E5, Gs5, B5], 0.6, 0.4, 0.2);
[1.0, 1.5, 2.0, 2.5, 3.0].forEach((m, i) => bell(9.55 + i * 0.09, E5 * m * (i % 2 ? 1 : 1), 0.25, -0.6 + i * 0.3, 0.9));
riser(9.7, 11.0, 0.85);
whoosh(10.25, 11.0, 0.9, true, -0.9, 0);
for (let i = 0; i < 12; i++) bell(10.3 + i * 0.06, 2200 + rnd() * 2600, 0.18, -0.8 + i * 0.13, 0.4);

// 05 lockup
impact(11.0, 1.2, 0.8);
kick(11.0, 0.8);
pad(11.0, 15, [A2, E3, Gs3, Cs4, B4, E5], 1.1, 0.05, 1.2);
[A5, Cs5 * 2, E6, Gs5 * 2].forEach((f, i) => bell(11.02 + i * 0.05, f, 0.7, -0.5 + i * 0.33, 2.2));
whoosh(11.4, 12.0, 0.35, false, -0.4, 0.4);
bell(11.95, E5, 0.35, 0.4, 1.4);
for (let i = 0; i < 19; i++) blip(12.45 + i * 0.03, 0.12);
whoosh(12.85, 13.75, 0.4, true, -0.8, 0.8);
bell(13.3, E6 * 1.5, 0.35, 0.6, 1.6);
for (let t = 13.5; t < 14.8; t += 0.5) clack(t, 0.18, (Math.round(t * 2) % 2 ? 0.3 : -0.3));

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
writeFileSync("assets/audio/score.wav", buf);
console.log(`score.wav written — ${DUR}s, peak normalised from ${peak.toFixed(2)}`);
