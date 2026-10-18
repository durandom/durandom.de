import { OUTSIDE } from './grid.ts';

/** Hex digits ordered from least to most ink, so bright avatar cells get dense glyphs. */
export const GLYPHS_BY_DENSITY = '17fc325e4a960db8';
const BLANK = 16;
const GLYPH_COUNT = 17;
export const LEVELS = 32;

/** Seconds: noise scrolls until BOOT, cells settle between BOOT and BOOT + SPREAD. */
export const BOOT = 0.9;
const SPREAD = 1.4;
export const SETTLED = BOOT + SPREAD;

const SCROLL_STEP = 0.035;
const HEAT_HALF_LIFE = 0.6;

/**
 * Colour ramp for glyphs: near black through dark and phosphor green to near white.
 * Hex glyphs differ little in ink, so the colour carries most of the avatar's luminance.
 */
const BG = [7, 9, 10];
const STOPS: Array<[number, number[]]> = [
  [0, [10, 18, 15]],
  [0.15, [18, 70, 45]],
  [0.55, [50, 165, 100]],
  [0.8, [130, 230, 160]],
  [1, [245, 255, 248]],
];

/** Resting level range of noise outside the avatar: dim, so the avatar silhouette stands out. */
const BG_MIN = 0.02;
const BG_RANGE = 0.04;
/** Darkest level an avatar cell rests at: just above the background, so dark areas keep the shape. */
const AVATAR_FLOOR = 0.08;

