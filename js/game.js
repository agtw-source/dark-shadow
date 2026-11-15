/* DARK SHADOW — prototipo di picchiaduro a scorrimento in stile 16-bit.
   HTML5 canvas + Web Audio, nessuna libreria esterna. */
'use strict';

// ---------------------------------------------------------------- setup
const W = 640, H = 360;
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;
const FONT = '"Press Start 2P", monospace';

function fit() {
  const s = Math.min(window.innerWidth / W, window.innerHeight / H);
  const k = s >= 1 ? Math.floor(s * 4) / 4 : s;
  cv.style.width = Math.floor(W * k) + 'px';
  cv.style.height = Math.floor(H * k) + 'px';
}
window.addEventListener('resize', fit); fit();

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
let seed = 7;
const srand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

// ---------------------------------------------------------------- assets
const IMG = {};
const NAMES = ['idle', 'walk', 'guard', 'crouch', 'jump', 'win', 'attack', 'special', 'projbody', 'orb', 'super', 'face', 'portrait', 'castle'];
// anchor x (punto dei piedi) e scala per ogni posa del protagonista
const FR = {
  idle: { ax: 40 }, walk: { ax: 43 }, guard: { ax: 40, s: 1.08 }, crouch: { ax: 46 },
  jump: { ax: 62 }, win: { ax: 46 }, attack: { ax: 30 }, special: { ax: 48 },
  projbody: { ax: 34, s: 1.05 }, super: { ax: 98 },
};
function whiteOf(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
  return c;
}
function loadAll() {
  return Promise.all(NAMES.map(n => new Promise(res => {
    const i = new Image(); i.onload = () => { IMG[n] = i; res(); }; i.onerror = res; i.src = 'assets/' + n + '.png';
  })));
}

// ---------------------------------------------------------------- audio
const Audio_ = {
  ac: null, master: null, muted: false, musicOn: false, nextT: 0, step: 0, track: 'stage',
  init() {
    if (this.ac) { if (this.ac.state === 'suspended') this.ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ac = new AC(); this.master = this.ac.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ac.destination);
    this.noiseBuf = this.ac.createBuffer(1, this.ac.sampleRate * 0.5, this.ac.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  },
  toggle() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.5; },
  tone(f, t, dur, type = 'square', vol = 0.12, slide = 0) {
    const a = this.ac; if (!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(t, dur, vol = 0.15, freq = 3000) {
    const a = this.ac; if (!a) return;
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = this.noiseBuf; f.type = 'bandpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur);
  },
  sfx(name) {
    if (!this.ac || this.muted) return; const t = this.ac.currentTime;
    switch (name) {
      case 'swing': this.noise(t, 0.12, 0.12, 1800); break;
      case 'hit': this.noise(t, 0.1, 0.3, 900); this.tone(140, t, 0.1, 'square', 0.15, 0.5); break;
      case 'heavy': this.noise(t, 0.25, 0.35, 500); this.tone(90, t, 0.25, 'sawtooth', 0.2, 0.4); break;
      case 'hurt': this.tone(300, t, 0.18, 'sawtooth', 0.12, 0.4); break;
      case 'jump': this.tone(220, t, 0.15, 'square', 0.08, 2); break;
      case 'orb': this.tone(600, t, 0.35, 'sawtooth', 0.1, 0.25); this.tone(900, t, 0.3, 'square', 0.05, 0.3); break;
      case 'arc': this.noise(t, 0.4, 0.25, 2500); this.tone(200, t, 0.4, 'sawtooth', 0.12, 3); break;
      case 'super': for (let i = 0; i < 6; i++) this.tone(110 * (i + 1), t + i * 0.06, 0.8, 'sawtooth', 0.08, 0.3); this.noise(t, 1.2, 0.3, 300); break;
      case 'block': this.tone(1200, t, 0.06, 'square', 0.08); break;
      case 'ko': this.tone(400, t, 0.5, 'square', 0.12, 0.2); break;
      case 'go': this.tone(660, t, 0.1, 'square', 0.1); this.tone(880, t + 0.12, 0.15, 'square', 0.1); break;
      case 'start': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, t + i * 0.08, 0.2, 'square', 0.1)); break;
      case 'enemyshot': this.tone(400, t, 0.25, 'triangle', 0.15, 0.5); break;
      case 'pickup': [880, 1100, 1320].forEach((f, i) => this.tone(f, t + i * 0.05, 0.12, 'square', 0.08)); break;
    }
  },
  // musica chiptune originale: progressione in La minore
  startMusic(track = 'stage') { this.track = track; this.musicOn = true; this.step = 0; if (this.ac) this.nextT = this.ac.currentTime + 0.1; },
  stopMusic() { this.musicOn = false; },
  tick() {
    if (!this.ac || !this.musicOn || this.muted) return;
    const boss = this.track === 'boss';
    const spb = (boss ? 60 / 152 : 60 / 132) / 4;
    const N = f => 440 * Math.pow(2, (f - 69) / 12);
    const prog = boss ? [45, 46, 45, 44] : [45, 41, 43, 40]; // A, F, G, E (boss: A, Bb, A, G#)
    const lead = boss
      ? [69, 0, 72, 0, 70, 69, 0, 67, 69, 0, 72, 75, 74, 72, 70, 0]
      : [69, 0, 72, 76, 74, 0, 72, 71, 72, 0, 69, 0, 67, 69, 71, 0];
    while (this.nextT < this.ac.currentTime + 0.12) {
      const s = this.step, t = this.nextT, bar = Math.floor(s / 16) % 4, i = s % 16;
      const root = prog[bar];
      if (i % 2 === 0) this.tone(N(root - 12 + (i % 4 === 2 ? 12 : 0)), t, spb * 1.8, 'triangle', 0.22);
      const arp = [0, 3, 7, 12][i % 4] + (bar === 3 && !boss ? 1 : 0);
      this.tone(N(root + 12 + arp), t, spb * 0.9, 'square', 0.025);
      const L = lead[(i + (bar % 2) * 3) % 16];
      if (L && (Math.floor(s / 64) % 2 === 1 || boss)) this.tone(N(L + (bar === 1 ? -4 : bar === 2 ? -2 : bar === 3 ? -5 : 0)), t, spb * 1.6, 'square', 0.04);
      if (i % 4 === 0) this.tone(150, t, 0.12, 'sine', 0.3, 0.3);
      if (i % 8 === 4) this.noise(t, 0.12, 0.12, 1500);
      if (i % 2 === 1) this.noise(t, 0.03, 0.04, 8000);
      this.nextT += spb; this.step++;
    }
  },
};

// ---------------------------------------------------------------- input
const keys = {}, pressed = {};
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  KeyZ: 'attack', KeyJ: 'attack', KeyX: 'jump', KeyK: 'jump', Space: 'jump', KeyC: 'arc', KeyL: 'arc',
  KeyV: 'orb', KeyU: 'orb', KeyB: 'super', KeyI: 'super', ShiftLeft: 'guard', ShiftRight: 'guard', KeyH: 'guard',
  Enter: 'start', KeyP: 'pause', Escape: 'pause', KeyM: 'mute',
};
function press(a) { if (!keys[a]) pressed[a] = true; keys[a] = true; Audio_.init(); }
function release(a) { keys[a] = false; }
window.addEventListener('keydown', e => { const a = KEYMAP[e.code]; if (a) { e.preventDefault(); press(a); } });
window.addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) release(a); });
const consume = a => { const p = pressed[a]; pressed[a] = false; return p; };

// touch
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) document.body.classList.add('touch');
document.querySelectorAll('#touch .b').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); b.classList.add('on'); if (k === 'pause' || k === 'mute') press(k); else { press(k); press('start'); } };
  const off = e => { e.preventDefault(); b.classList.remove('on'); release(k); release('start'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
});
const stick = document.getElementById('stick'), knob = document.getElementById('knob');
let stickId = null;
function stickMove(e) {
  const r = stick.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = e.clientX - cx, dy = e.clientY - cy; const m = Math.hypot(dx, dy), max = r.width / 2 - 10;
  if (m > max) { dx *= max / m; dy *= max / m; }
  knob.style.transform = `translate(${dx}px,${dy}px)`;
  const th = 18;
  dx < -th ? press('left') : release('left'); dx > th ? press('right') : release('right');
  dy < -th ? press('up') : release('up'); dy > th ? press('down') : release('down');
}
stick.addEventListener('pointerdown', e => { e.preventDefault(); stickId = e.pointerId; stick.setPointerCapture(e.pointerId); stickMove(e); });
stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) stickMove(e); });
const stickEnd = e => { if (e.pointerId !== stickId) return; stickId = null; knob.style.transform = ''; ['left', 'right', 'up', 'down'].forEach(release); };
stick.addEventListener('pointerup', stickEnd); stick.addEventListener('pointercancel', stickEnd);
cv.addEventListener('pointerdown', () => { press('start'); setTimeout(() => release('start'), 50); });

