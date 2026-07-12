// STONER SIMULATOR — polished build
// Score by staying high. Work jobs, buy weed, dodge cops and bullets.

/* ── Constants ─────────────────────────────── */
const H = 768;
// Width flexes to the device aspect ratio so the game fills the screen instead of
// pillarboxing (especially landscape phones). Height stays fixed for a consistent
// vertical scale. Clamped so it never goes narrower than the original 4:3 or absurdly wide.
const _aspect = (typeof window !== 'undefined' && window.innerHeight)
  ? window.innerWidth / window.innerHeight : 4 / 3;
const W = Math.max(1024, Math.min(1792, Math.round(H * _aspect)));
const TILE = 64;
const RI = 8;
const COLS = 32, ROWS = 32;
const WORLD_W = COLS * TILE;
const WORLD_H = ROWS * TILE;

const PIXEL_FONT = '"Press Start 2P", monospace';

/* ── Version + changelog (newest first). Bump when features ship. ── */
const CHANGELOG = [
  { v: '1.3', title: 'Streets Alive', items: [
    'Choose-your-city map picker before each run',
    'City landmarks: Suburbia park, Uptown roundabout, Docks pier',
    'Downtown rush hour — heavy traffic + a highway on/off ramp',
    'Two-way traffic — cars keep their lane and don\'t pile up',
  ] },
  { v: '1.2', title: 'Driving Polish', items: [
    'Pedestrians dodge out of your way',
    'Hold Shift to sprint',
    'Speedometer added',
    'Sleep now works (energy drains each shift)',
  ] },
  { v: '1.1', title: 'Heat & Maps', items: [
    'Shake the mafia by breaking away from the crew',
    '4 randomized city maps',
  ] },
  { v: '1.0', title: 'Launch', items: [
    'Pizza & ambulance shifts, get high, dodge the loan shark',
    'Desktop + mobile touch controls, day/night cycle',
  ] },
];
const VERSION = CHANGELOG[0].v;

const SHIFT_DURATION = 90;
const NPC_COUNT      = 6;
const TRAFFIC_COUNT  = 12;
const TRAFFIC_LANE_OFFSET = 26;   // cars keep to their side of a 2-tile road (two-way)
const MAX_HIGH       = 100;
const HIGH_DECAY     = 0.3;
const HIGH_PER_SMOKE = 22;
const SMOKE_COST     = 45;
const EAT_COST       = 25;
const JOB_PAY        = 180;
const REACH_DIST     = 90;
const DEBT_PER_KILL  = 2000;   // first manslaughter puts you here
const DEBT_REPEAT    = 1500;   // each additional kill adds this
const HITMAN_IFRAMES = 1200;   // ms of invulnerability after a ram
const BOLD_NIGHTS    = 3;      // nights owing before the crew hunts in daylight too
const SHAKE_DIST     = 700;    // px of separation needed to start shaking the crew
const SHAKE_TIME     = 6;      // seconds of separation to fully lose them

/* ── Authored city maps: POIs land in different blocks [sc,sr] + own color theme.
   Picked at random each run so you don't always know where the hospital/pizza are. ── */
const MAPS = [
  { name: 'Downtown', ground: 0x2e5c28, road: 0x4a4a5a,
    palette: [0x7a4030, 0x404060, 0x305050, 0x504030, 0x403050, 0x305030, 0x603040],
    poi: { hospital: [0,0], pizzeria: [2,2], gas: [1,3], store: [3,1] },
    trafficCount: 26, highway: true },
  { name: 'Suburbia', ground: 0x3a6b2e, road: 0x565c56,
    palette: [0x8a6a4a, 0x6a7a5a, 0x7a5a4a, 0x5a6a6a, 0x8a7a5a, 0x6a5a4a, 0x7a6a5a],
    poi: { hospital: [3,0], pizzeria: [0,3], gas: [2,1], store: [1,2] },
    feature: { type: 'park', block: [2,2] } },
  { name: 'The Docks', ground: 0x2a4a55, road: 0x40484f,
    palette: [0x4a5a6a, 0x3a4a5a, 0x5a4a3a, 0x4a4a4a, 0x2a3a4a, 0x5a5a4a, 0x3a5a5a],
    poi: { hospital: [0,0], pizzeria: [3,1], gas: [2,0], store: [1,2] },
    waterEdge: 'south' },
  { name: 'Uptown', ground: 0x43385c, road: 0x504a5a,
    palette: [0x6a4a6a, 0x7a5a7a, 0x5a4a6a, 0x8a6a8a, 0x4a3a5a, 0x6a5a7a, 0x7a5a8a],
    poi: { hospital: [2,0], pizzeria: [1,1], gas: [3,2], store: [0,2] },
    feature: { type: 'roundabout', block: [2,2] } },
];

/* ── Global event bus (no Phaser dependency at load time) ── */
const Bus = {
  _l: {},
  on(e, fn, ctx) { (this._l[e] = this._l[e] || []).push({ fn, ctx }); },
  emit(e, ...a) { (this._l[e] || []).forEach(({ fn, ctx }) => fn.apply(ctx, a)); },
  removeAllListeners() { this._l = {}; }
};

/* ── Sound Engine (Web Audio API) ─────────── */
class SoundEngine {
  constructor() { this.ctx = null; this.engineOsc = null; this.engineGain = null; }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
  }

  _resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  startEngine() {
    if (!this.ctx) return;
    this._resume();
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.03;
    this.engineOsc.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
  }

  updateEngine(speed, maxSpeed) {
    if (!this.engineOsc || !this.ctx) return;
    const t = this.ctx.currentTime;
    const freq = 60 + (Math.abs(speed) / maxSpeed) * 180;
    const vol  = 0.01 + (Math.abs(speed) / maxSpeed) * 0.05;
    this.engineOsc.frequency.setTargetAtTime(freq, t, 0.1);
    this.engineGain.gain.setTargetAtTime(vol, t, 0.1);
  }

  stopEngine() {
    if (this.engineOsc) { try { this.engineOsc.stop(); } catch(e){} this.engineOsc = null; }
  }

  playImpact(intensity = 0.5) {
    if (!this.ctx) return; this._resume();
    const rate = this.ctx.sampleRate;
    const buf  = this.ctx.createBuffer(1, rate * 0.3, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++)
      data[i] = (Math.random() * 2 - 1) * Math.max(0, 1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = Math.min(intensity, 1) * 0.4;
    src.connect(g); g.connect(this.ctx.destination); src.start();
  }

  playSmoke() {
    if (!this.ctx) return; this._resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(); osc.stop(t + 0.5);
  }

  playBulletWhiz() {
    if (!this.ctx) return; this._resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.15);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.1, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(); osc.stop(t + 0.15);
  }

  playPickup() {
    if (!this.ctx) return; this._resume();
    [440, 550, 660].forEach((freq, i) => {
      const t = this.ctx.currentTime + i * 0.1;
      const osc = this.ctx.createOscillator(); osc.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.15);
    });
  }

  playDropoff() {
    if (!this.ctx) return; this._resume();
    [523, 659, 784, 1047].forEach((freq, i) => {
      const t = this.ctx.currentTime + i * 0.08;
      const osc = this.ctx.createOscillator(); osc.frequency.value = freq;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(g); g.connect(this.ctx.destination);
      osc.start(t); osc.stop(t + 0.2);
    });
  }

  playSiren() {
    if (!this.ctx) return; this._resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator(); osc.type = 'square';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.setValueAtTime(800, t + 0.2);
    osc.frequency.setValueAtTime(600, t + 0.4);
    const g = this.ctx.createGain(); g.gain.value = 0.07;
    osc.connect(g); g.connect(this.ctx.destination);
    osc.start(); osc.stop(t + 0.5);
  }

  // ── Background music ──
  startMusic() {
    if (!this.ctx || this.musicPlaying) return;
    this._resume();
    this.musicPlaying = true;
    this.musicMuted   = false;

    // Master gain for muting
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.0;
    this.musicGain.connect(this.ctx.destination);
    // Fade in
    this.musicGain.gain.setTargetAtTime(1.0, this.ctx.currentTime, 1.2);

    // Warm pad — detuned sine oscillators (A minor-ish)
    const padFreqs = [110, 130.81, 164.81, 220, 261.63];
    this.padNodes = padFreqs.map((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq + i * 0.25;
      const g = this.ctx.createGain();
      g.gain.value = 0.022;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 600;
      osc.connect(lp); lp.connect(g); g.connect(this.musicGain);
      osc.start();
      return osc;
    });

    this._scheduleBeat();
  }

  _scheduleKick(t) {
    const osc = this.ctx.createOscillator();
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    osc.connect(g); g.connect(this.musicGain);
    osc.start(t); osc.stop(t + 0.3);
  }

  _scheduleSnare(t) {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.18, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.055));
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const g = this.ctx.createGain(); g.gain.value = 0.13;
    src.connect(g); g.connect(this.musicGain); src.start(t);
  }

  _scheduleHihat(t, gain = 0.04) {
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.04, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 8000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(hp); hp.connect(g); g.connect(this.musicGain); src.start(t);
  }

  _scheduleBeat() {
    if (!this.musicPlaying) return;
    const bpm  = 82;
    const beat = 60 / bpm;
    const t    = this.ctx.currentTime + 0.05;

    for (let i = 0; i < 8; i++) {           // 2-bar loop
      const bt = t + i * beat;
      if (i % 4 === 0) this._scheduleKick(bt);           // kick on 1
      if (i % 4 === 2) this._scheduleKick(bt);           // kick on 3
      if (i % 4 === 1 || i % 4 === 3) this._scheduleSnare(bt); // snare 2,4
      this._scheduleHihat(bt);                            // hihat every beat
      this._scheduleHihat(bt + beat * 0.5, 0.025);       // off-beat hihat
    }

    this._beatTimer = setTimeout(() => this._scheduleBeat(), beat * 8 * 1000 - 80);
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this._beatTimer) clearTimeout(this._beatTimer);
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
      setTimeout(() => {
        if (this.padNodes) { this.padNodes.forEach(o => { try { o.stop(); } catch(e){} }); this.padNodes = null; }
      }, 1500);
    }
  }

  toggleMute() {
    if (!this.musicGain) return;
    this.musicMuted = !this.musicMuted;
    this.musicGain.gain.setTargetAtTime(this.musicMuted ? 0 : 1, this.ctx.currentTime, 0.3);
    return this.musicMuted;
  }
}
const SFX = new SoundEngine();

/* ── Shared car sprite drawing (used by Menu + Game) ── */
function drawCarShape(g, bodyColor, isAmb, isCop) {
  g.fillStyle(0x111111);
  g.fillRect(0, 4, 5, 12); g.fillRect(31, 4, 5, 12);
  g.fillRect(0, 38, 5, 12); g.fillRect(31, 38, 5, 12);

  g.fillStyle(bodyColor);
  g.fillRect(5, 2, 26, 52);

  if (isCop) {
    g.fillStyle(0x0033cc); g.fillRect(5, 18, 26, 20);
    g.fillStyle(0xff0000); g.fillRect(7, 0, 10, 5);
    g.fillStyle(0x0000ff); g.fillRect(19, 0, 10, 5);
  }

  g.fillStyle(0x88ccff, 0.8); g.fillRect(8, 6, 20, 16);
  g.fillStyle(0x88ccff, 0.5); g.fillRect(8, 36, 20, 12);
  g.fillStyle(0xffffcc); g.fillRect(7, 2, 7, 4); g.fillRect(22, 2, 7, 4);
  g.fillStyle(0xff2222); g.fillRect(7, 50, 7, 4); g.fillRect(22, 50, 7, 4);

  if (isAmb) {
    g.fillStyle(0xff0000); g.fillRect(16, 18, 4, 16); g.fillRect(10, 24, 16, 4);
    g.fillStyle(0x0044ff); g.fillRect(8, 2, 10, 3);
    g.fillStyle(0xff0000); g.fillRect(18, 2, 10, 3);
  }
}

