import './style.css';
import { Field, SETTLED, metricsFor } from './field.ts';
import { normalize, sampleLuminance, sharpen } from './grid.ts';
import { attachScramble } from './scramble.ts';

/** Corner radius of the avatar, as a fraction of its side. Keep in sync with .avatar img in style.css. */
const AVATAR_RADIUS = 0.1;
const STIR_RADIUS = 18;
/** Unsharp mask on the avatar grid, so the glasses frame and nose outline survive downsampling. */
const SHARPEN_AMOUNT = 1.5;
const SHARPEN_RADIUS = 1;

const canvas = document.querySelector<HTMLCanvasElement>('#noise');
const img = document.querySelector<HTMLImageElement>('.avatar img');
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

function loadPixels(image: HTMLImageElement): ImageData {
  const c = document.createElement('canvas');
  c.width = image.naturalWidth;
  c.height = image.naturalHeight;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

function start(canvas: HTMLCanvasElement, image: HTMLImageElement): void {
  const pixels = loadPixels(image);
  const root = document.documentElement;
  let field: Field;
  let startTime = performance.now();
  let last = startTime;
  let frame = 0;

  function placeAvatar(): void {
    const rect = image.getBoundingClientRect();
    const { w, h } = field.cellCss;
    const col0 = Math.round(rect.left / w);
    const row0 = Math.round(rect.top / h);
    const cols = Math.max(1, Math.round(rect.right / w) - col0);
    const rows = Math.max(1, Math.round(rect.bottom / h) - row0);
    const lum = sampleLuminance(pixels.data, pixels.width, pixels.height, cols, rows, AVATAR_RADIUS);
    const edged = sharpen(lum, cols, rows, SHARPEN_AMOUNT, SHARPEN_RADIUS);
    field.setAvatar(normalize(edged, 0.03, 0.97, 0.8), cols, rows, col0, row0);
  }

  function build(settled: boolean): void {
    field = new Field(canvas, metricsFor(window.innerWidth, window.devicePixelRatio), window.innerWidth, window.innerHeight);
    placeAvatar();
    if (settled) field.settleNow();
  }

  function tick(now: number): void {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = (now - startTime) / 1000;
    field.step(t, dt);
    if (t > SETTLED - 0.5) root.classList.add('settled');
    frame = requestAnimationFrame(tick);
  }

  function run(): void {
    cancelAnimationFrame(frame);
    if (reduced.matches) {
      field.settleNow();
      field.paint();
      root.classList.add('settled');
      return;
    }
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  build(reduced.matches);
  root.classList.add('live');
  run();

  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      build(true);
      startTime = performance.now() - SETTLED * 1000;
      run();
    }, 120);
  });
  window.addEventListener(
    'scroll',
    () => {
      placeAvatar();
      if (reduced.matches) run();
    },
    { passive: true },
  );
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(frame);
    else run();
  });
  reduced.addEventListener('change', run);

  const stir = (e: PointerEvent) => {
    if (!reduced.matches) field.stir(e.clientX, e.clientY, STIR_RADIUS);
  };
  window.addEventListener('pointermove', stir, { passive: true });
  window.addEventListener('pointerdown', stir, { passive: true });
  window.addEventListener(
    'touchmove',
    (e) => {
      if (reduced.matches) return;
      for (const touch of Array.from(e.touches)) field.stir(touch.clientX, touch.clientY, STIR_RADIUS);
    },
    { passive: true },
  );
}

const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
for (const a of document.querySelectorAll<HTMLAnchorElement>('.links a')) attachScramble(a, reduced, canHover);

if (canvas && img) {
  const go = () => start(canvas, img);
  if (img.complete && img.naturalWidth > 0) go();
  else img.addEventListener('load', go, { once: true });
}