// gamepad
const PADMAP = { 0: 'attack', 1: 'jump', 2: 'arc', 3: 'orb', 4: 'guard', 5: 'super', 9: 'start', 8: 'pause', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
const padPrev = {};
function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; const p = pads && pads[0]; if (!p) return;
  const st = {};
  for (const i in PADMAP) if (p.buttons[i] && p.buttons[i].pressed) st[PADMAP[i]] = true;
  if (p.axes[0] < -0.4) st.left = true; if (p.axes[0] > 0.4) st.right = true;
  if (p.axes[1] < -0.4) st.up = true; if (p.axes[1] > 0.4) st.down = true;
  for (const a of new Set([...Object.values(PADMAP), 'left', 'right', 'up', 'down'])) {
    if (st[a] && !padPrev[a]) press(a); if (!st[a] && padPrev[a]) release(a); padPrev[a] = !!st[a];
  }
}

// ---------------------------------------------------------------- nemici: pixel art procedurale originale
const U = 2; // dimensione del "pixel" dei nemici
function limbPts(x0, y0, x1, y1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1), pts = [];
  for (let i = 0; i <= n; i++) pts.push([Math.round(x0 + (x1 - x0) * i / n), Math.round(y0 + (y1 - y0) * i / n)]);
  return pts;
}
function renderHumanoid(T, pose) {
  const shapes = [];
  const R = (x, y, w, h, c, out = true) => shapes.push({ x, y, w, h, c, out });
  const limb = (x0, y0, x1, y1, w, c) => limbPts(x0, y0, x1, y1).forEach(([x, y]) => R(x - (w >> 1), y, w, 1, c));
  const p = Object.assign({ legF: 2, legB: -2, kneeF: 1, kneeB: 1, lean: 0, hand: 'rest', backHand: 'rest', head: 0, crouch: 0 }, pose);
  const hipY = -22 + p.crouch, sh = -38 + p.crouch, L = p.lean;
  // gambe
  if (!T.robe) {
    limb(-2, hipY, -2 + p.legB * 0.5 + p.kneeB, hipY + 11, 6, T.pants2);
    limb(-2 + p.legB * 0.5 + p.kneeB, hipY + 11, -2 + p.legB, -2, 5, T.pants2);
    R(-3 + p.legB, -2, 6, 2, T.shoe);
    limb(3, hipY, 3 + p.legF * 0.5 + p.kneeF, hipY + 11, 6, T.pants);
    limb(3 + p.legF * 0.5 + p.kneeF, hipY + 11, 3 + p.legF, -2, 5, T.pants);
    R(1 + p.legF, -2, 6, 2, T.shoe);
  } else {
    R(-4 + p.legB, -2, 5, 2, T.shoe); R(p.legF, -2, 5, 2, T.shoe);
    for (let y = hipY - 2; y < -1; y++) { const t = (y - hipY + 2) / (-hipY); const hw = Math.round(7 + t * 4); R(-hw + L * (1 - t), y, hw * 2, 1, T.coat); }
  }
  // braccio dietro
  const handPos = (h, side) => {
    const bx = L + (side ? 3 : -3);
    switch (h) {
      case 'punch': return [bx + 13, sh + 3];
      case 'wind': return [bx - 6, sh + 6];
      case 'up': return [bx + 4, sh - 10];
      case 'cast': return [bx + 11, sh - 2];
      case 'hurt': return [bx - 5, sh - 4];
      case 'guard': return [bx + 6, sh - 1];
      default: return [bx + (side ? 2 : -1), sh + 15];
    }
  };
  let [hx, hy] = handPos(p.backHand, 0);
  limb(-4 + L, sh + 1, hx, hy, 5, T.coat2); R(hx - 1, hy - 1, 3, 3, T.skin);
  // busto
  for (let y = sh; y < hipY + 1; y++) { const t = (y - sh) / (hipY - sh); R(-6 + Math.round(L * (1 - t)), y, 13 + (T.big ? 3 : 0) - Math.round(t * 2), 1, T.coat); }
  R(-6 + L, sh, 13 + (T.big ? 3 : 0), 2, T.coat2, false);
  if (T.belt) R(-5, hipY - 2, 11 + (T.big ? 3 : 0), 2, T.belt);
  if (T.trim) { for (let y = sh + 1; y < hipY; y++) R(Math.round(L * (1 - (y - sh) / (hipY - sh))) + 1, y, 1, 1, T.trim, false); }
  // testa
  const hx0 = L + 1 + p.head, hy0 = sh - 9;
  R(hx0 - 1, sh - 2, 4, 3, T.skin);
  if (T.hood) {
    R(hx0 - 6, hy0 - 3, 12, 12, T.hood);
    R(hx0 - 1, hy0 + 2, 6, 6, '#0b0610', false);
    R(hx0 + 1, hy0 + 4, 1, 1, T.eye, false); R(hx0 + 3, hy0 + 4, 1, 1, T.eye, false);
    if (T.horns) { R(hx0 - 6, hy0 - 6, 2, 5, T.horns); R(hx0 + 4, hy0 - 6, 2, 5, T.horns); R(hx0 - 3, hy0 - 4, 6, 2, T.horns); }
  } else {
    R(hx0 - 3, hy0, 8, 9, T.skin);
    R(hx0 - 3, hy0 - 1, 8, 3, T.hair);
    if (T.cap) R(hx0 - 3, hy0 - 2, 9, 3, T.cap);
    if (T.bandana) R(hx0 - 3, hy0 + 5, 8, 3, T.bandana, false);
    R(hx0 + 3, hy0 + 3, 1, 1, '#140a10', false);
    if (T.mask) { R(hx0 - 3, hy0 + 1, 8, 6, T.mask, false); R(hx0 + 1, hy0 + 3, 1, 1, '#000', false); R(hx0 + 3, hy0 + 3, 1, 1, '#000', false); }
  }
  // braccio davanti
  [hx, hy] = handPos(p.hand, 1);
  limb(4 + L, sh + 1, hx, hy, 5, T.coat); R(hx - 1, hy - 1, 3 + (T.big ? 1 : 0), 3 + (T.big ? 1 : 0), T.skin);
  if (T.blade && (p.hand === 'punch' || p.hand === 'wind')) R(hx + 2, hy, 6, 1, '#d8e0ff');
  // render
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  shapes.forEach(s => { x0 = Math.min(x0, s.x - 1); y0 = Math.min(y0, s.y - 1); x1 = Math.max(x1, s.x + s.w + 1); y1 = Math.max(y1, s.y + s.h + 1); });
  const pad = 2, c = document.createElement('canvas');
  const cw = Math.max(Math.abs(x0), Math.abs(x1)) * 2 + pad * 2;
  c.width = cw * U; c.height = (-y0 + pad) * U; const g = c.getContext('2d');
  const ox = cw / 2, oy = -y0 + pad;
  g.fillStyle = '#0b0610';
  shapes.forEach(s => { if (s.out) g.fillRect((s.x + ox - 1) * U, (s.y + oy - 1) * U, (s.w + 2) * U, (s.h + 2) * U); });
  shapes.forEach(s => { g.fillStyle = s.c; g.fillRect((s.x + ox) * U, (s.y + oy) * U, s.w * U, s.h * U); });
  // ombreggiatura semplice: luce viola da sinistra
  g.globalCompositeOperation = 'source-atop';
  const gr = g.createLinearGradient(0, 0, c.width, 0); gr.addColorStop(0, 'rgba(150,90,255,0.18)'); gr.addColorStop(0.6, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = gr; g.fillRect(0, 0, c.width, c.height);
  return { img: c, ax: ox * U, white: whiteOf(c) };
}
function rotated(fr) {
  const c = document.createElement('canvas'); c.width = fr.img.height; c.height = fr.img.width; const g = c.getContext('2d');
  g.translate(0, c.height); g.rotate(-Math.PI / 2); g.drawImage(fr.img, 0, 0);
  return { img: c, ax: c.width / 2, white: whiteOf(c) };
}
const ETYPES = {
  thug: { name: 'TEPPISTA', hp: 34, speed: 1.15, dmg: 7, reach: 46, score: 300, scale: 1,
    look: { skin: '#d9a07a', hair: '#2a1a12', cap: '#3a3a48', coat: '#6e2a2a', coat2: '#4e1c1e', pants: '#2c3c66', pants2: '#22304f', shoe: '#1a1414', belt: '#1a1414', bandana: '#b8b8c8' } },
  punk: { name: 'RIBELLE', hp: 30, speed: 1.4, dmg: 6, reach: 44, score: 300, scale: 0.95,
    look: { skin: '#c48a64', hair: '#38e070', coat: '#2a2a30', coat2: '#1c1c22', pants: '#4a2e5e', pants2: '#3a2448', shoe: '#7a1e1e', belt: '#888', trim: '#c0c0c8' } },
  cultist: { name: 'ACCOLITO', hp: 38, speed: 1.0, dmg: 8, reach: 48, score: 450, scale: 1, ranged: true, blade: true,
    look: { skin: '#a88', hood: '#8a1622', eye: '#ffcc33', coat: '#6e1018', coat2: '#4a0a10', shoe: '#1a1414', robe: true, trim: '#d4a020' } },
  brute: { name: 'BRUTO', hp: 80, speed: 0.75, dmg: 14, reach: 54, score: 800, scale: 1.25, heavy: true,
    look: { skin: '#b07850', hair: '#111', coat: '#3e4a3a', coat2: '#2c362a', pants: '#3a2c22', pants2: '#2c2018', shoe: '#111', belt: '#6a4a20', big: true, mask: '#c8c8c0' } },
  boss: { name: 'GRAN MAESTRO VEXOR', hp: 420, speed: 1.1, dmg: 12, reach: 56, score: 5000, scale: 1.38, ranged: true, boss: true, heavy: true,
    look: { skin: '#e8e0d0', hood: '#16101e', eye: '#ff3040', coat: '#221830', coat2: '#140e1e', shoe: '#000', robe: true, trim: '#e0b030', horns: '#e0b030', big: true } },
};
const POSES = {
  idle: {}, walk1: { legF: 5, legB: -5, kneeF: 0, kneeB: 2, lean: 1 }, walk2: { legF: -2, legB: 2, kneeF: 2, kneeB: 0 },
  wind: { hand: 'wind', lean: -2, legF: 4, legB: -4 }, punch: { hand: 'punch', backHand: 'guard', lean: 3, legF: 6, legB: -5 },
  hurt: { hand: 'hurt', backHand: 'hurt', lean: -4, head: -2, legF: 3, legB: -3 }, cast: { hand: 'cast', backHand: 'up', lean: 1 },
  getup: { crouch: 6, hand: 'rest', lean: 2 },
};
const EFR = {};
function buildEnemyFrames() {
  for (const k in ETYPES) {
    EFR[k] = {};
    for (const p in POSES) EFR[k][p] = renderHumanoid(ETYPES[k].look, POSES[p]);
    EFR[k].down = rotated(EFR[k].hurt);
  }
}

// ---------------------------------------------------------------- scenario (città gotica originale)
const WORLD = 3700;
const FLOOR_TOP = 238, FLOOR_BOT = 344;
const LAYERS = {};
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function buildBackground() {
  seed = 1234;
  // cielo
  let [c, g] = mkCanvas(W, H);
  let gr = g.createLinearGradient(0, 0, 0, 240);
  gr.addColorStop(0, '#0a0418'); gr.addColorStop(0.55, '#2a1048'); gr.addColorStop(1, '#6a2a6a');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) { g.fillStyle = srand() < 0.2 ? '#ffe' : '#a89cc8'; g.fillRect(Math.floor(srand() * W), Math.floor(srand() * 150), 1, 1); }
  // luna
  g.fillStyle = 'rgba(200,160,255,0.12)'; g.beginPath(); g.arc(470, 70, 62, 0, 7); g.fill();
  g.fillStyle = '#d9c6f2'; g.beginPath(); g.arc(470, 70, 40, 0, 7); g.fill();
  g.fillStyle = '#b9a2de'; [[458, 60, 8], [484, 82, 6], [476, 52, 4], [452, 86, 5]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); });
  // nubi a strisce
  g.fillStyle = 'rgba(40,16,60,0.85)';
  for (let i = 0; i < 7; i++) { const y = 40 + i * 22, x = srand() * W; g.fillRect(x - 120, y, 240, 3); g.fillRect(x - 70, y - 2, 130, 2); }
  LAYERS.sky = c;

  // livello lontano: guglie e cattedrali
  const farW = Math.ceil(WORLD * 0.2 + W);
  [c, g] = mkCanvas(farW, H);
  for (let x = 0; x < farW;) {
    const w = 30 + srand() * 50, h = 60 + srand() * 90, base = 230;
    g.fillStyle = '#2b1640';
    g.fillRect(x, base - h, w, h);
    g.beginPath(); g.moveTo(x - 2, base - h); g.lineTo(x + w / 2, base - h - 25 - srand() * 40); g.lineTo(x + w + 2, base - h); g.fill();
    if (srand() < 0.35) { const tx = x + w / 2 - 4; g.fillRect(tx, base - h - 70, 8, 40); g.beginPath(); g.moveTo(tx - 2, base - h - 70); g.lineTo(tx + 4, base - h - 105); g.lineTo(tx + 10, base - h - 70); g.fill(); }
    g.fillStyle = '#e6b84a';
    for (let k = 0; k < 3; k++) if (srand() < 0.5) g.fillRect(x + 6 + srand() * (w - 12), base - h + 10 + srand() * (h - 20), 2, 3);
    x += w + srand() * 8;
  }
  LAYERS.far = c;

  // livello medio: case a schiera
  const midW = Math.ceil(WORLD * 0.5 + W);
  [c, g] = mkCanvas(midW, H);
  for (let x = 0; x < midW;) {
    const w = 70 + Math.floor(srand() * 70), h = 90 + Math.floor(srand() * 60), base = 236;
    const tone = ['#1d1030', '#22122e', '#1a0f2a'][Math.floor(srand() * 3)];
    g.fillStyle = tone; g.fillRect(x, base - h, w, h);
    g.beginPath(); g.moveTo(x - 4, base - h); g.lineTo(x + w / 2, base - h - 30); g.lineTo(x + w + 4, base - h); g.fill();
    g.fillStyle = '#120a1c'; g.fillRect(x, base - h, 3, h); g.fillRect(x - 4, base - h, w + 8, 3);
    for (let wy = base - h + 14; wy < base - 30; wy += 26) for (let wx = x + 10; wx < x + w - 16; wx += 22) {
      const lit = srand() < 0.4;
      g.fillStyle = '#0c0614'; g.fillRect(wx - 1, wy - 1, 12, 18);
      g.fillStyle = lit ? (srand() < 0.7 ? '#f0c060' : '#c070ff') : '#2a1c40'; g.fillRect(wx, wy + 3, 10, 14);
      g.beginPath(); g.arc(wx + 5, wy + 4, 5, Math.PI, 0); g.fill();
      if (lit) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(wx + 4, wy, 2, 17); }
    }
    g.fillStyle = '#0c0614'; g.fillRect(x + w / 2 - 8, base - 28, 16, 28);
    x += w + 6 + Math.floor(srand() * 20);
  }
  LAYERS.mid = c;

  // primo piano: marciapiede, strada a ciottoli, lampioni
  const nearW = WORLD + W;
  [c, g] = mkCanvas(nearW, H);
  g.fillStyle = '#140c1e'; g.fillRect(0, 196, nearW, 36);
  // muro con archi
  for (let x = 0; x < nearW; x += 96) {
    g.fillStyle = '#21162e'; g.fillRect(x, 168, 96, 64);
    g.fillStyle = '#0d0716'; g.fillRect(x + 14, 186, 68, 46); g.beginPath(); g.arc(x + 48, 186, 34, Math.PI, 0); g.fill();
    g.fillStyle = '#2e2040'; g.fillRect(x, 164, 96, 6); g.fillRect(x, 168, 6, 64);
    g.fillStyle = '#3a2a50'; for (let b = 0; b < 4; b++) g.fillRect(x + 6 + b * 22, 166, 14, 2);
    // inferriata
    g.fillStyle = '#05030a'; for (let b = x + 18; b < x + 80; b += 7) { g.fillRect(b, 192, 2, 40); g.fillRect(b - 1, 190, 4, 3); }
  }
  g.fillStyle = '#3a2c48'; g.fillRect(0, 228, nearW, 10);
  g.fillStyle = '#5a4870'; g.fillRect(0, 228, nearW, 2);
  g.fillStyle = '#1a1024'; g.fillRect(0, 238, nearW, 3);
  gr = g.createLinearGradient(0, 240, 0, H); gr.addColorStop(0, '#2a1e36'); gr.addColorStop(1, '#3c2c4a');
  g.fillStyle = gr; g.fillRect(0, 240, nearW, H - 240);
  for (let y = 244, r = 0; y < H; y += 9 + r, r++) {
    const off = (r % 2) * 9;
    for (let x = -off; x < nearW; x += 18 + r) {
      g.fillStyle = srand() < 0.5 ? '#46365a' : '#3e304f'; g.fillRect(x + 1, y + 1, 15 + r, 6 + r * 0.6);
      g.fillStyle = '#5a4870'; g.fillRect(x + 2, y + 1, 10, 1);
    }
  }
  // pozzanghere
  for (let i = 0; i < 26; i++) { const x = srand() * nearW, y = 260 + srand() * 80; g.fillStyle = 'rgba(140,90,220,0.25)'; g.beginPath(); g.ellipse(x, y, 26 + srand() * 20, 4, 0, 0, 7); g.fill(); }
  LAYERS.near = c;

  // lampioni (disegnati sopra i personaggi lontani)
  LAYERS.lamps = [];
  for (let x = 160; x < WORLD + W; x += 300) LAYERS.lamps.push(x);
}
function drawLamp(x) {
  const y = 232;
  const gl = ctx.createRadialGradient(x, y - 112, 2, x, y - 112, 60);
  gl.addColorStop(0, 'rgba(255,214,140,0.45)'); gl.addColorStop(0.35, 'rgba(255,190,110,0.12)'); gl.addColorStop(1, 'rgba(255,190,110,0)');
  ctx.fillStyle = gl; ctx.fillRect(x - 60, y - 172, 120, 120);
  ctx.fillStyle = '#0a0610'; ctx.fillRect(x - 2, y - 104, 4, 104); ctx.fillRect(x - 6, y - 6, 12, 6); ctx.fillRect(x - 8, y - 100, 16, 3);
  ctx.fillStyle = '#ffdc8a'; ctx.fillRect(x - 5, y - 118, 10, 14);
  ctx.fillStyle = '#0a0610'; ctx.fillRect(x - 7, y - 121, 14, 3); ctx.fillRect(x - 1, y - 118, 2, 14);
}