/* ═══════════════════════════════════════════
   MENU SCENE
═══════════════════════════════════════════ */
class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  preload() { this.load.image('cover', 'cover.png'); }

  create() {
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000);

    // Cover art occupies the top half
    const cover = this.add.image(W / 2, 20, 'cover').setOrigin(0.5, 0);
    cover.setScale((H / 2 - 20) / cover.height);

    // Minimal instructions
    this.add.text(W / 2, H / 2 + 50, 'Stay as high as possible, for as long as possible.', {
      fontSize: '18px', fontFamily: 'Arial', color: '#cfe8d6', fontStyle: 'italic'
    }).setOrigin(0.5);

    this.add.text(W / 2, H / 2 + 90, 'WASD / Arrows: drive   SHIFT: sprint   SPACE: brake   E: interact   ?: help', {
      fontSize: '15px', fontFamily: 'Arial', color: '#8aa596'
    }).setOrigin(0.5);

    const best = parseInt(localStorage.getItem('stonerHighScore') || '0');
    if (best > 0) {
      this.add.text(W / 2, H / 2 + 124, `🏆 Best Score: ${best}`, {
        fontSize: '15px', fontFamily: 'Arial Black, Arial', color: '#ffdd00'
      }).setOrigin(0.5);
    }

    this.add.text(W / 2, H - 34, '⚠ Photosensitivity warning: contains flashing, screen shake & motion that may cause dizziness.', {
      fontSize: '12px', fontFamily: 'Arial', color: '#c9a24b'
    }).setOrigin(0.5);

    // Start button
    const btn = this.add.rectangle(W / 2, H - 100, 260, 60, 0x007733)
      .setInteractive({ useHandCursor: true })
      .setStrokeStyle(2, 0x00ff88);
    const btnTxt = this.add.text(W / 2, H - 100, 'START', {
      fontSize: '20px', fontFamily: PIXEL_FONT, color: '#ffffff'
    }).setOrigin(0.5);

    btn.on('pointerover', () => { btn.setFillStyle(0x00aa44); btnTxt.setColor('#ccffcc'); });
    btn.on('pointerout',  () => { btn.setFillStyle(0x007733); btnTxt.setColor('#ffffff'); });
    btn.on('pointerdown', () => {
      SFX.init();
      this.cameras.main.fade(400, 0, 0, 0);
      this.time.delayedCall(400, () => this.scene.start('MapSelect'));
    });

    // Pulse the button
    this.tweens.add({ targets: btn, scaleX: 1.03, scaleY: 1.03, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // Version tag (bottom-right) — click to open the changelog
    this.buildChangelog();
    const verTag = this.add.text(W - 10, H - 8, `v${VERSION}  ·  what's new`, {
      fontSize: '12px', fontFamily: 'Arial', color: '#66aa88'
    }).setOrigin(1, 1).setDepth(50).setInteractive({ useHandCursor: true });
    verTag.on('pointerover', () => verTag.setColor('#aaffcc'));
    verTag.on('pointerout',  () => verTag.setColor('#66aa88'));
    verTag.on('pointerdown', () => this.toggleChangelog(true));
  }

  buildChangelog() {
    this.clObjs = [];
    const scrim = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75)
      .setDepth(200).setVisible(false).setInteractive();
    const panel = this.add.rectangle(W / 2, H / 2, 660, 600, 0x0a1512, 0.98)
      .setStrokeStyle(2, 0x00ff88).setDepth(201).setVisible(false);
    const title = this.add.text(W / 2, H / 2 - 262, "WHAT'S NEW", {
      fontSize: '22px', fontFamily: PIXEL_FONT, color: '#00ff88'
    }).setOrigin(0.5).setDepth(202).setVisible(false);
    this.clObjs.push(scrim, panel, title);

    let y = H / 2 - 220;
    CHANGELOG.forEach(rel => {
      const h = this.add.text(W / 2 - 300, y, `v${rel.v}  —  ${rel.title}`, {
        fontSize: '16px', fontFamily: 'Arial Black, Arial', color: '#ffdd44'
      }).setDepth(202).setVisible(false);
      this.clObjs.push(h); y += 26;
      rel.items.forEach(it => {
        const b = this.add.text(W / 2 - 288, y, '•  ' + it, {
          fontSize: '13px', fontFamily: 'Arial', color: '#cccccc'
        }).setDepth(202).setVisible(false);
        this.clObjs.push(b); y += 20;
      });
      y += 12;
    });

    const close = this.add.text(W / 2, H / 2 + 268, 'click anywhere to close', {
      fontSize: '13px', fontFamily: 'Arial', color: '#66aa88'
    }).setOrigin(0.5).setDepth(202).setVisible(false);
    this.clObjs.push(close);
    scrim.on('pointerdown', () => this.toggleChangelog(false));
  }

  toggleChangelog(show) {
    this.clObjs.forEach(o => o.setVisible(show));
  }
}

/* ═══════════════════════════════════════════
   MAP SELECT SCENE
═══════════════════════════════════════════ */
class MapSelectScene extends Phaser.Scene {
  constructor() { super('MapSelect'); }

  create() {
    this.add.rectangle(W / 2, H / 2, W, H, 0x0a0f0a);
    this.cameras.main.fadeIn(300, 0, 0, 0);
    this.add.text(W / 2, 84, 'CHOOSE YOUR CITY', {
      fontSize: '30px', fontFamily: PIXEL_FONT, color: '#00ff88', stroke: '#003311', strokeThickness: 6
    }).setOrigin(0.5);

    const blurbs = ['Dense city grid', 'Drive-through park', 'Waterfront & Ferris wheel', 'Fountain roundabout'];
    const cardW = 280, cardH = 150, gapX = 40, gapY = 34;
    const gx = [W / 2 - cardW / 2 - gapX / 2, W / 2 + cardW / 2 + gapX / 2];
    const gy = [200, 200 + cardH + gapY];

    MAPS.forEach((m, i) => {
      const x = gx[i % 2], y = gy[Math.floor(i / 2)];
      const card = this.add.rectangle(x, y, cardW, cardH, m.ground, 1)
        .setStrokeStyle(3, 0x225533).setInteractive({ useHandCursor: true });
      // colour swatches from the building palette
      m.palette.slice(0, 4).forEach((c, k) => this.add.rectangle(x - 96 + k * 30, y - 44, 24, 24, c));
      this.add.text(x, y + 4, m.name, {
        fontSize: '22px', fontFamily: 'Arial Black, Arial', color: '#ffffff', stroke: '#000', strokeThickness: 4
      }).setOrigin(0.5);
      this.add.text(x, y + 40, blurbs[i], {
        fontSize: '14px', fontFamily: 'Arial', color: '#dfeee0'
      }).setOrigin(0.5);
      card.on('pointerover', () => card.setStrokeStyle(3, 0x00ff88));
      card.on('pointerout',  () => card.setStrokeStyle(3, 0x225533));
      card.on('pointerdown', () => this.launch(i));
    });

    const randY = gy[1] + cardH / 2 + 60;
    const rnd = this.add.rectangle(W / 2, randY, 300, 54, 0x224422)
      .setStrokeStyle(2, 0x00ff88).setInteractive({ useHandCursor: true });
    this.add.text(W / 2, randY, '🎲  RANDOM CITY', {
      fontSize: '20px', fontFamily: 'Arial Black, Arial', color: '#ffffff'
    }).setOrigin(0.5);
    rnd.on('pointerover', () => rnd.setFillStyle(0x336633));
    rnd.on('pointerout',  () => rnd.setFillStyle(0x224422));
    rnd.on('pointerdown', () => this.launch(Phaser.Math.Between(0, MAPS.length - 1)));

    this.add.text(W / 2, H - 24, 'Pick a city to start your shift', {
      fontSize: '13px', fontFamily: 'Arial', color: '#66aa88'
    }).setOrigin(0.5);
  }

  launch(mapIndex) {
    this.cameras.main.fade(350, 0, 0, 0);
    this.time.delayedCall(350, () => this.scene.start('Game', { mapIndex }));
  }
}

/* ═══════════════════════════════════════════
   GAME OVER SCENE
═══════════════════════════════════════════ */
class GameOverScene extends Phaser.Scene {
  constructor() { super('GameOver'); }

  init(d) {
    this.finalScore = d.score || 0;
    this.peakHigh   = d.peakHigh || 0;
    this.reason     = d.reason   || 'You crashed';
  }

  create() {
    const prevBest = parseInt(localStorage.getItem('stonerHighScore') || '0');
    const isNewBest = Math.floor(this.finalScore) > prevBest;
    if (isNewBest) localStorage.setItem('stonerHighScore', Math.floor(this.finalScore));
    const bestScore = isNewBest ? Math.floor(this.finalScore) : prevBest;

    this.add.rectangle(W / 2, H / 2, W, H, 0x080808);
    this.add.text(W / 2, 120, 'GAME OVER', {
      fontSize: '44px', fontFamily: PIXEL_FONT,
      color: '#ff3333', stroke: '#550000', strokeThickness: 8
    }).setOrigin(0.5);

    this.add.text(W / 2, 205, this.reason, {
      fontSize: '22px', fontFamily: 'Arial', color: '#ffaa44'
    }).setOrigin(0.5);

    this.add.text(W / 2, 275, `Score: ${Math.floor(this.finalScore)}`, {
      fontSize: '30px', fontFamily: PIXEL_FONT, color: '#00ff88'
    }).setOrigin(0.5);

    if (isNewBest) {
      this.add.text(W / 2, 325, '🏆 NEW HIGH SCORE!', {
        fontSize: '20px', fontFamily: 'Arial Black, Arial', color: '#ffdd00'
      }).setOrigin(0.5);
    } else {
      this.add.text(W / 2, 325, `Best: ${bestScore}`, {
        fontSize: '18px', fontFamily: 'Arial', color: '#888888'
      }).setOrigin(0.5);
    }

    this.add.text(W / 2, 375, `Peak High: ${Math.floor(this.peakHigh)}%`, {
      fontSize: '24px', fontFamily: 'Arial', color: '#88ff44'
    }).setOrigin(0.5);

    const grade = this.peakHigh > 90 ? 'BLAZED AF' : this.peakHigh > 70 ? 'Certified Stoner' :
                  this.peakHigh > 50 ? 'Getting There' : this.peakHigh > 30 ? 'Casual Toker' : 'Basically Sober';
    this.add.text(W / 2, 420, grade, {
      fontSize: '20px', fontFamily: 'Arial', color: '#cccccc', fontStyle: 'italic'
    }).setOrigin(0.5);

    const btn = this.add.rectangle(W / 2, H - 100, 200, 54, 0x007733)
      .setInteractive({ useHandCursor: true });
    this.add.text(W / 2, H - 100, 'PLAY AGAIN', {
      fontSize: '15px', fontFamily: PIXEL_FONT, color: '#fff'
    }).setOrigin(0.5);

    btn.on('pointerover', () => btn.setFillStyle(0x00aa44));
    btn.on('pointerout',  () => btn.setFillStyle(0x007733));
    btn.on('pointerdown', () => {
      Bus.removeAllListeners();
      this.scene.stop('UI');
      this.scene.stop('TimeOff');
      this.scene.start('Menu');
    });
  }
}

/* ═══════════════════════════════════════════
   TIME OFF SCENE
═══════════════════════════════════════════ */
class TimeOffScene extends Phaser.Scene {
  constructor() { super('TimeOff'); }

  init(d) {
    this.money   = d.money;
    this.highLvl = d.highLevel;
    this.energy  = d.energy;
    this.hunger  = d.hunger;
    this.debt    = d.debt || 0;
  }

  create() {
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.78);

    this.add.text(W / 2, 70, 'SHIFT OVER', {
      fontSize: '30px', fontFamily: 'Arial Black, Arial', color: '#00ff88'
    }).setOrigin(0.5);

    let infoLine = `Cash: $${Math.floor(this.money)}   |   High: ${Math.floor(this.highLvl)}%   |   Energy: ${Math.floor(this.energy)}%`;
    if (this.debt > 0) infoLine += `   |   Debt: $${Math.floor(this.debt)}`;
    this.add.text(W / 2, 115, infoLine,
      { fontSize: '16px', fontFamily: 'Arial', color: '#ffff88' }).setOrigin(0.5);

    if (this.debt > 0) {
      // 4-card layout
      const xs = [W/2 - 345, W/2 - 115, W/2 + 115, W/2 + 345];
      this.makeCard(xs[0], H / 2, 'SLEEP', 'FREE\n+40 Energy',              0x1a3a6a, 'sleep',   this.energy < 100,         200);
      this.makeCard(xs[1], H / 2, 'EAT',   `-$${EAT_COST}\n+Hunger & Energy`,0x6a3010, 'eat',   this.money >= EAT_COST,    200);
      this.makeCard(xs[2], H / 2, 'SMOKE', `-$${SMOKE_COST}\n+${HIGH_PER_SMOKE}% High`, 0x0f4a22, 'smoke', this.money >= SMOKE_COST, 200);
      this.makeCard(xs[3], H / 2, 'PAY\nDEBT', `Pay $${Math.min(Math.floor(this.money), Math.floor(this.debt))}\nof $${Math.floor(this.debt)} owed`, 0x6a1a1a, 'paydebt', this.money > 0, 200);
    } else {
      this.makeCard(W / 2 - 300, H / 2, 'SLEEP', 'FREE\n+40 Energy',              0x1a3a6a, 'sleep', this.energy < 100);
      this.makeCard(W / 2,       H / 2, 'EAT',   `-$${EAT_COST}\n+Hunger & Energy`,0x6a3010, 'eat',  this.money >= EAT_COST);
      this.makeCard(W / 2 + 300, H / 2, 'SMOKE', `-$${SMOKE_COST}\n+${HIGH_PER_SMOKE}% High`, 0x0f4a22, 'smoke', this.money >= SMOKE_COST);
    }