function rampColor(t: number): string {
  for (let s = 1; s < STOPS.length; s++) {
    const [t1, c1] = STOPS[s];
    const [t0, c0] = STOPS[s - 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0);
      const c = c0.map((v, j) => Math.round(v + (c1[j] - v) * k));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return `rgb(${STOPS[STOPS.length - 1][1].join(',')})`;
}

export const BACKGROUND = `rgb(${BG.join(',')})`;

export interface Metrics {
  /** Cell size in device pixels (integers, so cells tile without seams). */
  cellW: number;
  cellH: number;
  fontPx: number;
  dpr: number;
}

export function metricsFor(viewportWidth: number, devicePixelRatio: number): Metrics {
  const dpr = Math.min(Math.max(devicePixelRatio, 1), 2);
  const fontCss = Math.min(14, Math.max(10, viewportWidth / 110));
  return {
    cellW: Math.round(fontCss * 0.62 * dpr),
    cellH: Math.round(fontCss * 1.2 * dpr),
    fontPx: fontCss * dpr,
    dpr,
  };
}

/** Pre-renders every (glyph, level) pair once; frames are then plain drawImage copies. */
function buildAtlas(m: Metrics): HTMLCanvasElement {
  const atlas = document.createElement('canvas');
  atlas.width = m.cellW * GLYPH_COUNT;
  atlas.height = m.cellH * LEVELS;
  const ctx = atlas.getContext('2d')!;
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, atlas.width, atlas.height);
  ctx.font = `${m.fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let level = 0; level < LEVELS; level++) {
    ctx.fillStyle = rampColor(level / (LEVELS - 1));
    for (let g = 0; g < BLANK; g++) {
      ctx.fillText(GLYPHS_BY_DENSITY[g], (g + 0.5) * m.cellW, (level + 0.5) * m.cellH);
    }
  }
  return atlas;
}

/**
 * The whole-screen hex dump. Each cell holds a base glyph and level; pointer "heat"
 * scrambles what is drawn without touching the base, so the avatar re-forms as heat decays.
 */
export class Field {
  readonly cols: number;
  readonly rows: number;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly atlas: HTMLCanvasElement;
  private readonly glyph: Uint8Array;
  private readonly level: Float32Array;
  private readonly bgLevel: Float32Array;
  private readonly heat: Float32Array;
  private readonly settleAt: Float32Array;
  private readonly drawn: Int16Array;
  private avatar: Float32Array;
  private readonly m: Metrics;
  private scrollAcc = 0;

  constructor(canvas: HTMLCanvasElement, m: Metrics, cssWidth: number, cssHeight: number) {
    this.m = m;
    this.cols = Math.ceil((cssWidth * m.dpr) / m.cellW);
    this.rows = Math.ceil((cssHeight * m.dpr) / m.cellH);
    canvas.width = this.cols * m.cellW;
    canvas.height = this.rows * m.cellH;
    canvas.style.width = `${canvas.width / m.dpr}px`;
    canvas.style.height = `${canvas.height / m.dpr}px`;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.atlas = buildAtlas(m);

    const n = this.cols * this.rows;
    this.glyph = new Uint8Array(n);
    this.level = new Float32Array(n);
    this.bgLevel = new Float32Array(n);
    this.heat = new Float32Array(n);
    this.settleAt = new Float32Array(n);
    this.drawn = new Int16Array(n).fill(-1);
    this.avatar = new Float32Array(n).fill(OUTSIDE);
    for (let i = 0; i < n; i++) {
      this.glyph[i] = (Math.random() * BLANK) | 0;
      this.level[i] = 0.25 + Math.random() * 0.6;
      this.bgLevel[i] = BG_MIN + Math.random() * BG_RANGE;
      this.settleAt[i] = BOOT + Math.random() * SPREAD;
    }
    this.ctx.fillStyle = BACKGROUND;
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  /** Cell size in CSS pixels. */
  get cellCss(): { w: number; h: number } {
    return { w: this.m.cellW / this.m.dpr, h: this.m.cellH / this.m.dpr };
  }

  /** Places a luminance grid (from sampleLuminance) with its top-left cell at (col0, row0). */
  setAvatar(lum: Float32Array, lumCols: number, lumRows: number, col0: number, row0: number): void {
    this.avatar.fill(OUTSIDE);
    for (let r = 0; r < lumRows; r++) {
      const row = row0 + r;
      if (row < 0 || row >= this.rows) continue;
      for (let c = 0; c < lumCols; c++) {
        const col = col0 + c;
        if (col < 0 || col >= this.cols) continue;
        this.avatar[row * this.cols + col] = lum[r * lumCols + c];
      }
    }
    // Re-pick glyphs so gaps and densities match the new shape; levels still ease over.
    for (let i = 0; i < this.glyph.length; i++) this.restGlyph(i);
  }

  /** Skips boot and settle: every cell jumps to its resting state (used for reduced motion and resizes). */
  settleNow(): void {
    for (let i = 0; i < this.glyph.length; i++) {
      this.settleAt[i] = 0;
      this.restGlyph(i);
      this.level[i] = this.restLevel(i);
      this.heat[i] = 0;
    }
  }

  /** Adds heat around a point given in CSS pixels; radius also in CSS pixels. */
  stir(x: number, y: number, radius: number): void {
    const { w, h } = this.cellCss;
    const cx = x / w;
    const cy = y / h;
    const rx = radius / w;
    const ry = radius / h;
    const c0 = Math.max(0, Math.floor(cx - rx));
    const c1 = Math.min(this.cols - 1, Math.ceil(cx + rx));
    const r0 = Math.max(0, Math.floor(cy - ry));
    const r1 = Math.min(this.rows - 1, Math.ceil(cy + ry));
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        const dx = (col + 0.5 - cx) / rx;
        const dy = (row + 0.5 - cy) / ry;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= 1) continue;
        const i = row * this.cols + col;
        this.heat[i] = Math.max(this.heat[i], 1 - d * d);
      }
    }
  }

  private isGap(i: number): boolean {
    // Outside the avatar the dump reads as byte pairs: "a3 f2 9b".
    return this.avatar[i] === OUTSIDE && i % this.cols % 3 === 2;
  }

  private restLevel(i: number): number {
    const a = this.avatar[i];
    return a === OUTSIDE ? this.bgLevel[i] : AVATAR_FLOOR + (1 - AVATAR_FLOOR) * a;
  }

  private restGlyph(i: number): void {
    const a = this.avatar[i];
    if (a === OUTSIDE) {
      this.glyph[i] = this.isGap(i) ? BLANK : (Math.random() * BLANK) | 0;
    } else {
      const jitter = ((Math.random() * 5) | 0) - 2;
      this.glyph[i] = Math.min(BLANK - 1, Math.max(0, Math.round(a * (BLANK - 1)) + jitter));
    }
  }

  private scroll(): void {
    const { cols } = this;
    this.glyph.copyWithin(0, cols);
    this.level.copyWithin(0, cols);
    for (let i = this.glyph.length - cols; i < this.glyph.length; i++) {
      this.glyph[i] = i % cols % 3 === 2 ? BLANK : (Math.random() * BLANK) | 0;
      this.level[i] = 0.25 + Math.random() * 0.6;
    }
  }

  /** Advances the simulation by dt seconds at time t (seconds since start) and draws changed cells. */
  step(t: number, dt: number): void {
    if (t < BOOT) {
      this.scrollAcc += dt;
      while (this.scrollAcc > SCROLL_STEP) {
        this.scrollAcc -= SCROLL_STEP;
        this.scroll();
      }
    }
    const heatKeep = 0.5 ** (dt / HEAT_HALF_LIFE);
    const ease = Math.min(1, dt * 5);
    const noiseRate = 8 * dt;
    const bgFlicker = 0.6 * dt;
    const avatarFlicker = 0.15 * dt;

    for (let i = 0; i < this.glyph.length; i++) {
      if (t < this.settleAt[i]) {
        if (Math.random() < noiseRate) {
          this.glyph[i] = (Math.random() * BLANK) | 0;
          this.level[i] = 0.25 + Math.random() * 0.6;
        }
      } else {
        const outside = this.avatar[i] === OUTSIDE;
        if (t - dt < this.settleAt[i]) {
          this.restGlyph(i); // just settled: leave the noise glyph behind
        } else if (Math.random() < (outside ? bgFlicker : avatarFlicker)) {
          if (outside) this.bgLevel[i] = BG_MIN + Math.random() * BG_RANGE;
          this.restGlyph(i);
        }
        this.level[i] += (this.restLevel(i) - this.level[i]) * ease;
      }
      this.draw(i, heatKeep);
    }
  }

  /** Draws every cell once without advancing anything (reduced motion). */
  paint(): void {
    for (let i = 0; i < this.glyph.length; i++) this.draw(i, 1);
  }

  private draw(i: number, heatKeep: number): void {
    let g = this.glyph[i];
    let lv = this.level[i];
    const h = (this.heat[i] *= heatKeep);
    if (h > 0.02) {
      if (Math.random() < h) g = (Math.random() * BLANK) | 0;
      lv += (Math.random() * 0.9 - lv) * h;
    } else {
      this.heat[i] = 0;
    }
    const q = Math.min(LEVELS - 1, Math.max(0, Math.round(lv * (LEVELS - 1))));
    const sprite = q * GLYPH_COUNT + g;
    if (sprite === this.drawn[i]) return;
    this.drawn[i] = sprite;
    const { cellW, cellH } = this.m;
    const col = i % this.cols;
    const row = (i / this.cols) | 0;
    this.ctx.drawImage(this.atlas, g * cellW, q * cellH, cellW, cellH, col * cellW, row * cellH, cellW, cellH);
  }
}