// ---------------------------------------------------------------- stato di gioco
const G = {
  mode: 'title', t: 0, camX: 0, lockX: null, shake: 0, flash: 0, flashCol: '#fff', hitstop: 0,
  wave: 0, waveActive: false, go: 0, score: 0, lives: 3, banner: null, paused: false, superFx: 0, endT: 0, continueT: 0,
};
const WAVES = [
  { x: 120, list: ['thug', 'thug', 'punk'] },
  { x: 760, list: ['punk', 'thug', 'cultist', 'thug'] },
  { x: 1400, list: ['cultist', 'thug', 'punk', 'cultist', 'brute'] },
  { x: 2100, list: ['brute', 'cultist', 'punk', 'thug', 'cultist', 'punk'] },
  { x: 2800, list: ['cultist', 'cultist', 'brute', 'punk', 'thug', 'brute'] },
  { x: WORLD - W, list: ['boss', 'cultist', 'cultist'], boss: true },
];
let P, enemies = [], shots = [], fx = [], pickups = [], atkId = 0;

function newPlayer() {
  return { x: 140, y: 290, z: 0, vz: 0, vx: 0, face: 1, hp: 100, mp: 30, state: 'idle', t: 0, combo: 0, comboT: 0,
    inv: 0, hitFlash: 0, atk: null, walkT: 0, jumpAtk: false };
}
function resetGame() {
  P = newPlayer(); enemies = []; shots = []; fx = []; pickups = [];
  Object.assign(G, { camX: 0, lockX: null, wave: 0, waveActive: false, go: 0, score: 0, lives: 3, banner: { text: 'ROUND 1  -  CITTÀ VECCHIA', t: 150 }, superFx: 0, endT: 0 });
  Audio_.startMusic('stage');
}

