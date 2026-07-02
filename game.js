// STONER SIMULATOR — polished build
// Score by staying high. Work jobs, buy weed, dodge cops and bullets.

/* ── Constants ─────────────────────────────── */
const W = 1024, H = 768;
const TILE = 64;
const RI = 8;
const COLS = 32, ROWS = 32;
const WORLD_W = COLS * TILE;
const WORLD_H = ROWS * TILE;

const PIXEL_FONT = '"Press Start 2P", monospace';

const SHIFT_DURATION = 90;
const NPC_COUNT      = 6;
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

    this.add.text(W / 2, H / 2 + 90, 'WASD / Arrows — drive    SPACE — brake    E — interact    ? — help', {
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
      this.time.delayedCall(400, () => this.scene.start('Game'));
    });

    // Pulse the button
    this.tweens.add({ targets: btn, scaleX: 1.03, scaleY: 1.03, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
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

    this.add.text(W / 2, 70, 'SHIFT OVER — TIME OFF', {
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

    this.fxText = this.add.text(70, H / 2, '', {
      fontSize: '13px', fontFamily: 'Arial', color: '#88ff44',
      stroke: '#000', strokeThickness: 2, lineSpacing: 4
    }).setOrigin(0, 0.5).setScrollFactor(0);

    // ── Health bar ──
    this.add.text(12, H - 38, 'HP', { fontSize: '12px', color: '#ff8888', fontFamily: 'Arial Black, Arial' }).setScrollFactor(0);
    this.add.rectangle(60, H - 30, 120, 16, 0x330000).setOrigin(0, 0.5).setScrollFactor(0);
    this.healthBar = this.add.rectangle(60, H - 30, 120, 16, 0xff3333).setOrigin(0, 0.5).setScrollFactor(0);

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

    // ── Minimap (bottom-right) ──
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

    // Static POI dots: hospital (sc=0,sr=0) and pizzeria (sc=2,sr=2)
    // With wider roads (2 tiles), bx=(sc*RI+2)*TILE, bw=(RI-2)*TILE=384, cx=bx+bw/2
    const hospCX = (0 * RI + 2 + (RI - 2) / 2) * TILE;
    const hospCY = (0 * RI + 2 + (RI - 2) / 2) * TILE;
    const pizzCX = (2 * RI + 2 + (RI - 2) / 2) * TILE;
    const pizzCY = (2 * RI + 2 + (RI - 2) / 2) * TILE;
    mmBg.fillStyle(0xff4444); mmBg.fillCircle(MX + hospCX * mmScale, MY + hospCY * mmScale, 4);
    mmBg.fillStyle(0xff8800); mmBg.fillCircle(MX + pizzCX * mmScale, MY + pizzCY * mmScale, 4);

    this.add.text(MX + MM / 2, MY - 12, 'MAP', {
      fontSize: '10px', color: '#aaaaaa', fontFamily: 'Arial'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(96);

    // Legend
    this.add.text(MX, MY + MM + 4, '🔴 Hosp  🟠 Pizza  ⚪ You  🟢/🔴 Job', {
      fontSize: '9px', color: '#888888', fontFamily: 'Arial'
    }).setScrollFactor(0).setDepth(96);

    // Dynamic dots layer
    this.mmDots = this.add.graphics().setScrollFactor(0).setDepth(97);

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
    this.pauseText = this.add.text(W / 2, H / 2, 'PAUSED\n\nP — resume\nM — mute / unmute\n? — controls', {
      fontSize: '28px', fontFamily: 'Arial Black, Arial', color: '#00ff88',
      align: 'center', stroke: '#000', strokeThickness: 4, lineSpacing: 10
    }).setOrigin(0.5).setScrollFactor(0).setDepth(151).setVisible(false);

    Bus.on('ui-update', this.onUpdate, this);
    Bus.on('paranoid',  this.showParanoid, this);
    Bus.on('pause', (p) => {
      this.pauseOverlay.setVisible(p);
      this.pauseText.setVisible(p);
    });
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

    this.wallGroup  = this.physics.add.staticGroup();
    this.npcs       = this.physics.add.group();
    this.bullets    = this.physics.add.group();
    this.hitmen     = this.physics.add.group();
    this.hunted      = false;  // is the current shift a hunted (crew active) shift
    this.nightsOwed  = 0;      // night shifts started while still in debt
    this.invulnUntil = 0;      // i-frame timestamp after a ram

    this.buildTextures();
    this.buildWorld();
    this.buildPlayer();
    this.buildNPCs();
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

    this.scene.launch('UI');

    SFX.init();
    SFX.startMusic();

    this.time.delayedCall(1800, () => this.startNewShift());
    this.showStatus('Starting shift soon...');
  }

  /* ── World ── */
  buildWorld() {
    this.add.rectangle(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 0x2e5c28);
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

    for (const i of roadCols) {
      g.fillStyle(0x4a4a5a);
      g.fillRect(i * TILE, 0, TILE * 2, WORLD_H);
      g.fillStyle(0xffffaa, 0.2);
      g.fillRect(i * TILE + TILE - 2, 0, 4, WORLD_H);
    }
    for (const j of roadRows) {
      g.fillStyle(0x4a4a5a);
      g.fillRect(0, j * TILE, WORLD_W, TILE * 2);
      g.fillStyle(0xffffaa, 0.2);
      g.fillRect(0, j * TILE + TILE - 2, WORLD_W, 4);
    }

    // Buildings — start 2 tiles in from each road
    const bColors = [0x7a4030, 0x404060, 0x305050, 0x504030, 0x403050, 0x305030, 0x603040];
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

        const isHosp  = sc === 0 && sr === 0;
        const isPizz  = sc === 2 && sr === 2;
        const isGas   = sc === 1 && sr === 3;
        const isStore = sc === 3 && sr === 1;

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
        if (Phaser.Input.Keyboard.JustDown(this.eKey)) action();
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
    const dist = Math.sqrt(dx * dx + dy * dy);

    const screenAngle = Math.atan2(-dy, -dx) * 180 / Math.PI + 90;
    const arrows = ['↑','↗','→','↘','↓','↙','←','↖'];
    const idx = Math.round(((screenAngle % 360) + 360) % 360 / 45) % 8;
    this.arrowText.setText(`${arrows[idx]}  ${Math.round(dist / TILE)}blks`);

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
    if (Phaser.Input.Keyboard.JustDown(this.pKey)) {
      this.paused = !this.paused;
      this.player.setVelocity(0, 0);
      Bus.emit('pause', this.paused);
    }
    if (this.paused) return;

    const dt  = delta / 1000;
    const inv = this.controlsInverted ? -1 : 1;

    const goUp    = this.cursors.up.isDown    || this.moveKeys.KeyW;
    const goDown  = this.cursors.down.isDown  || this.moveKeys.KeyS;
    const goLeft  = this.cursors.left.isDown  || this.moveKeys.KeyA;
    const goRight = this.cursors.right.isDown || this.moveKeys.KeyD;

    const TURN   = 145 * (this.turnMod || 1);
    if (Math.abs(this.playerSpeed) > 15) {
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

    const MAX_SPD = 320 * (this.speedMod || 1);
    const ACCEL   = 290;
    const FRICTION = 320;

    const BRAKE = 720;

    if (this.brakeKey.isDown) {
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

    // Hitmen chase & drive-by — only during a hunted shift
    if (this.hunted) {
      this.hitmen.getChildren().forEach(h => {
        if (!h.active) return;
        const dx = this.player.x - h.x;
        const dy = this.player.y - h.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        h.setVelocity(Math.cos(angle) * h.speed, Math.sin(angle) * h.speed);
        h.setAngle(angle * Phaser.Math.RAD_TO_DEG + 90);
        // Fire drive-by shots when close
        if (dist < 260 && time - h.lastShotTime > 1000) {
          this._fireDriveby(h);
          h.lastShotTime = time;
        }
      });
    }

    this.checkJobProx();
    this.checkSpecialSpots();

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
      health:     this.health,
      timeOfDay:  this.timeOfDay,
      jobStatus:  this.getJobStatus(),
      minimap: {
        px: this.player.x,
        py: this.player.y,
        isOnShift: this.isOnShift,
        jobPhase:  this.jobPhase,
        dest: this.jobPhase === 'pickup' ? this.pickupDest : this.dropoffDest
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
    scene:  [MenuScene, GameScene, UIScene, TimeOffScene, GameOverScene]
  });
}

// Wait for the pixel font so canvas text renders in it (not a fallback), then boot.
if (document.fonts && document.fonts.load) {
  document.fonts.load('16px "Press Start 2P"').then(bootGame).catch(bootGame);
} else {
  bootGame();
}