    this.add.text(W / 2, H - 50, 'Tip: Buy weed at the corner store mid-shift with [E]', {
      fontSize: '13px', fontFamily: 'Arial', color: '#555555'
    }).setOrigin(0.5);
  }

  makeCard(x, y, title, desc, color, choice, enabled, w = 230) {
    const a  = enabled ? 1 : 0.38;
    const bg = this.add.rectangle(x, y, w, 210, color, 0.95)
      .setStrokeStyle(2, enabled ? 0x44ff88 : 0x333333).setAlpha(a);

    const emoji = { sleep: '😴', eat: '🍔', smoke: '🌿', paydebt: '💸' }[choice];
    this.add.text(x, y - 60, emoji, { fontSize: '32px' }).setOrigin(0.5).setAlpha(a);
    this.add.text(x, y - 10, title, {
      fontSize: '20px', fontFamily: 'Arial Black, Arial', color: '#ffffff', align: 'center'
    }).setOrigin(0.5).setAlpha(a);
    this.add.text(x, y + 50, desc, {
      fontSize: '14px', fontFamily: 'Arial', color: '#cccccc', align: 'center'
    }).setOrigin(0.5).setAlpha(a);

    if (enabled) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => bg.setAlpha(1));
      bg.on('pointerout',  () => bg.setFillStyle(color));
      bg.on('pointerdown', () => { Bus.emit('timeoff', choice); this.scene.stop(); });
    }
  }
}

/* ═══════════════════════════════════════════
   UI SCENE  (parallel overlay)
═══════════════════════════════════════════ */
class UIScene extends Phaser.Scene {
  constructor() { super('UI'); }