// ---------------------------------------------------------------- player
function setP(state, t = 0) { P.state = state; P.t = t; P.atk = null; P.buf = false; }
function playerAttack(type) {
  atkId++;
  const A = {
    jab: { from: 18, to: 102, dmg: 9, kb: 2.2, down: false, on: [5, 9], len: 16, frame: 'attack', mp: 0 },
    jab2: { from: 18, to: 106, dmg: 10, kb: 2.6, down: false, on: [5, 9], len: 17, frame: 'attack', mp: 0 },
    finisher: { from: 10, to: 112, dmg: 16, kb: 6, down: true, on: [6, 11], len: 24, frame: 'attack', mp: 0, heavy: true },
    jump: { from: -10, to: 60, dmg: 14, kb: 4, down: true, on: [0, 40], len: 999, frame: 'jump', mp: 0 },
    arc: { from: 10, to: 140, dmg: 22, kb: 7, down: true, on: [7, 16], len: 30, frame: 'special', mp: 25, heavy: true },
  }[type];
  P.atk = Object.assign({ id: atkId, type }, A);
}
function updatePlayer() {
  P.t++; if (P.inv > 0) P.inv--; if (P.hitFlash > 0) P.hitFlash--;
  if (P.comboT > 0) P.comboT--; else P.combo = 0;
  P.mp = Math.min(100, P.mp + 0.025);
  const mvx = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), mvy = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  const free = P.state === 'idle' || P.state === 'walk';
  if (free) {
    if (consume('super') && P.mp >= 100) { P.mp = 0; setP('super'); Audio_.sfx('super'); G.superFx = 70; G.flash = 10; G.flashCol = '#b060ff'; G.shake = 30; P.inv = 90; }
    else if (consume('arc') && P.mp >= 25) { P.mp -= 25; setP('special'); playerAttack('arc'); Audio_.sfx('arc'); }
    else if (consume('orb') && P.mp >= 12) { P.mp -= 12; setP('cast'); }
    else if (consume('attack')) {
      const t = P.combo >= 2 ? 'finisher' : P.combo === 1 ? 'jab2' : 'jab';
      P.combo = (P.combo + 1) % 3; P.comboT = 40; setP('attack'); playerAttack(t); Audio_.sfx('swing');
    } else if (consume('jump')) { setP('jump'); P.vz = 7.2; P.vx = mvx * 2.6; P.jumpAtk = false; Audio_.sfx('jump'); }
    else if (keys.guard) setP('guard');
    else if (mvx || mvy) {
      P.state = 'walk'; P.walkT++;
      P.x += mvx * 2.4; P.y += mvy * 1.6; if (mvx) P.face = mvx;
    } else P.state = 'idle';
  }
  switch (P.state) {
    case 'attack': case 'special':
      if (P.atk && P.t >= P.atk.len) setP('idle');
      if (P.state === 'attack' && consume('attack')) P.buf = true;
      if (P.state === 'attack' && P.t > 8 && P.buf && P.combo !== 0) { // combo concatenata
        P.buf = false;
        const t = P.combo >= 2 ? 'finisher' : 'jab2'; P.combo = (P.combo + 1) % 3; P.comboT = 40; setP('attack'); playerAttack(t); Audio_.sfx('swing');
      }
      break;
    case 'cast':
      if (P.t === 8) { shots.push({ x: P.x + P.face * 70, y: P.y, z: 58, vx: P.face * 6.5, own: 'p', life: 90, dmg: 18, id: ++atkId }); Audio_.sfx('orb'); }
      if (P.t > 24) setP('idle'); break;
    case 'super':
      if (P.t === 20 || P.t === 40 || P.t === 60) {
        atkId++;
        enemies.forEach(e => { if (e.hp > 0 && e.x > G.camX - 20 && e.x < G.camX + W + 20) hurtEnemy(e, e.type === 'boss' ? 30 : 40, P.x < e.x ? 1 : -1, 6, true, atkId); });
        G.shake = 14; G.flash = 6;
      }
      if (P.t > 80) setP('idle'); break;
    case 'guard':
      if (!keys.guard) setP('idle'); break;
    case 'jump':
      P.x += P.vx; P.z += P.vz; P.vz -= 0.38;
      if (!P.jumpAtk && consume('attack')) { P.jumpAtk = true; playerAttack('jump'); P.atk.on = [P.t, P.t + 22]; Audio_.sfx('swing'); }
      if (P.z <= 0) { P.z = 0; setP('idle'); }
      break;
    case 'hurt': if (P.t > 22) setP('idle'); break;
    case 'down':
      P.x += P.vx; P.vx *= 0.9; P.z += P.vz; P.vz -= 0.4; if (P.z < 0) { P.z = 0; P.vz = 0; }
      if (P.t > 60) { if (P.hp <= 0) { playerDies(); } else { setP('idle'); P.inv = 70; } }
      break;
    case 'win': break;
  }
  // limiti
  P.y = clamp(P.y, FLOOR_TOP + 8, FLOOR_BOT);
  const right = G.lockX !== null ? G.lockX + W - 30 : WORLD - 30;
  P.x = clamp(P.x, G.camX + 24, right);
  // colpi in mischia
  if (P.atk && P.t >= P.atk.on[0] && P.t <= P.atk.on[1]) {
    const a = P.atk;
    const x0 = P.face > 0 ? P.x + a.from : P.x - a.to, x1 = P.face > 0 ? P.x + a.to : P.x - a.from;
    enemies.forEach(e => {
      if (e.hp <= 0 || e.hitBy === a.id || e.state === 'down' || e.state === 'getup') return;
      const reachY = e.type === 'boss' ? 22 : 16;
      if (e.x + 14 * e.sc > x0 && e.x - 14 * e.sc < x1 && Math.abs(e.y - P.y) < reachY && (a.type !== 'jump' || P.z < 70)) {
        hurtEnemy(e, a.dmg, P.face, a.kb, a.down, a.id);
        P.mp = Math.min(100, P.mp + 4);
        if (a.type === 'jump') { P.vz = Math.max(P.vz, 2); }
      }
    });
  }
}
function playerDies() {
  G.lives--;
  if (G.lives < 0) { G.mode = 'gameover'; G.continueT = 600; Audio_.stopMusic(); return; }
  P.hp = 100; P.mp = Math.max(P.mp, 50); setP('idle'); P.inv = 150; P.z = 0;
  G.flash = 12; G.flashCol = '#b060ff';
  enemies.forEach(e => { if (Math.abs(e.x - P.x) < 160 && e.hp > 0) { e.x += Math.sign(e.x - P.x || 1) * 80; setE(e, 'hurt'); } });
}
function hurtPlayer(dmg, dir, knock) {
  if (P.inv > 0 || P.state === 'down' || P.state === 'super' || P.state === 'win') return false;
  if (P.state === 'guard' && dir === -P.face) { P.hp -= Math.ceil(dmg * 0.15); P.x -= P.face * 4; Audio_.sfx('block'); spark(P.x + P.face * 20, P.y, 60, '#9ff'); P.mp = Math.min(100, P.mp + 2); return true; }
  P.hp -= dmg; P.hitFlash = 8; Audio_.sfx('hurt'); G.shake = 6; P.combo = 0;
  spark(P.x, P.y, 60, '#f44');
  if (knock || P.hp <= 0 || P.z > 0) { setP('down'); P.vx = dir * 3; P.vz = 4; P.z = Math.max(P.z, 1); }
  else { setP('hurt'); P.x += dir * 6; }
  return true;
}

// ---------------------------------------------------------------- nemici
function spawnEnemy(type, side) {
  const T = ETYPES[type];
  const x = side > 0 ? G.camX + W + 40 + rnd(0, 60) : G.camX - 40 - rnd(0, 60);
  enemies.push({ type, T, x, y: rnd(FLOOR_TOP + 14, FLOOR_BOT - 6), z: 0, vx: 0, vz: 0, face: -side, hp: T.hp, maxhp: T.hp, sc: T.scale,
    state: 'walk', t: 0, cd: rnd(30, 90), hitBy: -1, flash: 0, slot: rnd(-1, 1), shotCd: rnd(120, 240), entering: true, walkT: 0 });
}
function setE(e, s) { e.state = s; e.t = 0; }
function hurtEnemy(e, dmg, dir, kb, down, id) {
  e.hitBy = id;
  if (e.T.boss && !down && Math.random() < 0.15 && e.state !== 'hurt') { Audio_.sfx('block'); spark(e.x - dir * 10, e.y, 70, '#ff8'); e.hp -= Math.ceil(dmg * 0.3); return; }
  e.hp -= dmg; e.flash = 6; G.hitstop = down ? 5 : 3; G.score += 50;
  spark(e.x - dir * 6, e.y, 50 * e.sc, '#d7a0ff');
  Audio_.sfx(down ? 'heavy' : 'hit');
  if (down && e.T.heavy && e.hp > 0 && Math.random() < 0.5) down = false; // i pesanti resistono
  if (e.hp <= 0 || down) {
    setE(e, 'down'); e.vx = dir * kb * (e.T.heavy ? 0.6 : 1); e.vz = 4.5; e.z = Math.max(e.z, 1); e.face = -dir;
    if (down) G.shake = Math.max(G.shake, 8);
  } else { setE(e, 'hurt'); e.x += dir * kb * 3; e.face = -dir; }
}
function updateEnemies() {
  let attackers = enemies.filter(e => e.state === 'wind' || e.state === 'punch').length;
  for (const e of enemies) {
    e.t++; if (e.flash > 0) e.flash--; if (e.cd > 0) e.cd--; if (e.shotCd > 0) e.shotCd--;
    const dx = P.x - e.x, dy = P.y - e.y, adx = Math.abs(dx);
    switch (e.state) {
      case 'walk': {
        if (e.entering && e.x > G.camX + 30 && e.x < G.camX + W - 30) e.entering = false;
        const want = e.T.ranged && !e.T.boss ? 150 : e.T.reach - 6;
        const ring = attackers >= 2 && !e.entering ? 120 + e.slot * 30 : want;
        const tx = clamp(P.x - Math.sign(dx || 1) * ring, G.camX + 40, G.camX + W - 40), ty = P.y + (attackers >= 2 ? e.slot * 24 : 0);
        let mx = tx - e.x, my = ty - e.y;
        const sp = e.T.speed * (e.T.boss && e.hp < e.maxhp / 2 ? 1.35 : 1);
        if (Math.abs(mx) > 3) { e.x += Math.sign(mx) * sp; e.walkT++; }
        if (Math.abs(my) > 2) { e.y += Math.sign(my) * sp * 0.7; e.walkT++; }
        e.face = dx > 0 ? 1 : -1;
        if (e.T.ranged && e.shotCd <= 0 && adx > 110 && adx < 420 && Math.abs(dy) < 30 && !e.entering) { setE(e, 'cast'); }
        else if (adx < e.T.reach + 4 && Math.abs(dy) < 12 && e.cd <= 0 && attackers < 2 && P.state !== 'down') { setE(e, 'wind'); attackers++; }
        else if (e.T.boss && e.cd <= 0 && adx > 140 && adx < 360 && Math.abs(dy) < 20 && Math.random() < 0.02) { setE(e, 'dash'); }
        break;
      }
      case 'wind': if (e.t > (e.T.heavy ? 24 : 16)) setE(e, 'punch'); break;
      case 'punch':
        if (e.t === 3 && Math.abs(P.y - e.y) < 16 && P.z < 40) {
          const reach = e.T.reach * (e.T.scale > 1 ? 1.15 : 1);
          if ((e.face > 0 && dx > -10 && dx < reach) || (e.face < 0 && dx < 10 && dx > -reach)) hurtPlayer(e.T.dmg, e.face, e.T.heavy || Math.random() < 0.12);
        }
        if (e.t > 22) { setE(e, 'walk'); e.cd = rnd(40, 90) * (e.T.boss ? 0.6 : 1); } break;
      case 'cast':
        if (e.t === 20) {
          const n = e.T.boss ? (e.hp < e.maxhp / 2 ? 3 : 2) : 1;
          for (let i = 0; i < n; i++) shots.push({ x: e.x + e.face * 30, y: e.y + (i - (n - 1) / 2) * 22, z: 60 * e.sc, vx: e.face * (e.T.boss ? 4.2 : 3.4), own: 'e', life: 200, dmg: e.T.boss ? 10 : 8 });
          Audio_.sfx('enemyshot');
        }
        if (e.t > 40) { setE(e, 'walk'); e.shotCd = e.T.boss ? rnd(110, 170) : rnd(200, 320); } break;
      case 'dash':
        if (e.t < 14) break;
        e.x += e.face * 7.5;
        if (Math.abs(P.x - e.x) < 34 && Math.abs(P.y - e.y) < 18) { hurtPlayer(14, e.face, true); setE(e, 'walk'); e.cd = 80; }
        if (e.t > 50 || e.x < G.camX + 20 || e.x > G.camX + W - 20) { setE(e, 'walk'); e.cd = 60; }
        break;
      case 'hurt': if (e.t > (e.T.heavy ? 12 : 18)) setE(e, 'walk'); break;
      case 'down':
        e.x += e.vx; e.vx *= 0.92; e.z += e.vz; e.vz -= 0.35;
        if (e.z <= 0) { e.z = 0; if (e.vz < -2) { e.vz = -e.vz * 0.3; G.shake = Math.max(G.shake, 3); } else e.vz = 0; }
        if (e.t > 70) { if (e.hp <= 0) { e.dead = true; onKO(e); } else setE(e, 'getup'); }
        break;
      case 'getup': if (e.t > 20) { setE(e, 'walk'); e.cd = 30; } break;
    }
    e.y = clamp(e.y, FLOOR_TOP + 8, FLOOR_BOT);
    if (!e.entering) e.x = clamp(e.x, G.camX - 10, G.camX + W + 10);
  }
  enemies = enemies.filter(e => !e.dead);
}
function onKO(e) {
  G.score += e.T.score; Audio_.sfx('ko');
  if (Math.random() < (e.T.heavy ? 0.7 : 0.18)) pickups.push({ x: e.x, y: e.y, kind: Math.random() < 0.55 ? 'hp' : 'mp', t: 0 });
  if (e.T.boss) { enemies.forEach(o => { if (o !== e && o.hp > 0) { o.hp = 0; setE(o, 'down'); o.vz = 4; } }); }
}