  create() {
    this.highLevel = 0;
    this.money     = 100;
    this.score     = 0;
    this.debt      = 0;
    this.mmData    = null;
    this.isTouch   = this.sys.game.device.input.touch ||
                     (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
                     /[?&]touch/.test(location.search);  // ?touch forces mobile controls

    // ── High meter ──
    const mX = 34, mCY = H / 2, mH = 280;
    this.add.rectangle(mX, mCY, 28, mH + 8, 0x222222).setScrollFactor(0);
    this.add.rectangle(mX, mCY, 24, mH, 0x111111).setScrollFactor(0);
    this.meterFill = this.add.rectangle(mX, mCY + mH / 2, 20, 2, 0x00ff44)
      .setOrigin(0.5, 1).setScrollFactor(0);
    this.mH = mH; this.mCY = mCY;
    this.add.text(mX, mCY - mH/2 - 14, '100', { fontSize: '10px', color: '#888', fontFamily: 'Arial' }).setOrigin(0.5).setScrollFactor(0);
    this.add.text(mX, mCY + mH/2 + 4,  '0',   { fontSize: '10px', color: '#888', fontFamily: 'Arial' }).setOrigin(0.5).setScrollFactor(0);
    this.add.text(mX, mCY + mH/2 + 20, 'HIGH', { fontSize: '11px', color: '#00ff44', fontFamily: 'Arial Black, Arial' }).setOrigin(0.5).setScrollFactor(0);
    this.highPctText = this.add.text(mX, mCY - mH/2 - 30, '0%', {
      fontSize: '13px', color: '#00ff44', fontFamily: 'Arial Black, Arial'
    }).setOrigin(0.5).setScrollFactor(0);

    // ── HUD texts ──
    this.moneyText = this.add.text(W - 12, 10, '$100', {
      fontSize: '16px', fontFamily: PIXEL_FONT, color: '#ffdd00',
      stroke: '#000', strokeThickness: 3
    }).setOrigin(1, 0).setScrollFactor(0);

    this.scoreText = this.add.text(W - 12, 38, 'Score: 0', {
      fontSize: '11px', fontFamily: PIXEL_FONT, color: '#88ff88',
      stroke: '#000', strokeThickness: 2
    }).setOrigin(1, 0).setScrollFactor(0);

    this.jobText = this.add.text(W / 2, 10, '', {
      fontSize: '17px', fontFamily: 'Arial Black, Arial', color: '#ffffff',
      stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5, 0).setScrollFactor(0);

    this.debtText = this.add.text(W / 2, 36, '', {
      fontSize: '14px', fontFamily: 'Arial', color: '#ff4444',
      stroke: '#000', strokeThickness: 2
    }).setOrigin(0.5, 0).setScrollFactor(0);

    // ── "Shaking them" evade bar (top-center, shown only while escaping) ──
    this.shakeLabel = this.add.text(W / 2, 58, 'SHAKING THEM', {
      fontSize: '12px', fontFamily: 'Arial Black, Arial', color: '#ffff66',
      stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(100).setVisible(false);
    this.shakeBarBg = this.add.rectangle(W / 2, 80, 224, 12, 0x000000, 0.85)
      .setScrollFactor(0).setDepth(100).setStrokeStyle(1, 0xffff66, 0.6).setVisible(false);
    this.shakeBarFill = this.add.rectangle(W / 2 - 110, 80, 0, 10, 0x33ff66)
      .setOrigin(0, 0.5).setScrollFactor(0).setDepth(101).setVisible(false);

    this.fxText = this.add.text(70, H / 2, '', {
      fontSize: '13px', fontFamily: 'Arial', color: '#88ff44',
      stroke: '#000', strokeThickness: 2, lineSpacing: 4
    }).setOrigin(0, 0.5).setScrollFactor(0);

    // ── Health bar ──
    this.add.text(12, H - 38, 'HP', { fontSize: '12px', color: '#ff8888', fontFamily: 'Arial Black, Arial' }).setScrollFactor(0);
    this.add.rectangle(60, H - 30, 120, 16, 0x330000).setOrigin(0, 0.5).setScrollFactor(0);
    this.healthBar = this.add.rectangle(60, H - 30, 120, 16, 0xff3333).setOrigin(0, 0.5).setScrollFactor(0);

    // ── Speedometer (desktop only — mobile has the joystick here) ──
    this.speedoG = null;
    if (!this.isTouch) {
      this.speedoCX = 58; this.speedoCY = H - 96; this.speedoR = 32;
      this.add.circle(this.speedoCX, this.speedoCY, this.speedoR + 10, 0x000000, 0.5).setScrollFactor(0).setDepth(95);
      this.speedoG = this.add.graphics().setScrollFactor(0).setDepth(96);
      this.speedoNum = this.add.text(this.speedoCX, this.speedoCY + 8, '0', {
        fontSize: '16px', fontFamily: 'Arial Black, Arial', color: '#ffffff', stroke: '#000', strokeThickness: 2
      }).setOrigin(0.5).setScrollFactor(0).setDepth(97);
      this.add.text(this.speedoCX, this.speedoCY + 24, 'MPH', {
        fontSize: '9px', fontFamily: 'Arial', color: '#88aacc'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(97);
    }

    // ── Night overlay ──
    this.nightOverlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000a22, 0).setScrollFactor(0).setDepth(88);

    // ── Clock ──
    this.clockText = this.add.text(W - 12, 62, '8:24 AM', {
      fontSize: '13px', fontFamily: 'Arial', color: '#aaaacc',
      stroke: '#000', strokeThickness: 2
    }).setOrigin(1, 0).setScrollFactor(0);

    // ── Vignette & tint overlays ──
    this.vignette    = this.add.graphics().setScrollFactor(0).setDepth(90);
    this.tintOverlay = this.add.rectangle(W / 2, H / 2, W, H, 0x00aa44, 0).setScrollFactor(0).setDepth(89);

    // ── Minimap (bottom-right) — hidden on touch to make room for controls ──
    this.mmDots = null;
    if (!this.isTouch) {
      const MM = 180;
      const MX = W - MM - 10, MY = H - MM - 10;
      const mmScale = MM / WORLD_W;
      this.mmX = MX; this.mmY = MY; this.mmScale = mmScale; this.mmSize = MM;

      this.add.rectangle(MX + MM/2, MY + MM/2, MM + 4, MM + 4, 0x000000, 0.85).setScrollFactor(0).setDepth(94);

      // Draw static road grid on minimap once
      const mmBg = this.add.graphics().setScrollFactor(0).setDepth(95);
      for (let r = 0; r < ROWS; r += RI) {
        mmBg.fillStyle(0x666677);
        mmBg.fillRect(MX, MY + r * mmScale, MM, TILE * 2 * mmScale);
      }
      for (let c = 0; c < COLS; c += RI) {
        mmBg.fillStyle(0x666677);
        mmBg.fillRect(MX + c * mmScale, MY, TILE * 2 * mmScale, MM);
      }

      // Hospital/pizzeria dots are drawn dynamically in update() — positions vary by map

      this.add.text(MX + MM / 2, MY - 12, 'MAP', {
        fontSize: '10px', color: '#aaaaaa', fontFamily: 'Arial'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(96);

      // Legend
      this.add.text(MX, MY + MM + 4, '🔴 Hosp  🟠 Pizza  ⚪ You  🟢/🔴 Job', {
        fontSize: '9px', color: '#888888', fontFamily: 'Arial'
      }).setScrollFactor(0).setDepth(96);

      // Dynamic dots layer
      this.mmDots = this.add.graphics().setScrollFactor(0).setDepth(97);
    }

    // ── Mute button ──
    this.muteBtn = this.add.text(W - 48, H - 14, '🔊', {
      fontSize: '16px', fontFamily: 'Arial', backgroundColor: '#224422', padding: { x: 5, y: 3 }
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(120).setInteractive({ useHandCursor: true });
    this.muteBtn.on('pointerdown', () => {
      const muted = SFX.toggleMute();
      this.muteBtn.setText(muted ? '🔇' : '🔊');
    });
    this.input.keyboard.on('keydown-M', () => {
      const muted = SFX.toggleMute();
      this.muteBtn.setText(muted ? '🔇' : '🔊');
    });

    // ── Help overlay (? button) ──
    this.helpVisible = false;
    const helpBtn = this.add.text(W - 14, H - 14, '?', {
      fontSize: '18px', fontFamily: 'Arial Black, Arial', color: '#ffffff',
      backgroundColor: '#224422', padding: { x: 7, y: 3 }
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(120).setInteractive({ useHandCursor: true });

    this.helpPanel = this.add.rectangle(W / 2, H / 2, 540, 340, 0x0a1a0a, 0.96)
      .setScrollFactor(0).setDepth(121).setStrokeStyle(2, 0x00ff88).setVisible(false);

    const helpLines = [
      ['🎮 CONTROLS',       'WASD / Arrows = drive    SPACE = brake    E = gas / store'],
      ['💼 JOBS',           'Pick up & deliver pizza or ambulance patients for cash'],
      ['🌿 GETTING HIGH',   'Smoke weed to raise your high meter — score = high × time'],
      ['🚗 SERPENTINE',     'The higher you are, the more your car sways & jerks'],
      ['⚠️  LOAN SHARK',    'Kill a pedestrian → debt → drive-by crew chases you'],
      ['💸 PAY DEBT',       'Choose "Pay Debt" at the time-off screen to call them off'],
      ['⛽ GAS STATION',    'Drive close and press E to restore health for $40'],
      ['🏪 CORNER STORE',   'Buy weed mid-shift for $45 with E — no need to wait'],
    ];
    this.helpTexts = helpLines.map(([ label, desc ], i) => {
      const y = H / 2 - 120 + i * 36;
      const a = this.add.text(W / 2 - 250, y, label, {
        fontSize: '13px', fontFamily: 'Arial Black, Arial', color: '#00ff88'
      }).setScrollFactor(0).setDepth(122).setVisible(false);
      const b = this.add.text(W / 2 - 50, y, desc, {
        fontSize: '12px', fontFamily: 'Arial', color: '#cccccc'
      }).setScrollFactor(0).setDepth(122).setVisible(false);
      return [a, b];
    });
    const helpTitle = this.add.text(W / 2, H / 2 - 152, 'HOW TO PLAY  —  press ? to close', {
      fontSize: '14px', fontFamily: 'Arial Black, Arial', color: '#ffffff'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(122).setVisible(false);
    this.helpTexts.push([helpTitle]);

    const toggleHelp = () => {
      this.helpVisible = !this.helpVisible;
      this.helpPanel.setVisible(this.helpVisible);
      this.helpTexts.forEach(row => row.forEach(t => t.setVisible(this.helpVisible)));
      helpBtn.setText(this.helpVisible ? '✕' : '?');
    };
    helpBtn.on('pointerdown', toggleHelp);
    this.input.keyboard.on('keydown-QUESTION_MARK', toggleHelp);

    // ── Pause overlay ──
    this.pauseOverlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6)
      .setScrollFactor(0).setDepth(150).setVisible(false);
    this.pauseText = this.add.text(W / 2, H / 2, 'PAUSED\n\nP: unpause\nM: mute / unmute\n?: controls', {
      fontSize: '28px', fontFamily: 'Arial Black, Arial', color: '#00ff88',
      align: 'center', stroke: '#000', strokeThickness: 4, lineSpacing: 10
    }).setOrigin(0.5).setScrollFactor(0).setDepth(151).setVisible(false);

    // ── Touch controls (mobile only) ──
    if (this.isTouch) this.buildTouchControls();

    Bus.on('ui-update', this.onUpdate, this);
    Bus.on('paranoid',  this.showParanoid, this);
    Bus.on('pause', (p) => {
      this.pauseOverlay.setVisible(p);
      this.pauseText.setVisible(p);
    });
  }

  buildTouchControls() {
    this.input.addPointer(3);   // allow multi-touch: joystick + buttons at once

    const mkBtn = (x, y, r, label, fs, color) => {
      const btn = this.add.circle(x, y, r, color, 0.34)
        .setScrollFactor(0).setDepth(160)
        .setStrokeStyle(3, 0xffffff, 0.55)
        .setInteractive({ useHandCursor: true });
      this.add.text(x, y, label, {
        fontSize: fs + 'px', fontFamily: 'Arial Black, Arial', color: '#ffffff'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(161);
      return btn;
    };
    // Held button: flag true while pressed (brake)
    const hold = (x, y, r, label, ctrl, color, fs = 34) => {
      const btn = mkBtn(x, y, r, label, fs, color);
      const set = (v) => { btn.setFillStyle(color, v ? 0.7 : 0.34); Bus.emit('touch', ctrl, v); };
      btn.on('pointerdown', () => set(true));
      btn.on('pointerup',   () => set(false));
      btn.on('pointerout',  () => set(false));
    };
    // Tap button: one-shot pulse, GameScene resets the flag (use / pause)
    const tap = (x, y, r, label, ctrl, color, fs = 20) => {
      const btn = mkBtn(x, y, r, label, fs, color);
      btn.on('pointerdown', () => { btn.setFillStyle(color, 0.7); Bus.emit('touch', ctrl, true); });
      btn.on('pointerup',   () => btn.setFillStyle(color, 0.34));
      btn.on('pointerout',  () => btn.setFillStyle(color, 0.34));
    };

    const bY = H - 108;
    hold(W - 100,  bY,       60, '▲',  'up',       0x22aa55);   // gas
    hold(W - 236,  bY,       54, '■',  'brake',    0xcc3333);
    tap (W - 100,  bY - 142, 46, 'USE', 'interact', 0xddaa22, 18);
    tap (58,       48,       32, '⏸',  'pause',    0x555566, 22);

    this.buildJoystick();
  }

  buildJoystick() {
    // Left-thumb analog stick: push the direction you want to drive, further = faster.
    const bx = 150, by = H - 160, baseR = 84, knobR = 42;
    this.add.circle(bx, by, baseR, 0x2266cc, 0.16)
      .setScrollFactor(0).setDepth(159).setStrokeStyle(3, 0xffffff, 0.4);
    const knob = this.add.circle(bx, by, knobR, 0x3388ff, 0.5)
      .setScrollFactor(0).setDepth(160).setStrokeStyle(3, 0xffffff, 0.6);

    // Grab zone a bit larger than the base so the thumb catches it easily
    const zone = this.add.zone(bx, by, baseR * 2.8, baseR * 2.8)
      .setScrollFactor(0).setInteractive();

    let pid = null;
    const update = (px, py) => {
      let dx = px - bx, dy = py - by;
      const d = Math.hypot(dx, dy);
      const clamped = Math.min(d, baseR);
      if (d > 0) { dx = dx / d * clamped; dy = dy / d * clamped; }
      knob.setPosition(bx + dx, by + dy);
      Bus.emit('stick', dx / baseR, dy / baseR, clamped / baseR);
    };
    const release = () => { pid = null; knob.setPosition(bx, by); Bus.emit('stick', 0, 0, 0); };

    zone.on('pointerdown', (p) => { pid = p.id; update(p.x, p.y); });
    this.input.on('pointermove', (p) => { if (p.id === pid) update(p.x, p.y); });
    this.input.on('pointerup',   (p) => { if (p.id === pid) release(); });
  }

  onUpdate(d) {
    this.highLevel = d.highLevel;
    this.money     = d.money;
    this.score     = d.score;
    this.debt      = d.debt;
    if (d.minimap) this.mmData = d.minimap;

    // Meter
    const fillH = (this.highLevel / 100) * this.mH;
    this.meterFill.height = fillH;
    this.meterFill.y = this.mCY + this.mH / 2;
    let mColor = 0x00ff44;
    if (this.highLevel > 75) mColor = 0xff2222;
    else if (this.highLevel > 50) mColor = 0xff8800;
    else if (this.highLevel > 25) mColor = 0xffee00;
    this.meterFill.setFillStyle(mColor);

    this.highPctText.setText(`${Math.floor(this.highLevel)}%`);
    this.moneyText.setText(`$${Math.floor(this.money)}`);
    this.scoreText.setText(`Score: ${Math.floor(this.score)}`);
    this.jobText.setText(d.jobStatus || '');
    this.debtText.setText(this.debt > 0 ? `🦈 LOAN SHARK: $${Math.floor(this.debt)} owed` : '');

    // Speedometer dial
    if (this.speedoG) {
      const g = this.speedoG; g.clear();
      const cx = this.speedoCX, cy = this.speedoCY, r = this.speedoR;
      const frac = Math.max(0, Math.min(1, (d.speed || 0) / 520));
      g.lineStyle(5, 0x334a5a, 1);
      g.beginPath(); g.arc(cx, cy, r, Math.PI, 2 * Math.PI, false); g.strokePath();
      g.lineStyle(5, frac > 0.82 ? 0xff4444 : 0x33ddff, 1);
      g.beginPath(); g.arc(cx, cy, r, Math.PI, Math.PI + frac * Math.PI, false); g.strokePath();
      const a = Math.PI + frac * Math.PI;
      g.lineStyle(3, 0xffffff, 1);
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4)); g.strokePath();
      g.fillStyle(0xffffff, 1); g.fillCircle(cx, cy, 3);
      this.speedoNum.setText(String(Math.round((d.speed || 0) * 0.22)));
    }

    // Shake-them evade bar
    const shake = d.shakeProgress || 0;
    const showShake = shake > 0.001;
    this.shakeLabel.setVisible(showShake);
    this.shakeBarBg.setVisible(showShake);
    this.shakeBarFill.setVisible(showShake);
    if (showShake) this.shakeBarFill.width = 220 * Math.min(1, shake);

    if (d.health !== undefined) {
      this.healthBar.width = Math.max(0, (d.health / 100) * 120);
      const hc = d.health > 60 ? 0x44ff44 : d.health > 30 ? 0xffaa00 : 0xff2222;
      this.healthBar.setFillStyle(hc);
    }

    const fx = [];
    if (this.highLevel > 20) fx.push('Buzzed');
    if (this.highLevel > 45) fx.push('Distorted');
    if (this.highLevel > 65) fx.push('Paranoid');
    if (this.highLevel > 82) fx.push('Controls flip');
    if (this.highLevel > 92) fx.push('BLAZED AF');
    if (d.hunted)            fx.push('Under fire');
    this.fxText.setText(fx.join('\n'));

    this.updateVignette();
    this.tintOverlay.setAlpha(Math.max(0, (this.highLevel - 25) / 75 * 0.13));

    // Night overlay: cos peaks at noon (0.5), troughs at midnight (0 or 1)
    if (d.timeOfDay !== undefined) {
      const sunHeight = Math.cos((d.timeOfDay - 0.5) * Math.PI * 2);
      const nightAlpha = Math.max(0, -sunHeight) * 0.72;
      this.nightOverlay.setAlpha(nightAlpha);

      const totalHours = d.timeOfDay * 24;
      const h24  = Math.floor(totalHours);
      const min  = Math.floor((totalHours - h24) * 60);
      const ampm = h24 < 12 ? 'AM' : 'PM';
      const h12  = h24 % 12 || 12;
      const isNight = nightAlpha > 0.05;
      this.clockText.setText(`${isNight ? '🌙' : '☀️'} ${h12}:${String(min).padStart(2,'0')} ${ampm}`);
    }
  }

  updateVignette() {
    this.vignette.clear();
    if (this.highLevel < 45) return;
    const s = (this.highLevel - 45) / 55;
    const eW = W * s * 0.22, eH = H * s * 0.22;
    this.vignette.fillStyle(0x001100, s * 0.75);
    this.vignette.fillRect(0, 0, eW, H);
    this.vignette.fillRect(W - eW, 0, eW, H);
    this.vignette.fillRect(0, 0, W, eH);
    this.vignette.fillRect(0, H - eH, W, eH);
  }

  showParanoid(msg) {
    const x = Phaser.Math.Between(160, W - 160);
    const y = Phaser.Math.Between(120, H - 120);
    const t = this.add.text(x, y, msg, {
      fontSize: '21px', fontFamily: 'Arial Black, Arial',
      color: '#ff2222', stroke: '#000', strokeThickness: 4
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200).setAlpha(0);
    this.tweens.add({
      targets: t, alpha: 1, y: y - 25, duration: 400,
      hold: 1400, yoyo: true,
      onComplete: () => t.destroy()
    });
  }

  update() {
    if (!this.mmDots || !this.mmData) return;
    const d = this.mmData;
    this.mmDots.clear();

    // POI dots (hospital red, pizzeria orange) — positions vary by map
    if (d.hosp) { this.mmDots.fillStyle(0xff4444); this.mmDots.fillCircle(this.mmX + d.hosp.x * this.mmScale, this.mmY + d.hosp.y * this.mmScale, 4); }
    if (d.pizz) { this.mmDots.fillStyle(0xff8800); this.mmDots.fillCircle(this.mmX + d.pizz.x * this.mmScale, this.mmY + d.pizz.y * this.mmScale, 4); }

    // Job destination dot
    if (d.isOnShift && d.dest) {
      const color = d.jobPhase === 'pickup' ? 0x00ff88 : 0xff4444;
      this.mmDots.fillStyle(color);
      this.mmDots.fillCircle(
        this.mmX + d.dest.x * this.mmScale,
        this.mmY + d.dest.y * this.mmScale, 4
      );
    }

    // Player blinking dot
    if (Math.floor(this.time.now / 400) % 2 === 0) {
      this.mmDots.fillStyle(0xffffff);
      this.mmDots.fillCircle(
        this.mmX + d.px * this.mmScale,
        this.mmY + d.py * this.mmScale, 4
      );
    }

  }
}

/* ═══════════════════════════════════════════
   GAME SCENE
═══════════════════════════════════════════ */
class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  init(d) { this._chosenMap = (d && typeof d.mapIndex === 'number') ? d.mapIndex : null; }

  create() {
    try {
      this._createInternal();
    } catch(e) {
      console.error('GameScene create() failed:', e);
      throw e;
    }
  }

  _createInternal() {
    // State
    this.highLevel        = 0;
    this.money            = 100;
    this.debt             = 0;
    this.hasLoanShark     = false;
    this.score            = 0;
    this.peakHigh         = 0;
    this.energy           = 100;
    this.hunger           = 80;
    this.health           = 100;
    this.playerSpeed      = 0;
    this.playerAngle      = 0;
    this.speedMod         = 1;
    this.turnMod          = 1;
    this.controlsInverted = false;
    this.invertTimer      = 0;
    this.wobbleTimer      = 0;
    this.paranoidTimer    = 0;
    this.lastBulletTime   = 0;
    this.isOnShift        = false;
    this.isInTimeOff      = false;
    this.jobType          = null;
    this.jobPhase         = null;
    this.shiftTimer       = 0;
    this.gameActive       = true;
    this.manslaughterCount= 0;
    this.shiftCount       = 0;
    this.pendingDebt      = 0;
    this.timeOfDay        = 0.35; // start at ~8 AM (0=midnight, 0.5=noon, 1=midnight)
    this.gasPos           = null;
    this.storePos         = null;
    this.pickupDest       = null;
    this.dropoffDest      = null;
    this.parkArea         = null;

    this.wallGroup  = this.physics.add.staticGroup();
    this.npcs       = this.physics.add.group();
    this.bullets    = this.physics.add.group();
    this.hitmen     = this.physics.add.group();
    this.traffic    = this.physics.add.group();
    this.hunted      = false;  // is the current shift a hunted (crew active) shift
    this.evadeTimer  = 0;      // seconds of separation built up toward shaking the crew
    this.nightsOwed  = 0;      // night shifts started while still in debt
    this.invulnUntil = 0;      // i-frame timestamp after a ram
    this.touch = { up: false, down: false, left: false, right: false, brake: false, interact: false, pause: false,
                   stickActive: false, stickX: 0, stickY: 0, stickMag: 0 };

    this.mapDef = (this._chosenMap != null) ? MAPS[this._chosenMap] : Phaser.Utils.Array.GetRandom(MAPS);
    this.buildTextures();
    this.buildWorld();
    this.buildPlayer();
    this.buildNPCs();
    this.buildTraffic();
    this.buildMarkers();

    this.cursors = this.input.keyboard.createCursorKeys();
    // Track WASD by physical key position (event.code) so it works on any keyboard
    // layout — Phaser's addKey maps by keyCode, which breaks on AZERTY/Dvorak/etc.
    this.moveKeys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
    this._onKeyDown = (e) => { if (e.code in this.moveKeys) this.moveKeys[e.code] = true; };
    this._onKeyUp   = (e) => { if (e.code in this.moveKeys) this.moveKeys[e.code] = false; };
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', this._onKeyDown);
      window.removeEventListener('keyup',   this._onKeyUp);
    });
    this.eKey     = this.input.keyboard.addKey('E');
    this.pKey     = this.input.keyboard.addKey('P');
    this.brakeKey = this.input.keyboard.addKey('SPACE');
    this.sprintKey = this.input.keyboard.addKey('SHIFT');
    this.paused   = false;

    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    this.physics.add.collider(this.player, this.wallGroup, this.hitWall,    null, this);
    this.physics.add.collider(this.npcs,   this.wallGroup);
    this.physics.add.collider(this.hitmen, this.wallGroup);
    this.physics.add.overlap (this.player, this.npcs,    this.hitNPC,     null, this);
    this.physics.add.overlap (this.player, this.bullets,  this.hitBullet,  null, this);
    this.physics.add.overlap (this.player, this.hitmen,   this.hitByHitman, null, this);

    this.statusText = this.add.text(W / 2, 80, '', {
      fontSize: '22px', fontFamily: 'Arial Black, Arial', color: '#ffffff',
      stroke: '#000000', strokeThickness: 5,
      backgroundColor: '#00000099', padding: { x: 12, y: 6 }
    }).setOrigin(0.5).setDepth(60).setScrollFactor(0);

    Bus.on('timeoff', this.onTimeOffChoice, this);
    Bus.on('touch', (c, v) => { this.touch[c] = v; }, this);
    Bus.on('stick', (x, y, m) => {
      this.touch.stickX = x; this.touch.stickY = y; this.touch.stickMag = m;
      this.touch.stickActive = m > 0.01;
    }, this);

    this.scene.launch('UI');

    SFX.init();
    SFX.startMusic();

    this.time.delayedCall(1800, () => this.startNewShift());
    this.showStatus(`📍 ${this.mapDef.name} — starting shift soon...`);
  }

  /* ── World ── */
  buildWorld() {
    const M = this.mapDef;
    this.southBound = WORLD_H;   // overridden by a waterfront edge
    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, M.ground);
    const g = this.add.graphics();

    // Roads — 2 tiles wide (interior grid + right/bottom border)
    const roadCols = [];
    const roadRows = [];
    for (let i = 0; i < COLS; i++) { if (i % RI === 0) roadCols.push(i); }
    for (let j = 0; j < ROWS; j++) { if (j % RI === 0) roadRows.push(j); }
    // Add border roads at right and bottom edges
    const borderCol = COLS - 2;
    const borderRow = ROWS - 2;
    if (!roadCols.includes(borderCol)) roadCols.push(borderCol);
    if (!roadRows.includes(borderRow)) roadRows.push(borderRow);
    this.roadCols = roadCols; this.roadRows = roadRows;   // lane indices for traffic

    for (const i of roadCols) {
      g.fillStyle(M.road);
      g.fillRect(i * TILE, 0, TILE * 2, WORLD_H);
      g.fillStyle(0xffffaa, 0.2);
      g.fillRect(i * TILE + TILE - 2, 0, 4, WORLD_H);
    }
    for (const j of roadRows) {
      g.fillStyle(M.road);
      g.fillRect(0, j * TILE, WORLD_W, TILE * 2);
      g.fillStyle(0xffffaa, 0.2);
      g.fillRect(0, j * TILE + TILE - 2, WORLD_W, 4);
    }

    // Buildings — start 2 tiles in from each road
    const bColors = M.palette;
    this.houseSpots = [];
    this.hospitalPos = null;
    this.pizzeriaPos = null;

    const sections = Math.floor(COLS / RI); // 4
    for (let sc = 0; sc < sections; sc++) {
      for (let sr = 0; sr < sections; sr++) {
        const bx = (sc * RI + 2) * TILE;
        const by = (sr * RI + 2) * TILE;
        const bw = Math.min((RI - 2) * TILE, borderCol * TILE - bx);
        const bh = Math.min((RI - 2) * TILE, borderRow * TILE - by);
        if (bw <= 0 || bh <= 0) continue;
        const mg = 12;

        // Map features — special blocks drawn instead of a building
        if (M.feature && sc === M.feature.block[0] && sr === M.feature.block[1]) {
          const px = bx + mg, py = by + mg, pw = bw - mg * 2, ph = bh - mg * 2;
          if (M.feature.type === 'park') {
            // Drive-through park: grass, trees, path, no wall, extra pedestrians
            g.fillStyle(0x3f7a34); g.fillRect(px, py, pw, ph);
            g.fillStyle(0x8a7a5a, 0.45); g.fillRect(px, py + ph / 2 - 9, pw, 18);
            [[px+42,py+42],[px+pw-42,py+54],[px+pw-58,py+ph-48],[px+52,py+ph-42],[px+pw/2,py+40]].forEach(t => {
              g.fillStyle(0x4a2f16); g.fillRect(t[0] - 3, t[1], 6, 15);
              g.fillStyle(0x2e6b28); g.fillCircle(t[0], t[1], 17);
              g.fillStyle(0x3f8a36); g.fillCircle(t[0] - 5, t[1] - 5, 9);
            });
            this.add.text(bx + bw / 2, by + bh / 2, '🌳 PARK', {
              fontSize: '15px', fontFamily: 'Arial Black, Arial', color: '#c7efa0', stroke: '#112233', strokeThickness: 3
            }).setOrigin(0.5).setDepth(5);
            this.parkArea = { x: px, y: py, w: pw, h: ph };
          } else if (M.feature.type === 'roundabout') {
            // Fountain roundabout: paved drivable ring around a solid central island
            g.fillStyle(M.road); g.fillRect(px, py, pw, ph);
            const fcx = bx + bw / 2, fcy = by + bh / 2, fr = Math.min(pw, ph) * 0.26;
            g.fillStyle(0x9a9a9a); g.fillCircle(fcx, fcy, fr);
            g.fillStyle(0x3f7fb0); g.fillCircle(fcx, fcy, fr - 10);
            g.fillStyle(0xcfd6dd); g.fillCircle(fcx, fcy, 11);
            const iw = fr * 1.5;
            const wall = this.wallGroup.create(fcx, fcy, 'pixel');
            wall.setVisible(false); wall.setDisplaySize(iw, iw); wall.refreshBody();
            this.add.text(fcx, fcy - fr - 14, '⛲ PLAZA', {
              fontSize: '14px', fontFamily: 'Arial Black, Arial', color: '#dfeaf5', stroke: '#112233', strokeThickness: 3
            }).setOrigin(0.5).setDepth(5);
          }
          continue;
        }

        // Water-edge maps: the bottom row of blocks is open water (drawn after the grid)
        if (M.waterEdge === 'south' && sr === sections - 1) continue;

        const isHosp  = sc === M.poi.hospital[0] && sr === M.poi.hospital[1];
        const isPizz  = sc === M.poi.pizzeria[0] && sr === M.poi.pizzeria[1];
        const isGas   = sc === M.poi.gas[0]      && sr === M.poi.gas[1];
        const isStore = sc === M.poi.store[0]    && sr === M.poi.store[1];

        let color = bColors[(sc * sections + sr) % bColors.length];
        if (isHosp)  color = 0xdddddd;
        if (isPizz)  color = 0xcc6600;
        if (isGas)   color = 0x888844;
        if (isStore) color = 0x226622;

        g.fillStyle(color);
        g.fillRect(bx + mg, by + mg, bw - mg * 2, bh - mg * 2);
        g.fillStyle(0x000000, 0.25);
        g.fillRect(bx + mg, by + mg, bw - mg * 2, 7);
        g.fillRect(bx + mg, by + mg, 7, bh - mg * 2);

        // Physics wall — StaticGroup image sized to the building
        const wallW = bw - mg * 2;
        const wallH = bh - mg * 2;
        const wallCX = bx + mg + wallW / 2;
        const wallCY = by + mg + wallH / 2;
        const wall = this.wallGroup.create(wallCX, wallCY, 'pixel');
        wall.setVisible(false);
        wall.setDisplaySize(wallW, wallH);
        wall.refreshBody();

        const cx = bx + bw / 2;
        const cy = by + bh / 2;

        // Road access point: on the road strip to the RIGHT of this block (general)
        const roadCol  = (sc + 1 < sections) ? (sc + 1) * RI : sc * RI;
        const accessX  = roadCol * TILE + TILE;  // center of 2-tile-wide road
        const accessY  = cy;

        // Bottom-entrance access: center of building, bottom edge (south road)
        const bottomX = cx;
        const bottomY = by + bh;

        if (isHosp) {
          g.fillStyle(0xff0000);
          g.fillRect(cx - 6, cy - 28, 12, 56);
          g.fillRect(cx - 28, cy - 6, 56, 12);
          this.hospitalPos = { x: bottomX, y: bottomY };
          // pulsing entrance circle
          const hc = this.add.circle(bottomX, bottomY, 14, 0xff4444, 0.85).setDepth(6);
          this.tweens.add({ targets: hc, scaleX: 1.5, scaleY: 1.5, alpha: 0.3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          this.add.text(cx, cy + 50, '🏥 HOSPITAL', {
            fontSize: '16px', fontFamily: 'Arial Black, Arial',
            color: '#ff4444', stroke: '#fff', strokeThickness: 3
          }).setOrigin(0.5).setDepth(5);
        } else if (isPizz) {
          this.pizzeriaPos = { x: bottomX, y: bottomY };
          // pulsing entrance circle
          const pc = this.add.circle(bottomX, bottomY, 14, 0xff6600, 0.85).setDepth(6);
          this.tweens.add({ targets: pc, scaleX: 1.5, scaleY: 1.5, alpha: 0.3, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          this.add.text(cx, cy, '🍕\nPIZZA HQ', {
            fontSize: '20px', fontFamily: 'Arial Black, Arial',
            color: '#ffffff', align: 'center', stroke: '#000', strokeThickness: 3
          }).setOrigin(0.5).setDepth(5);
        } else if (isGas) {
          this.gasPos = { x: accessX, y: accessY };
          this.add.text(cx, cy, '⛽\nGAS', {
            fontSize: '20px', fontFamily: 'Arial Black, Arial',
            color: '#ffff88', align: 'center', stroke: '#000', strokeThickness: 3
          }).setOrigin(0.5).setDepth(5);
        } else if (isStore) {
          this.storePos = { x: accessX, y: accessY };
          this.add.text(cx, cy, '🏪\nSTORE', {
            fontSize: '20px', fontFamily: 'Arial Black, Arial',
            color: '#aaffaa', align: 'center', stroke: '#000', strokeThickness: 3
          }).setOrigin(0.5).setDepth(5);
        } else {
          // Delivery access point is on the road beside the building
          this.houseSpots.push({ x: accessX, y: accessY });
          g.fillStyle(0x8B4513, 0.7);
          g.fillRect(cx - 8, by + bh - mg - 20, 16, 20);
        }
      }
    }

    // ── Waterfront edge (e.g. The Docks): open water along the south of the map ──
    if (M.waterEdge === 'south') {
      const wt = (sections - 1) * RI * TILE + 2 * TILE;   // top of the water band
      const boardH = 58, waterY = wt + boardH, waterH = WORLD_H - waterY;
      this.southBound = wt;
      g.fillStyle(0x8a5a2a); g.fillRect(0, wt, WORLD_W, boardH);                      // boardwalk
      g.fillStyle(0x5a3818, 0.6); for (let x = 0; x < WORLD_W; x += 18) g.fillRect(x, wt, 2, boardH);
      g.fillStyle(0x2f6a8f); g.fillRect(0, waterY, WORLD_W, waterH);                  // water
      g.fillStyle(0x4a86ad, 0.5); for (let y = waterY + 18; y < WORLD_H - 6; y += 24) g.fillRect(24, y, WORLD_W - 48, 3);
      [0.16, 0.44, 0.72, 0.9].forEach(fx => {                                          // boats
        const bxp = WORLD_W * fx, byp = waterY + 68;
        g.fillStyle(0x7a4a2a); g.fillRect(bxp - 34, byp - 9, 60, 18);
        g.fillTriangle(bxp + 26, byp - 9, bxp + 46, byp, bxp + 26, byp + 9);
        g.fillStyle(0xe8e8e8); g.fillRect(bxp - 12, byp - 22, 20, 15);
        g.fillStyle(0x333333); g.fillRect(bxp - 1, byp - 42, 3, 22);
      });
      const wcx = WORLD_W * 0.5, wcy = wt + boardH - 8, wr = 42;                       // ferris wheel
      g.lineStyle(5, 0xe8e8e8, 1); g.strokeCircle(wcx, wcy, wr);
      for (let s = 0; s < 8; s++) { const a = s * Math.PI / 4; g.lineBetween(wcx, wcy, wcx + Math.cos(a) * wr, wcy + Math.sin(a) * wr); }
      for (let s = 0; s < 8; s++) { const a = s * Math.PI / 4; g.fillStyle(s % 2 ? 0xff5566 : 0xffcc44); g.fillCircle(wcx + Math.cos(a) * wr, wcy + Math.sin(a) * wr, 6); }
      const wall = this.wallGroup.create(WORLD_W / 2, waterY + waterH / 2, 'pixel');   // impassable water
      wall.setVisible(false); wall.setDisplaySize(WORLD_W, waterH); wall.refreshBody();
      this.add.text(WORLD_W * 0.22, wt + 28, '🎡 PIER', {
        fontSize: '16px', fontFamily: 'Arial Black, Arial', color: '#ffe4a0', stroke: '#3a2a10', strokeThickness: 3
      }).setOrigin(0.5).setDepth(5);
    }

    // ── Highway on/off ramp at the top edge (cars stream in and out here) ──
    if (M.highway) {
      const ex = (this.roadCols[1] || RI) * TILE + TILE;
      g.fillStyle(M.road); g.fillRect(ex - TILE - 24, 0, TILE * 2 + 48, TILE + 40);   // widened ramp mouth
      g.fillStyle(0xffdd44, 0.85);
      for (let k = 0; k < 3; k++) { const yy = 26 + k * 22; g.fillTriangle(ex - 15, yy, ex + 15, yy, ex, yy + 15); }
      this.add.text(ex, 104, '🛣️ HIGHWAY', {
        fontSize: '14px', fontFamily: 'Arial Black, Arial', color: '#ffdd66', stroke: '#000', strokeThickness: 3
      }).setOrigin(0.5).setDepth(5);
    }
  }

  /* ── Textures ── */
  buildTextures() {
    // Cars
    const pizzaG = this.make.graphics({ add: false });
    this.drawCar(pizzaG, 0xdd3300, false, false);
    pizzaG.generateTexture('car_pizza', 36, 56);
    pizzaG.destroy();

    const ambG = this.make.graphics({ add: false });
    this.drawCar(ambG, 0xffffff, true, false);
    ambG.generateTexture('car_amb', 36, 56);
    ambG.destroy();

    const hitG = this.make.graphics({ add: false });
    this.drawCar(hitG, 0x111111, false, false);
    hitG.fillStyle(0xff0000); hitG.fillRect(7, 2, 7, 4); hitG.fillRect(22, 2, 7, 4); // red headlights
    hitG.generateTexture('car_hitman', 36, 56);
    hitG.destroy();

    // Civilian traffic cars (a few colours)
    const trafficColors = [0x3366cc, 0x8a8a8a, 0xccaa33, 0x55aa66, 0xbb5544];
    this._trafficTexCount = trafficColors.length;
    trafficColors.forEach((col, i) => {
      const tg = this.make.graphics({ add: false });
      this.drawCar(tg, col, false, false);
      tg.generateTexture('car_traffic' + i, 36, 56);
      tg.destroy();
    });

    // NPC
    const npcG = this.make.graphics({ add: false });
    npcG.fillStyle(0xffcc88); npcG.fillCircle(8, 6, 6);
    npcG.fillStyle(0x4488ee); npcG.fillRect(3, 12, 10, 14);
    npcG.fillStyle(0x222244); npcG.fillRect(3, 26, 5, 12); npcG.fillRect(8, 26, 5, 12);
    npcG.generateTexture('npc', 16, 38);
    npcG.destroy();

    // Bullet
    const bulG = this.make.graphics({ add: false });
    bulG.fillStyle(0xffee00); bulG.fillCircle(5, 5, 5);
    bulG.generateTexture('bullet', 10, 10);
    bulG.destroy();

    // Markers
    const pmG = this.make.graphics({ add: false });
    pmG.fillStyle(0x00ff88); pmG.fillTriangle(16, 0, 0, 32, 32, 32);
    pmG.generateTexture('marker_green', 32, 32);
    pmG.destroy();

    const dmG = this.make.graphics({ add: false });
    dmG.fillStyle(0xff4444); dmG.fillTriangle(16, 0, 0, 32, 32, 32);
    dmG.generateTexture('marker_red', 32, 32);
    dmG.destroy();
  }

  drawCar(g, bodyColor, isAmb, isCop) { drawCarShape(g, bodyColor, isAmb, isCop); }

  /* ── Player ── */
  buildPlayer() {
    const sx = RI * TILE + TILE;  // center of 2-tile-wide road
    const sy = RI * TILE + TILE;

    this.player = this.physics.add.sprite(sx, sy, 'car_pizza');
    this.player.setDepth(15);
    this.player.body.setSize(24, 44);
    this.player.body.setOffset(6, 6);
    this.player.setCollideWorldBounds(true);
  }

  /* ── NPCs ── */
  buildNPCs() {
    this.npcList = [];
    this._spawnNPCs(NPC_COUNT);
    if (this.parkArea) this._spawnParkNPCs(5);
  }

  /* ── Ambient traffic — civilian cars driving the roads, turning at intersections ── */
  buildTraffic() {
    this.trafficList = [];
    this.colCenters = this.roadCols.map(c => c * TILE + TILE);
    this.rowCenters = this.roadRows.map(r => r * TILE + TILE).filter(y => y < this.southBound - 40);
    const trafficN = this.mapDef.trafficCount || TRAFFIC_COUNT;
    for (let i = 0; i < trafficN; i++) {
      const horizontal = Math.random() < 0.5;
      const car = this.traffic.create(0, 0, 'car_traffic' + Phaser.Math.Between(0, this._trafficTexCount - 1));
      car.setDepth(11);
      car.body.setSize(24, 44);
      car.setImmovable(true);
      car.axis  = horizontal ? 'h' : 'v';
      car.dir   = Math.random() < 0.5 ? 1 : -1;
      car.speed = Phaser.Math.Between(70, 205);   // wide range = more havoc
      car._pri  = i;   // priority for breaking intersection ties (lower index wins)
      car.laneCenter = horizontal ? Phaser.Utils.Array.GetRandom(this.rowCenters)
                                  : Phaser.Utils.Array.GetRandom(this.colCenters);
      if (horizontal) car.x = Phaser.Math.Between(120, WORLD_W - 120);
      else            car.y = Phaser.Math.Between(120, this.southBound - 120);
      this._setTrafficVel(car);
      car._prevX = car.x; car._prevY = car.y;
      this.trafficList.push(car);
    }
    this.physics.add.collider(this.player, this.traffic, this.hitTraffic, null, this);
    this.physics.add.collider(this.npcs, this.traffic);   // pedestrians don't walk through cars
  }

  // Sets velocity + snaps the car to the correct side of its road (two-way lanes)
  _setTrafficVel(car) {
    if (car.axis === 'h') {
      car.y = car.laneCenter + car.dir * TRAFFIC_LANE_OFFSET;
      car.setVelocity(car.dir * car.speed, 0);
      car.setAngle(car.dir > 0 ? 90 : 270);
    } else {
      car.x = car.laneCenter + car.dir * TRAFFIC_LANE_OFFSET;
      car.setVelocity(0, car.dir * car.speed);
      car.setAngle(car.dir > 0 ? 180 : 0);
    }
  }

  // Highway maps: send a car back onto the map from a random edge, driving inward
  _recycleTraffic(car) {
    car.speed = Phaser.Math.Between(70, 205);
    const side = Phaser.Math.Between(0, 3);
    if (side === 0)      { car.axis = 'v'; car.dir =  1; car.laneCenter = Phaser.Utils.Array.GetRandom(this.colCenters); car.y = 70; }
    else if (side === 1) { car.axis = 'v'; car.dir = -1; car.laneCenter = Phaser.Utils.Array.GetRandom(this.colCenters); car.y = this.southBound - 70; }
    else if (side === 2) { car.axis = 'h'; car.dir =  1; car.laneCenter = Phaser.Utils.Array.GetRandom(this.rowCenters); car.x = 70; }
    else                 { car.axis = 'h'; car.dir = -1; car.laneCenter = Phaser.Utils.Array.GetRandom(this.rowCenters); car.x = WORLD_W - 70; }
    this._setTrafficVel(car);
    car._prevX = car.x; car._prevY = car.y;
  }

  updateTraffic() {
    this.trafficList.forEach(car => {
      if (!car.active) return;
      // At a map edge: highway maps drive off and re-enter (constant flow); others bounce
      const atEdge =
        (car.axis === 'h' && ((car.x < 50 && car.dir < 0) || (car.x > WORLD_W - 50 && car.dir > 0))) ||
        (car.axis === 'v' && ((car.y < 50 && car.dir < 0) || (car.y > this.southBound - 50 && car.dir > 0)));
      if (atEdge) {
        if (this.mapDef.highway) { this._recycleTraffic(car); return; }
        car.dir *= -1; this._setTrafficVel(car);
      }
      // Randomly turn onto a crossing road at intersections (going nowhere in particular)
      const canTurn = this.time.now - (car._turnCd || 0) > 700;
      const alongCenters = car.axis === 'h' ? this.colCenters : this.rowCenters;
      const along = car.axis === 'h' ? car.x : car.y;
      const prevAlong = car.axis === 'h' ? car._prevX : car._prevY;
      for (const pc of alongCenters) {
        if ((prevAlong < pc && along >= pc) || (prevAlong > pc && along <= pc)) {
          if (canTurn && Math.random() < 0.3) {
            car.laneCenter = pc;
            car.axis = car.axis === 'h' ? 'v' : 'h';
            car.dir = Math.random() < 0.5 ? 1 : -1;
            car._turnCd = this.time.now;
            this._setTrafficVel(car);
          }
          break;
        }
      }
      car._prevX = car.x; car._prevY = car.y;
    });

    // No overlapping: follow the car ahead in your lane, yield to priority at crossings
    this.trafficList.forEach(car => {
      if (!car.active) return;
      let blocked = false;
      for (const o of this.trafficList) {
        if (o === car || !o.active) continue;
        if (o.axis === car.axis) {
          const ahead = car.axis === 'h' ? (o.x - car.x) * car.dir : (o.y - car.y) * car.dir;
          const lat   = car.axis === 'h' ? Math.abs(o.y - car.y) : Math.abs(o.x - car.x);
          if (lat < 18 && ahead > 2 && ahead < 52) { blocked = true; break; }
        } else if (o._pri < car._pri) {
          let fx = car.x, fy = car.y;
          if (car.axis === 'h') fx += car.dir * 32; else fy += car.dir * 32;
          if (Math.abs(o.x - fx) < 26 && Math.abs(o.y - fy) < 26) { blocked = true; break; }
        }
      }
      if (blocked) car.setVelocity(0, 0);
      else if (car.body.velocity.x === 0 && car.body.velocity.y === 0) this._setTrafficVel(car);
    });
  }

  hitTraffic(player, car) {
    const spd = Math.abs(this.playerSpeed);
    if (spd < 40) return;
    if (this.time.now - (this._lastTrafficHit || 0) < 400) return;
    this._lastTrafficHit = this.time.now;
    this.playerSpeed *= 0.4;
    this.cameras.main.shake(200, 0.012);
    SFX.playImpact(Math.min(1, spd / 320));
  }

  _spawnParkNPCs(count) {
    const a = this.parkArea;
    for (let i = 0; i < count; i++) {
      const x = a.x + Phaser.Math.Between(20, a.w - 20);
      const y = a.y + Phaser.Math.Between(20, a.h - 20);
      const npc = this.npcs.create(x, y, 'npc');
      npc.setDepth(10);
      npc.body.setSize(14, 32);
      npc.setCollideWorldBounds(true);
      npc.alive     = true;
      npc.walkTimer = Phaser.Math.Between(800, 2500);
      npc.walkDir   = Phaser.Math.Between(0, 3);
      npc.walkSpeed = Phaser.Math.Between(30, 60);
      this.npcList.push(npc);
    }
  }

  _spawnNPCs(count) {
    for (let i = 0; i < count; i++) {
      const roadCol = (Phaser.Math.Between(0, Math.floor(COLS / RI) - 1)) * RI;
      const row     = Phaser.Math.Between(2, ROWS - 2);
      const x = roadCol * TILE + Phaser.Math.Between(-10, 10) + TILE;
      const y = row * TILE + Phaser.Math.Between(0, TILE - 10);

      const npc = this.npcs.create(x, y, 'npc');
      npc.setDepth(10);
      npc.body.setSize(14, 32);
      npc.setCollideWorldBounds(true);
      npc.alive     = true;
      npc.walkTimer = Phaser.Math.Between(800, 2500);
      npc.walkDir   = Phaser.Math.Between(0, 3);
      npc.walkSpeed = Phaser.Math.Between(35, 75);
      if (!this.npcList) this.npcList = [];
      this.npcList.push(npc);
    }
  }

  /* ── Markers ── */
  buildMarkers() {
    this.pickupMarker  = this.add.sprite(0, 0, 'marker_green').setVisible(false).setDepth(25).setScale(1.2);
    this.dropoffMarker = this.add.sprite(0, 0, 'marker_red').setVisible(false).setDepth(25).setScale(1.2);
    this.tweens.add({ targets: this.pickupMarker,  y: '+=12', duration: 600, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: this.dropoffMarker, y: '+=12', duration: 600, yoyo: true, repeat: -1 });

    this.arrowText = this.add.text(W / 2, H - 40, '', {
      fontSize: '18px', fontFamily: 'Arial Black, Arial', color: '#ffff00',
      stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setScrollFactor(0).setDepth(70);
  }

  /* ── Jobs ── */
  startNewShift() {
    if (!this.gameActive) return;

    this.jobType   = Math.random() < 0.5 ? 'pizza' : 'ambulance';
    this.jobPhase  = 'pickup';
    this.isOnShift = true;
    this.shiftTimer = SHIFT_DURATION;

    this.player.setTexture(this.jobType === 'pizza' ? 'car_pizza' : 'car_amb');

    const house = Phaser.Utils.Array.GetRandom(this.houseSpots);

    if (this.jobType === 'pizza') {
      this.pickupDest  = { ...this.pizzeriaPos };
      this.dropoffDest = { x: house.x, y: house.y };
      this.showStatus('🍕 Pizza shift! Head to PIZZA HQ');
    } else {
      this.pickupDest  = { x: house.x, y: house.y };
      this.dropoffDest = { ...this.hospitalPos };
      this.showStatus('🚑 Ambulance shift! Pick up the patient!');
      // pulsing circle on the pickup house
      this._houseCircle = this.add.circle(house.x, house.y, 14, 0x44ddff, 0.85).setDepth(6);
      this.tweens.add({ targets: this._houseCircle, scaleX: 1.5, scaleY: 1.5, alpha: 0.3,
        duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    this.pickupMarker.setPosition(this.pickupDest.x, this.pickupDest.y - 45);
    this.pickupMarker.setVisible(true);
    this.dropoffMarker.setVisible(false);

    // Loan shark's crew hunts at night while you owe — and day+night once ignored too long
    this.hunted = false;
    this.hitmen.clear(true, true);
    this.bullets.clear(true, true);
    if (this.hasLoanShark && this.debt > 0) {
      const night = this.isNight();
      if (night) this.nightsOwed++;
      const boldDay = !night && this.nightsOwed >= BOLD_NIGHTS;
      if (night || boldDay) {
        this.hunted = true;
        const cap = boldDay ? 3 : 2;
        this.time.delayedCall(2500, () => this.showStatus(boldDay
          ? '🦈 You ignored the debt too long — the crew hunts you in broad daylight now!'
          : '🌙 Night shift — the crew is hunting you. Lose them or pay your debt!'));
        for (let i = 0; i < cap; i++) {
          this.time.delayedCall(6000 + i * 8000, () => { if (this.isOnShift && this.hunted) this.spawnHitman(); });
        }
      }
    }
  }

  isNight() {
    const sunHeight = Math.cos((this.timeOfDay - 0.5) * Math.PI * 2);
    return Math.max(0, -sunHeight) * 0.72 > 0.05;
  }

  endShift(success) {
    this.isOnShift = false;
    this.hunted = false;
    this.hitmen.clear(true, true);
    this.bullets.clear(true, true);
    this.pickupMarker.setVisible(false);
    this.dropoffMarker.setVisible(false);
    this.arrowText.setText('');
    if (this._houseCircle) { this._houseCircle.destroy(); this._houseCircle = null; }

    // Advance time of day (~2.5 hrs per shift)
    this.timeOfDay = (this.timeOfDay + 0.104) % 1;
    this.energy = Math.max(0, this.energy - 20);   // a shift's work wears you down — sleep to recover

    if (success) {
      this.shiftCount++;
      this.money += JOB_PAY;
      SFX.playDropoff();
      if (this.debt > 0) {
        const pmt = Math.min(80, this.debt);
        this.debt  -= pmt;
        this.money -= pmt;
        if (this.debt <= 0) { this.debt = 0; this.hasLoanShark = false; this.nightsOwed = 0; }
      }
      // Spawn 3 more pedestrians each shift, cap at 40
      const aliveCount = this.npcs.getChildren().filter(n => n.alive).length;
      const toSpawn = Math.min(3, 40 - aliveCount);
      if (toSpawn > 0) this._spawnNPCs(toSpawn);
      this.showStatus(`✅ Job complete! +$${JOB_PAY}`);
    } else {
      this.showStatus('⏰ Shift ended — no pay');
    }

    // Apply any debt racked up mid-shift from extra kills
    if (this.pendingDebt > 0) {
      this.debt += this.pendingDebt;
      if (this.pendingDebt > 0) this.showStatus(`🦈 +$${this.pendingDebt} added to your debt`);
      this.pendingDebt = 0;
    }

    this.isInTimeOff = true;
    this.time.delayedCall(2000, () => {
      this.scene.launch('TimeOff', {
        money: this.money, highLevel: this.highLevel,
        energy: this.energy, hunger: this.hunger,
        debt: this.debt
      });
    });
  }

  onTimeOffChoice(choice) {
    this.isInTimeOff = false;

    switch (choice) {
      case 'sleep':
        this.energy = Math.min(100, this.energy + 40);
        this.showStatus('😴 You feel rested');
        break;
      case 'eat':
        if (this.money >= EAT_COST) {
          this.money -= EAT_COST;
          this.hunger = Math.min(100, this.hunger + 40);
          this.energy = Math.min(100, this.energy + 10);
          this.showStatus('🍔 Munchies handled');
        }
        break;
      case 'smoke':
        if (this.money >= SMOKE_COST) {
          this.money -= SMOKE_COST;
          this.highLevel = Math.min(MAX_HIGH, this.highLevel + HIGH_PER_SMOKE);
          SFX.playSmoke();
          this.cameras.main.flash(600, 0, 160, 40);
          this.showStatus('🌿 You take a fat rip...');
        }
        break;
      case 'paydebt':
        if (this.debt > 0 && this.money > 0) {
          const pmt = Math.min(this.money, this.debt);
          this.money -= pmt;
          this.debt  -= pmt;
          if (this.debt <= 0) {
            this.debt = 0;
            this.hasLoanShark = false;
            this.nightsOwed = 0;
            this.hunted = false;
            this.hitmen.clear(true, true);
            this.bullets.clear(true, true);
            this.cameras.main.flash(500, 0, 200, 80);
            this.showStatus('💸 Debt paid in full — crew called off!');
          } else {
            this.showStatus(`💸 Paid $${Math.floor(pmt)} — $${Math.floor(this.debt)} still owed`);
          }
        }
        break;
    }

    this.time.delayedCall(1200, () => this.startNewShift());
  }

  /* ── Collisions ── */
  hitWall(player, wall) {
    const spd = Math.abs(this.playerSpeed);
    if (spd < 40) return;
    SFX.playImpact(spd / 360);
    if (spd > 120) this.cameras.main.shake(150, 0.008);
    this.playerSpeed *= -0.15;
  }

  hitNPC(player, npc) {
    if (!npc.alive) return;
    if (Math.abs(this.playerSpeed) < 60) return;

    npc.alive = false;
    npc.setTint(0x880000);
    npc.setVelocity(0, 0);

    this.cameras.main.flash(350, 180, 0, 0);
    this.cameras.main.shake(400, 0.018);
    SFX.playImpact(0.8);

    this.manslaughterCount++;
    this.showStatus('💀 VEHICULAR MANSLAUGHTER!');

    if (!this.hasLoanShark) {
      this.time.delayedCall(1500, () => this.activateLoanShark());
    } else {
      this.pendingDebt = (this.pendingDebt || 0) + DEBT_REPEAT;
      this.showStatus(`💀 MANSLAUGHTER! +$${DEBT_REPEAT} owed after shift`);
    }
  }

  hitBullet(player, bullet) {
    if (!bullet.active) return;
    bullet.destroy();
    this.cameras.main.shake(180, 0.012);
    this.playerSpeed *= 0.5;
    SFX.playBulletWhiz();
    this.takeDamage(15, false);
    const msgs = ['🔫 They got you!', '💥 Shot!', '😱 Watch out!', '🩸 Hit!'];
    this.showStatus(Phaser.Utils.Array.GetRandom(msgs));
  }

  takeDamage(amount, shake) {
    this.health = Math.max(0, this.health - amount);
    if (shake) this.cameras.main.shake(350, 0.025);
    this.cameras.main.flash(300, 180, 0, 0);
    if (this.health <= 0) this.triggerGameOver('You died from your injuries.');
  }

  activateLoanShark() {
    this.hasLoanShark = true;
    this.debt = DEBT_PER_KILL;
    this.nightsOwed = 0;
    this.money = Math.max(0, this.money) + 300;
    this.cameras.main.flash(800, 180, 0, 0);
    this.showStatus(`🦈 Loan Shark bailed you out! $${DEBT_PER_KILL} debt — pay it down or the crew hunts you after dark.`);
  }

  loseTheCrew() {
    this.hunted = false;
    this.evadeTimer = 0;
    this.hitmen.clear(true, true);
    this.bullets.clear(true, true);
    this.cameras.main.flash(400, 0, 140, 60);
    this.showStatus('🏁 LOST THEM! The crew gave up — for now.');
  }

  spawnHitman() {
    if (!this.gameActive || this.hitmen.getLength() >= 3) return;
    const roadCols = [0, RI, RI * 2, RI * 3];
    let sx = Phaser.Utils.Array.GetRandom(roadCols) * TILE + TILE;
    let sy = Phaser.Utils.Array.GetRandom(roadCols) * TILE + TILE;
    if (Math.abs(sx - this.player.x) < 600) sx = WORLD_W - sx;
    if (Math.abs(sy - this.player.y) < 600) sy = WORLD_H - sy;
    const h = this.hitmen.create(sx, sy, 'car_hitman');
    h.setDepth(12);
    h.body.setSize(26, 44);
    h.setCollideWorldBounds(true);
    h.speed = 250 + this.hitmen.getLength() * 15;
    h.lastShotTime = 0;
  }

  _fireDriveby(hitman) {
    if (!this.gameActive) return;
    const angle = Math.atan2(this.player.y - hitman.y, this.player.x - hitman.x);
    const spread = (Math.random() - 0.5) * 0.3;
    const b = this.bullets.create(hitman.x, hitman.y, 'bullet');
    b.setDepth(20);
    b.setVelocity(Math.cos(angle + spread) * 440, Math.sin(angle + spread) * 440);
    this.time.delayedCall(2800, () => { if (b?.active) b.destroy(); });
    SFX.playBulletWhiz();
  }

  hitByHitman(player, hitman) {
    if (!this.gameActive) return;
    if (this.time.now < this.invulnUntil) return;
    this.invulnUntil = this.time.now + HITMAN_IFRAMES;

    // You smash through the car — clears one attacker but hurts
    const ang = Math.atan2(this.player.y - hitman.y, this.player.x - hitman.x);
    hitman.destroy();
    this.player.x += Math.cos(ang) * 28;
    this.player.y += Math.sin(ang) * 28;
    this.playerSpeed *= -0.3;
    this.cameras.main.flash(400, 180, 0, 0);
    this.cameras.main.shake(400, 0.03);
    SFX.playImpact(0.9);
    this.tweens.add({ targets: this.player, alpha: 0.3, duration: 120, yoyo: true, repeat: 4,
      onComplete: () => this.player.setAlpha(1) });
    this.takeDamage(35, false);
    if (this.gameActive) this.showStatus('💥 Rammed the crew off — but it cost you!');
  }

  /* ── High Effects ── */
  applyHighEffects(delta) {
    const hl = this.highLevel;
    const dt = delta / 1000;

    this.speedMod = 1 + hl / 100 * 0.55;
    this.turnMod  = 1 - hl / 100 * 0.35;

    // Camera wobble shakes
    if (hl > 38) {
      this.wobbleTimer -= delta;
      if (this.wobbleTimer <= 0) {
        const intensity = ((hl - 38) / 62) * 0.009;
        this.cameras.main.shake(180, intensity);
        this.wobbleTimer = Math.max(400, 2200 - hl * 18);
      }
    }

    // Paranoid messages
    if (hl > 48) {
      this.paranoidTimer -= delta;
      if (this.paranoidTimer <= 0) {
        const pool = [
          '👁 IS THAT A COP?!', 'THEY KNOW', '😱 SOMEONE IS FOLLOWING YOU',
          '🌀 THE ROAD IS BREATHING', '🐍 DID YOU SEE THAT SNAKE',
          '🚔 POLICE EVERYWHERE', '💀 AM I DYING??', '🌈 WOAHHHHHH',
          'ARE MY HANDS REAL', 'THE BUILDING IS MOVING',
          '😰 TOO HIGH TOO HIGH', 'WHY IS EVERYTHING GREEN',
        ];
        Bus.emit('paranoid', Phaser.Utils.Array.GetRandom(pool));
        this.paranoidTimer = Math.max(600, 3500 - hl * 22);
      }
    }

    // Inverted controls
    if (hl > 78) {
      if (this.invertTimer > 0) {
        this.invertTimer -= delta;
        if (this.invertTimer <= 0) this.controlsInverted = false;
      } else if (Math.random() < dt * 0.008 * (hl / 100)) {
        this.controlsInverted = true;
        this.invertTimer = 1800 + Math.random() * 2200;
        Bus.emit('paranoid', '🔄 CONTROLS REVERSED!');
      }
    }

    // Zoom oscillation
    if (hl > 55) {
      const osc = Math.sin(this.time.now / 800 * (1 + hl / 80)) * (hl / 100) * 0.07;
      this.cameras.main.setZoom(1 + osc);
    } else {
      this.cameras.main.setZoom(1);
    }

    // Camera angle sway (feels drunk/high)
    if (hl > 55) {
      const sway = Math.sin(this.time.now / 600) * ((hl - 55) / 45) * 4;
      this.cameras.main.setAngle(sway);
    } else {
      this.cameras.main.setAngle(0);
    }
  }

  /* ── Special spots ── */
  checkSpecialSpots() {
    const trySpot = (pos, label, action) => {
      if (!pos) return;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, pos.x, pos.y);
      if (dist < REACH_DIST + 80) {
        this.showStatusOnce(label);
        if (Phaser.Input.Keyboard.JustDown(this.eKey) || this.touch.interact) action();
      }
    };

    trySpot(this.gasPos, '⛽ [E] Refuel — $40 (+50 HP)', () => {
      if (this.money >= 40) {
        this.money -= 40;
        this.health = Math.min(100, this.health + 50);
        SFX.playPickup();
        this.showStatus('⛽ Refueled! +50 HP');
      } else {
        this.showStatus('Not enough cash!');
      }
    });

    trySpot(this.storePos, `🏪 [E] Buy weed — $${SMOKE_COST}`, () => {
      if (this.money >= SMOKE_COST) {
        this.money -= SMOKE_COST;
        this.highLevel = Math.min(MAX_HIGH, this.highLevel + HIGH_PER_SMOKE);
        SFX.playSmoke();
        this.cameras.main.flash(400, 0, 160, 40);
        this.showStatus('🌿 Bought weed! Getting high...');
      } else {
        this.showStatus('Not enough cash!');
      }
    });
  }

  /* ── Job proximity ── */
  checkJobProx() {
    if (!this.isOnShift) return;

    const dest = this.jobPhase === 'pickup' ? this.pickupDest : this.dropoffDest;
    if (!dest) return;

    const dx   = this.player.x - dest.x;
    const dy   = this.player.y - dest.y;
    const dist = Math.sqrt(dx * dx + dy * dy);   // straight-line, for the arrival check

    const screenAngle = Math.atan2(-dy, -dx) * 180 / Math.PI + 90;
    const arrows = ['↑','↗','→','↘','↓','↙','←','↖'];
    const idx = Math.round(((screenAngle % 360) + 360) % 360 / 45) % 8;
    // Manhattan distance in city blocks (one block = road-to-road spacing)
    const blks = Math.max(1, Math.round((Math.abs(dx) + Math.abs(dy)) / (RI * TILE)));
    this.arrowText.setText(`${arrows[idx]}  ${blks} blk${blks > 1 ? 's' : ''}`);

    if (dist < REACH_DIST) {
      if (this.jobPhase === 'pickup') {
        this.jobPhase = 'dropoff';
        this.pickupMarker.setVisible(false);
        if (this._houseCircle) { this._houseCircle.destroy(); this._houseCircle = null; }
        this.dropoffMarker.setPosition(this.dropoffDest.x, this.dropoffDest.y - 45);
        this.dropoffMarker.setVisible(true);
        SFX.playPickup();
        const msg = this.jobType === 'pizza'
          ? '🍕 Pizza picked up! Deliver it!'
          : '🚑 Patient loaded! Drive to Hospital!';
        this.showStatus(msg);
      } else {
        this.endShift(true);
      }
    }
  }

  /* ── Helpers ── */
  showStatus(msg) {
    this.statusText.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.statusText);
    this.tweens.add({ targets: this.statusText, alpha: 0, duration: 700, delay: 3000 });
  }

  showStatusOnce(msg) {
    if (this.statusText.alpha < 0.1) this.showStatus(msg);
  }

  getJobStatus() {
    if (this.isInTimeOff) return 'Time off...';
    if (!this.isOnShift)  return '';
    if (this.jobType === 'pizza')
      return this.jobPhase === 'pickup' ? '🍕 → Pizza HQ' : '🍕 → Deliver to house';
    return this.jobPhase === 'pickup' ? '🚑 → Pick up patient' : '🚑 → Drive to Hospital';
  }

  triggerGameOver(reason) {
    if (!this.gameActive) return;
    this.gameActive = false;
    SFX.stopEngine();
    SFX.stopMusic();
    this.player.setVelocity(0, 0);
    this.cameras.main.shake(600, 0.04);
    this.cameras.main.flash(1200, 200, 50, 0);

    this.time.delayedCall(1800, () => {
      Bus.removeAllListeners();
      this.scene.stop('UI');
      this.scene.stop('TimeOff');
      this.scene.start('GameOver', {
        score: this.score, peakHigh: this.peakHigh, reason
      });
    });
  }

  /* ── Main Update ── */
  update(time, delta) {
    if (!this.gameActive || this.isInTimeOff) return;

    // Pause toggle
    if (Phaser.Input.Keyboard.JustDown(this.pKey) || this.touch.pause) {
      this.touch.pause = false;
      this.paused = !this.paused;
      this.player.setVelocity(0, 0);
      Bus.emit('pause', this.paused);
    }
    if (this.paused) return;

    const dt  = delta / 1000;
    const inv = this.controlsInverted ? -1 : 1;

    const goUp    = this.cursors.up.isDown    || this.moveKeys.KeyW || this.touch.up;
    const goDown  = this.cursors.down.isDown  || this.moveKeys.KeyS || this.touch.down;
    const goLeft  = this.cursors.left.isDown  || this.moveKeys.KeyA || this.touch.left;
    const goRight = this.cursors.right.isDown || this.moveKeys.KeyD || this.touch.right;

    const TURN   = 145 * (this.turnMod || 1);
    const usingStick = this.touch.stickActive && this.touch.stickMag > 0.18;
    if (usingStick) {
      // Analog joystick: curve the car toward the direction being pushed
      let desired = Math.atan2(this.touch.stickX, -this.touch.stickY) * 180 / Math.PI;
      if (this.controlsInverted) desired += 180;
      const diff = Phaser.Math.Angle.WrapDegrees(desired - this.playerAngle);
      const step = TURN * 1.9 * dt;
      this.playerAngle += Phaser.Math.Clamp(diff, -step, step);
    } else if (Math.abs(this.playerSpeed) > 15) {
      if (goLeft)  this.playerAngle -= TURN * dt * inv;
      if (goRight) this.playerAngle += TURN * dt * inv;
    }

    // Serpentine & loss of control scale with high level
    if (Math.abs(this.playerSpeed) > 25) {
      const hl = this.highLevel;
      if (hl > 20) {
        // Smooth sine-wave drift — frequency and amplitude both grow with highness
        const t    = (hl - 20) / 80;              // 0→1 over hl 20→100
        const freq = 1.0 + t * 2.8;               // 1→3.8 Hz
        const amp  = t * 45;                       // 0→45 deg/sec of swing
        this.playerAngle += Math.sin(time / 1000 * freq * Math.PI * 2) * amp * dt;
      }
      if (hl > 60) {
        // Random steering jerks — starts rare, gets wild at max high
        const jerkStrength = (hl - 60) / 40;      // 0→1
        if (Math.random() < jerkStrength * 0.022 * delta / 16) {
          this.playerAngle += (Math.random() - 0.5) * jerkStrength * 28;
        }
      }
    }

    const sprint    = (this.sprintKey && this.sprintKey.isDown) ? 1.4 : 1;   // hold Shift to sprint
    const energyMod = 0.85 + 0.15 * (this.energy / 100);                     // tired = a bit sluggish
    const MAX_SPD = 320 * (this.speedMod || 1) * sprint * energyMod;
    const ACCEL   = 290 * sprint;
    const FRICTION = 320;

    const BRAKE = 720;

    if (this.brakeKey.isDown || this.touch.brake) {
      // Hard brake toward a stop — no reversing
      const dir = this.playerSpeed > 0 ? -1 : 1;
      this.playerSpeed += dir * BRAKE * dt;
      if (Math.abs(this.playerSpeed) < BRAKE * dt) this.playerSpeed = 0;
    } else if (goUp) {
      this.playerSpeed = Math.min(this.playerSpeed + ACCEL * dt * inv, MAX_SPD);
    } else if (goDown) {
      this.playerSpeed = Math.max(this.playerSpeed - FRICTION * dt * inv, -MAX_SPD * 0.45);
    } else {
      const dir = this.playerSpeed > 0 ? -1 : 1;
      this.playerSpeed += dir * FRICTION * dt;
      if (Math.abs(this.playerSpeed) < 4) this.playerSpeed = 0;
    }

    // Momentum/drag: ease actual velocity toward the facing direction instead of
    // snapping to it, so the car carries weight — slides into turns, coasts to stops.
    const rad = Phaser.Math.DegToRad(this.playerAngle - 90);
    const targetVX = Math.cos(rad) * this.playerSpeed;
    const targetVY = Math.sin(rad) * this.playerSpeed;
    const GRIP_TAU = 0.28;                          // seconds — higher = more slide/drag
    const grip = 1 - Math.exp(-dt / GRIP_TAU);
    const v = this.player.body.velocity;
    this.player.setVelocity(
      v.x + (targetVX - v.x) * grip,
      v.y + (targetVY - v.y) * grip
    );
    this.player.setAngle(this.playerAngle);

    this.highLevel = Math.max(0, this.highLevel - HIGH_DECAY * dt);
    this.score    += this.highLevel * dt * 0.8;
    this.peakHigh  = Math.max(this.peakHigh, this.highLevel);

    this.applyHighEffects(delta);


    // NPCs
    this.npcList.forEach(npc => {
      if (!npc.alive || !npc.active) return;
      // Dodge out of the way when the car bears down on them at speed
      const pdx = npc.x - this.player.x, pdy = npc.y - this.player.y;
      const pd  = Math.hypot(pdx, pdy);
      if (pd > 0 && pd < 140 && Math.abs(this.playerSpeed) > 40) {
        const flee = npc.walkSpeed * 2.4;
        npc.setVelocity((pdx / pd) * flee, (pdy / pd) * flee);
        return;
      }
      npc.walkTimer -= delta;
      if (npc.walkTimer <= 0) {
        npc.walkDir   = Phaser.Math.Between(0, 3);
        npc.walkTimer = Phaser.Math.Between(900, 2800);
      }
      const s = npc.walkSpeed;
      const dirs = [[0,-s],[0,s],[-s,0],[s,0]];
      const [vx, vy] = dirs[npc.walkDir];
      npc.setVelocity(vx, vy);
    });

    this.updateTraffic();

    // Hitmen chase & drive-by — only during a hunted shift
    if (this.hunted) {
      let nearest = Infinity;
      this.hitmen.getChildren().forEach(h => {
        if (!h.active) return;
        const dx = this.player.x - h.x;
        const dy = this.player.y - h.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < nearest) nearest = dist;
        const angle = Math.atan2(dy, dx);
        h.setVelocity(Math.cos(angle) * h.speed, Math.sin(angle) * h.speed);
        h.setAngle(angle * Phaser.Math.RAD_TO_DEG + 90);
        // Fire drive-by shots when close
        if (dist < 260 && time - h.lastShotTime > 1000) {
          this._fireDriveby(h);
          h.lastShotTime = time;
        }
      });

      // Shake-them evade meter: hold the crew far enough away for long enough → lose them
      if (this.hitmen.getLength() > 0 && nearest > SHAKE_DIST) {
        this.evadeTimer += dt;
        if (this.evadeTimer >= SHAKE_TIME) this.loseTheCrew();
      } else {
        this.evadeTimer = Math.max(0, this.evadeTimer - dt * 2);  // drains faster when they close in
      }
    } else {
      this.evadeTimer = 0;
    }

    this.checkJobProx();
    this.checkSpecialSpots();
    this.touch.interact = false;   // one-shot: consumed each frame

    if (this.isOnShift) {
      this.shiftTimer -= dt;
      if (this.shiftTimer <= 0) this.endShift(false);
    }

    Bus.emit('ui-update', {
      highLevel:  this.highLevel,
      money:      this.money,
      score:      this.score,
      debt:       this.debt,
      hunted:     this.hunted,
      shakeProgress: this.hunted ? this.evadeTimer / SHAKE_TIME : 0,
      speed:      Math.abs(this.playerSpeed),
      health:     this.health,
      timeOfDay:  this.timeOfDay,
      jobStatus:  this.getJobStatus(),
      minimap: {
        px: this.player.x,
        py: this.player.y,
        isOnShift: this.isOnShift,
        jobPhase:  this.jobPhase,
        dest: this.jobPhase === 'pickup' ? this.pickupDest : this.dropoffDest,
        hosp: this.hospitalPos,
        pizz: this.pizzeriaPos
      }
    });
  }
}

/* ═══════════════════════════════════════════
   BOOT
═══════════════════════════════════════════ */
function bootGame() {
  new Phaser.Game({
    type:   Phaser.AUTO,
    width:  W,
    height: H,
    backgroundColor: '#0d1117',
    pixelArt: true,   // nearest-neighbour scaling → crisp 8-bit look
    scale: {
      mode:       Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: { default: 'arcade', arcade: { gravity: { y: 0 }, debug: false } },
    scene:  [MenuScene, MapSelectScene, GameScene, UIScene, TimeOffScene, GameOverScene]
  });
}

// Wait for the pixel font so canvas text renders in it (not a fallback), then boot.
if (document.fonts && document.fonts.load) {
  document.fonts.load('16px "Press Start 2P"').then(bootGame).catch(bootGame);
} else {
  bootGame();
}