// ---------------------------------------------------------------- ondate e telecamera
function updateWaves() {
  const wv = WAVES[G.wave];
  if (!G.waveActive && wv && G.camX >= wv.x - 1) {
    G.waveActive = true; G.lockX = wv.x; G.camX = wv.x; G.queue = wv.list.slice(); G.spawnT = 0;
    if (wv.boss) { G.banner = { text: 'ATTENZIONE!  ' + ETYPES.boss.name, t: 160, warn: true }; Audio_.startMusic('boss'); }
  }
  if (G.waveActive) {
    G.spawnT--;
    const alive = enemies.filter(e => e.hp > 0).length;
    if (G.queue.length && G.spawnT <= 0 && alive < 4) {
      const t = G.queue.shift(); spawnEnemy(t, t === 'boss' ? 1 : (Math.random() < 0.6 ? 1 : -1)); G.spawnT = 50;
    }
    if (!G.queue.length && enemies.length === 0) {
      G.waveActive = false; G.lockX = null;
      if (WAVES[G.wave].boss) { G.mode = 'win'; G.endT = 0; setP('win'); P.x = clamp(P.x, G.camX + 80, G.camX + W - 80); P.z = 0; Audio_.stopMusic(); Audio_.sfx('start'); }
      else { G.go = 180; Audio_.sfx('go'); }
      G.wave++;
    }
  }
  // camera
  if (!G.waveActive) {
    const target = P.x - W * 0.42;
    const next = WAVES[G.wave] ? WAVES[G.wave].x : WORLD - W;
    if (target > G.camX) G.camX = Math.min(target, next, WORLD - W);
  }
  if (G.go > 0) G.go--;
}

// ---------------------------------------------------------------- proiettili, effetti, oggetti
function spark(x, y, z, col) { for (let i = 0; i < 8; i++) fx.push({ x, y, z: z + rnd(-10, 10), vx: rnd(-3, 3), vz: rnd(-1, 3), life: 18, col, sz: rnd(2, 4) }); fx.push({ x, y, z, ring: 1, life: 10, col }); }
function updateShots() {
  for (const s of shots) {
    s.x += s.vx; s.life--;
    if (Math.random() < 0.6) fx.push({ x: s.x - s.vx, y: s.y, z: s.z + rnd(-6, 6), vx: -s.vx * 0.1, vz: rnd(-0.5, 0.5), life: 14, col: s.own === 'p' ? '#c080ff' : '#ff5040', sz: 3 });
    if (s.own === 'p') {
      for (const e of enemies) if (e.hp > 0 && e.state !== 'down' && Math.abs(e.x - s.x) < 22 * e.sc && Math.abs(e.y - s.y) < 18) { hurtEnemy(e, s.dmg, Math.sign(s.vx), 5, true, s.id); P.mp = Math.min(100, P.mp + 2); s.life = 0; break; }
    } else if (Math.abs(P.x - s.x) < 18 && Math.abs(P.y - s.y) < 16 && P.z < 60) { if (hurtPlayer(s.dmg, Math.sign(s.vx), false)) s.life = 0; }
    if (s.x < G.camX - 60 || s.x > G.camX + W + 60) s.life = 0;
  }
  shots = shots.filter(s => s.life > 0);
  for (const f of fx) { f.life--; if (!f.ring) { f.x += f.vx; f.z += f.vz; f.vz -= 0.15; } }
  fx = fx.filter(f => f.life > 0);
  for (const p of pickups) {
    p.t++;
    if (Math.abs(P.x - p.x) < 24 && Math.abs(P.y - p.y) < 16 && P.z < 20) {
      p.got = true; Audio_.sfx('pickup'); G.score += 200;
      if (p.kind === 'hp') P.hp = Math.min(100, P.hp + 35); else P.mp = Math.min(100, P.mp + 40);
    }
  }
  pickups = pickups.filter(p => !p.got && p.t < 900);
}

// ---------------------------------------------------------------- rendering
function drawSprite(img, x, y, face, ax, sc = 1, white = null, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.translate(Math.round(x), Math.round(y)); if (face < 0) ctx.scale(-1, 1);
  ctx.drawImage(img, Math.round(-ax * sc), Math.round(-img.height * sc), Math.round(img.width * sc), Math.round(img.height * sc));
  if (white) { ctx.globalAlpha = 0.85 * alpha; ctx.drawImage(white, Math.round(-ax * sc), Math.round(-img.height * sc), Math.round(img.width * sc), Math.round(img.height * sc)); }
  ctx.restore();
}
const WHITE = {};
function playerFrame() {
  switch (P.state) {
    case 'walk': return 'walk';
    case 'attack': return P.t < 4 ? 'guard' : 'attack';
    case 'special': return 'special';
    case 'cast': return 'projbody';
    case 'super': return 'super';
    case 'guard': return 'guard';
    case 'jump': return P.jumpAtk ? 'jump' : (P.z > 10 ? 'jump' : 'crouch');
    case 'hurt': return 'crouch';
    case 'down': return 'crouch';
    case 'win': return 'win';
    default: return 'idle';
  }
}
function drawShadow(x, y, w) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(Math.round(x), Math.round(y), w, w * 0.22, 0, 0, 7); ctx.fill(); }
function drawPlayer() {
  const sx = P.x - G.camX;
  drawShadow(sx, P.y, 26);
  if (P.inv > 0 && P.state !== 'super' && Math.floor(P.t / 3) % 2) return;
  const f = playerFrame(), F = FR[f], img = IMG[f]; if (!img) return;
  let bob = 0, x = sx;
  if (P.state === 'walk') bob = Math.abs(Math.sin(P.walkT * 0.18)) * -3;
  if (P.state === 'idle') bob = Math.sin(G.t * 0.06) > 0.6 ? -1 : 0;
  if (P.state === 'attack' && P.t >= 4) x += P.face * Math.min(P.t, 6);
  // aura viola
  if (P.mp >= 100 && G.t % 4 < 2) { ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#a050ff'; ctx.beginPath(); ctx.ellipse(sx, P.y - 50, 40, 62, 0, 0, 7); ctx.fill(); ctx.restore(); }
  drawSprite(img, x, P.y - P.z + bob, P.face, F.ax, F.s || 1, P.hitFlash > 0 ? WHITE[f] : null);
}
function drawEnemy(e) {
  const sx = e.x - G.camX;
  drawShadow(sx, e.y, 20 * e.sc);
  if (e.state === 'down' && e.t > 50 && e.hp <= 0 && Math.floor(e.t / 3) % 2) return;
  let pose = 'idle';
  switch (e.state) {
    case 'walk': pose = (e.walkT >> 3) % 2 ? 'walk1' : 'walk2'; break;
    case 'wind': pose = 'wind'; break; case 'punch': pose = 'punch'; break;
    case 'hurt': pose = 'hurt'; break; case 'cast': pose = 'cast'; break;
    case 'dash': pose = e.t < 14 ? 'wind' : 'punch'; break;
    case 'down': pose = e.z > 6 ? 'hurt' : 'down'; break; case 'getup': pose = 'getup'; break;
  }
  const fr = EFR[e.type][pose];
  if (e.state === 'cast' && e.t < 20) { ctx.fillStyle = e.t % 4 < 2 ? '#ff4030' : '#ffb040'; ctx.beginPath(); ctx.arc(sx + e.face * 22 * e.sc, e.y - 66 * e.sc, 4 + e.t / 3, 0, 7); ctx.fill(); }
  if (e.state === 'dash' && e.t < 14 && G.t % 4 < 2) { ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = '#ff2040'; ctx.beginPath(); ctx.ellipse(sx, e.y - 55 * e.sc, 30 * e.sc, 60 * e.sc, 0, 0, 7); ctx.fill(); ctx.restore(); }
  const ox = (e.state === 'hurt' && e.t < 6) ? (e.t % 2 ? 2 : -2) : 0;
  drawSprite(fr.img, sx + ox, e.y - e.z + (pose === 'down' ? 4 : 0), e.face, fr.ax, e.sc, e.flash > 0 ? fr.white : null);
}
function drawShot(s) {
  const sx = s.x - G.camX;
  drawShadow(sx, s.y, 10);
  if (s.own === 'p' && IMG.orb) { drawSprite(IMG.orb, sx + Math.sign(s.vx) * 20, s.y - s.z + 26, Math.sign(s.vx), 31, 0.8 + 0.08 * Math.sin(G.t * 0.6)); }
  else {
    ctx.fillStyle = 'rgba(255,60,40,0.35)'; ctx.beginPath(); ctx.arc(sx, s.y - s.z, 13, 0, 7); ctx.fill();
    ctx.fillStyle = '#ff5030'; ctx.beginPath(); ctx.arc(sx, s.y - s.z, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffe0a0'; ctx.beginPath(); ctx.arc(sx, s.y - s.z, 4, 0, 7); ctx.fill();
  }
}
function drawPickup(p) {
  const sx = p.x - G.camX, by = p.y - 8 - Math.abs(Math.sin(p.t * 0.08)) * 6;
  if (p.t > 700 && Math.floor(p.t / 4) % 2) return;
  drawShadow(sx, p.y, 9);
  if (p.kind === 'hp') { // fiala rossa
    ctx.fillStyle = '#0b0610'; ctx.fillRect(sx - 7, by - 16, 14, 18); ctx.fillStyle = '#e0304a'; ctx.fillRect(sx - 5, by - 10, 10, 10);
    ctx.fillStyle = '#c8c0d8'; ctx.fillRect(sx - 3, by - 15, 6, 5); ctx.fillStyle = '#ffb0c0'; ctx.fillRect(sx - 4, by - 9, 2, 4);
  } else { // gemma viola
    ctx.fillStyle = '#0b0610'; ctx.beginPath(); ctx.moveTo(sx, by - 18); ctx.lineTo(sx + 9, by - 8); ctx.lineTo(sx, by + 2); ctx.lineTo(sx - 9, by - 8); ctx.fill();
    ctx.fillStyle = '#b060ff'; ctx.beginPath(); ctx.moveTo(sx, by - 15); ctx.lineTo(sx + 6, by - 8); ctx.lineTo(sx, by - 1); ctx.lineTo(sx - 6, by - 8); ctx.fill();
    ctx.fillStyle = '#efd8ff'; ctx.fillRect(sx - 2, by - 12, 2, 3);
  }
}
function drawFx(f) {
  const sx = f.x - G.camX, sy = f.y - f.z;
  if (f.ring) { ctx.strokeStyle = f.col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, (10 - f.life) * 3 + 4, 0, 7); ctx.stroke(); return; }
  ctx.fillStyle = f.col; ctx.globalAlpha = Math.min(1, f.life / 10); ctx.fillRect(Math.round(sx), Math.round(sy), f.sz, f.sz); ctx.globalAlpha = 1;
}
function drawWorld() {
  const cx = G.camX;
  ctx.drawImage(LAYERS.sky, 0, 0);
  ctx.drawImage(LAYERS.far, -Math.round(cx * 0.2), 0);
  ctx.drawImage(LAYERS.mid, -Math.round(cx * 0.5), 0);
  // nebbia
  const fg = ctx.createLinearGradient(0, 150, 0, 240); fg.addColorStop(0, 'rgba(120,60,160,0)'); fg.addColorStop(1, 'rgba(120,60,160,0.35)');
  ctx.fillStyle = fg; ctx.fillRect(0, 150, W, 90);
  ctx.drawImage(LAYERS.near, -Math.round(cx), 0);
  for (const lx of LAYERS.lamps) { const s = lx - cx; if (s > -60 && s < W + 60) drawLamp(s); }
  // entità ordinate per profondità
  const list = [];
  pickups.forEach(p => list.push([p.y - 1, () => drawPickup(p)]));
  enemies.forEach(e => list.push([e.y, () => drawEnemy(e)]));
  shots.forEach(s => list.push([s.y + 0.5, () => drawShot(s)]));
  if (G.mode !== 'title') list.push([P.y + 0.1, drawPlayer]);
  list.sort((a, b) => a[0] - b[0]).forEach(i => i[1]());
  fx.forEach(drawFx);
  // effetto super
  if (G.superFx > 0) {
    G.superFx--;
    ctx.save(); ctx.globalAlpha = Math.min(0.55, G.superFx / 60); ctx.fillStyle = '#2a0050'; ctx.fillRect(0, 0, W, H); ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const x = (G.t * 37 + i * 113) % W; ctx.strokeStyle = 'rgba(190,110,255,0.8)'; ctx.lineWidth = 2; ctx.beginPath();
      let y = 0, xx = x; ctx.moveTo(xx, y); while (y < FLOOR_BOT) { y += 20; xx += rnd(-14, 14); ctx.lineTo(xx, y); } ctx.stroke();
    }
    ctx.restore();
  }
}
function txt(s, x, y, size = 8, col = '#fff', align = 'left', shadow = '#000') {
  ctx.font = size + 'px ' + FONT; ctx.textAlign = align; ctx.textBaseline = 'top';
  if (shadow) { ctx.fillStyle = shadow; ctx.fillText(s, x + 1, y + 1); ctx.fillText(s, x + 2, y + 2); }
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function bar(x, y, w, h, v, col, col2) {
  ctx.fillStyle = '#000'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#3a0a10'; ctx.fillRect(x, y, w, h);
  const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, col); g.addColorStop(1, col2);
  ctx.fillStyle = g; ctx.fillRect(x, y, Math.max(0, w * clamp(v, 0, 1)), h);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(x, y, Math.max(0, w * clamp(v, 0, 1)), 2);
}
function drawHUD() {
  // ritratto
  ctx.fillStyle = '#000'; ctx.fillRect(8, 8, 46, 46);
  if (IMG.face) ctx.drawImage(IMG.face, 0, 6, 68, 68, 10, 10, 42, 42);
  ctx.strokeStyle = '#b07cff'; ctx.lineWidth = 2; ctx.strokeRect(9, 9, 44, 44);
  txt('DARK SHADOW', 62, 9, 8, '#e8d0ff');
  bar(62, 21, 170, 9, P.hp / 100, '#ffe24a', '#e08a10');
  bar(62, 36, 170, 6, P.mp / 100, '#d090ff', '#7a30d0');
  if (P.mp >= 100 && G.t % 30 < 20) txt('SUPER PRONTA! [B]', 62, 46, 6, '#ffd23f');
  else txt('MAGIA', 62, 46, 6, '#b07cff');
  txt('x' + Math.max(0, G.lives), 238, 21, 8, '#fff');
  txt('PUNTI ' + String(G.score).padStart(7, '0'), W - 10, 10, 8, '#ffd23f', 'right');
  // barra nemico / boss
  const boss = enemies.find(e => e.T.boss && e.hp > 0);
  if (boss) {
    txt(boss.T.name, W - 10, 24, 7, '#ff6070', 'right');
    bar(W - 230, 36, 220, 8, boss.hp / boss.maxhp, '#ff4050', '#901020');
  }
  if (G.go > 0 && Math.floor(G.go / 15) % 2) { txt('VAI', W - 74, 150, 16, '#ffd23f', 'left'); txt('→', W - 30, 146, 20, '#ffd23f', 'left'); }
  if (G.banner && G.banner.t > 0) {
    G.banner.t--;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 128, W, 34);
    if (!G.banner.warn || Math.floor(G.banner.t / 10) % 2) txt(G.banner.text, W / 2, 140, 10, G.banner.warn ? '#ff5060' : '#e8d0ff', 'center');
  }
}
function drawLogo(cx, y, size) {
  ctx.save(); ctx.font = size + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (let i = 6; i > 0; i--) { ctx.fillStyle = `rgba(120,40,220,${0.12})`; ctx.fillText('DARK SHADOW', cx + rnd(-1, 1), y + i); }
  ctx.fillStyle = '#12061e'; ctx.fillText('DARK SHADOW', cx + 3, y + 3);
  const g = ctx.createLinearGradient(0, y, 0, y + size); g.addColorStop(0, '#f2d6ff'); g.addColorStop(0.5, '#b562ff'); g.addColorStop(1, '#5a1aa8');
  ctx.fillStyle = g; ctx.fillText('DARK SHADOW', cx, y); ctx.restore();
}
function drawTitle() {
  G.camX = (G.t * 0.4) % (WORLD - W);
  drawWorld();
  ctx.fillStyle = 'rgba(8,3,16,0.55)'; ctx.fillRect(0, 0, W, H);
  if (IMG.portrait) { ctx.save(); ctx.globalAlpha = 0.95; ctx.drawImage(IMG.portrait, 0, 0); ctx.restore(); const g = ctx.createLinearGradient(160, 0, 250, 0); g.addColorStop(0, 'rgba(8,3,16,0)'); g.addColorStop(1, 'rgba(8,3,16,1)'); ctx.fillStyle = g; ctx.fillRect(160, 0, 90, H); }
  drawLogo(445, 52, 26);
  txt('IL SIGNORE DELLE OMBRE', 445, 92, 8, '#d8b8ff', 'center');
  if (Math.floor(G.t / 30) % 2) txt('PREMI INVIO / TOCCA', 445, 140, 10, '#ffd23f', 'center');
  const L = [['FRECCE/WASD', 'muovi'], ['Z / J', 'colpo di bastone'], ['X / K / SPAZIO', 'salto (+Z in aria)'], ['C / L', 'arco oscuro'], ['V / U', "sfera d'ombra"], ['B / I', 'super (magia piena)'], ['SHIFT / H', 'parata'], ['P   M', 'pausa   audio']];
  L.forEach(([k, d], i) => { txt(k, 300, 182 + i * 18, 7, '#b07cff'); txt(d, 430, 182 + i * 18, 7, '#e8e0f0'); });
  txt('PROTOTIPO v0.1', W - 8, H - 12, 6, '#6a5a88', 'right', null);
}
function drawOverlay(title, sub, col) {
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
  txt(title, W / 2, 130, 20, col, 'center'); if (sub) txt(sub, W / 2, 178, 8, '#fff', 'center');
}

// ---------------------------------------------------------------- ciclo principale
function update() {
  G.t++; pollPad(); Audio_.tick();
  if (consume('mute')) Audio_.toggle();
  if (G.mode === 'title') {
    if (consume('start') || consume('attack')) { Audio_.init(); Audio_.sfx('start'); resetGame(); G.mode = 'play'; for (const k in pressed) pressed[k] = false; }
    return;
  }
  if (G.mode === 'gameover') {
    G.continueT--;
    if (consume('start') || consume('attack')) { resetGame(); G.mode = 'play'; }
    if (G.continueT <= 0) G.mode = 'title';
    return;
  }
  if (G.mode === 'win') {
    G.endT++; updateShots();
    if (G.endT > 200 && (consume('start') || consume('attack'))) G.mode = 'title';
    return;
  }
  if (consume('pause')) { G.paused = !G.paused; if (G.paused) Audio_.stopMusic(); else Audio_.startMusic(WAVES[G.wave] && WAVES[G.wave].boss && G.waveActive ? 'boss' : 'stage'); }
  if (G.paused) return;
  if (G.hitstop > 0) { G.hitstop--; return; }
  updatePlayer(); updateEnemies(); updateShots(); updateWaves();
  if (G.shake > 0) G.shake--; if (G.flash > 0) G.flash--;
  for (const k in pressed) pressed[k] = false; // gli input non usati in questo frame si perdono
}
function render() {
  ctx.save();
  if (G.shake > 0) ctx.translate(Math.round(rnd(-1, 1) * Math.min(G.shake, 6)), Math.round(rnd(-1, 1) * Math.min(G.shake, 4)));
  if (G.mode === 'title') drawTitle();
  else {
    drawWorld(); drawHUD();
    if (G.paused) drawOverlay('PAUSA', 'premi P per continuare', '#b07cff');
    if (G.mode === 'gameover') drawOverlay('GAME OVER', 'CONTINUA? ' + Math.ceil(G.continueT / 60) + '  - premi INVIO', '#ff5060');
    if (G.mode === 'win') {
      ctx.fillStyle = `rgba(20,0,40,${Math.min(0.5, G.endT / 200)})`; ctx.fillRect(0, 0, W, H);
      if (G.endT > 40) { drawLogo(W / 2, 80, 22); txt('LA CITTÀ È SALVA... PER ORA', W / 2, 120, 9, '#e8d0ff', 'center'); txt('PUNTI ' + G.score, W / 2, 140, 9, '#ffd23f', 'center'); }
      if (G.endT > 200 && Math.floor(G.t / 30) % 2) txt('PREMI INVIO', W / 2, 170, 8, '#fff', 'center');
    }
  }
  if (G.flash > 0) { ctx.save(); ctx.globalAlpha = G.flash / 14; ctx.fillStyle = G.flashCol; ctx.fillRect(-10, -10, W + 20, H + 20); ctx.restore(); }
  ctx.restore();
}
let last = 0, acc = 0;
function frame(ts) {
  if (!last) last = ts; acc += Math.min(100, ts - last); last = ts;
  while (acc >= 1000 / 60) { update(); acc -= 1000 / 60; }
  render(); requestAnimationFrame(frame);
}
document.addEventListener('visibilitychange', () => { if (document.hidden && G.mode === 'play' && !G.paused) { G.paused = true; Audio_.stopMusic(); } });

// avvio
(async function boot() {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  await loadAll();
  try { await document.fonts.load('10px "Press Start 2P"'); } catch (e) { /* font di riserva */ }
  for (const n in FR) if (IMG[n]) WHITE[n] = whiteOf(IMG[n]);
  buildEnemyFrames(); buildBackground();
  P = newPlayer();
  window.__DS = { G, get P() { return P; }, get enemies() { return enemies; } };
  requestAnimationFrame(frame);
})();
