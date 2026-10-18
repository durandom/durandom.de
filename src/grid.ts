/** Marks a grid cell that lies outside the avatar shape. */
export const OUTSIDE = -1;

/** True if (u, v) in [0, 1]² lies inside a rounded square with corner radius r (fraction of side). */
export function insideRoundedRect(u: number, v: number, r: number): boolean {
  if (u < 0 || u > 1 || v < 0 || v > 1) return false;
  if (r <= 0) return true;
  const dx = Math.max(r - u, u - (1 - r), 0);
  const dy = Math.max(r - v, v - (1 - r), 0);
  return dx * dx + dy * dy <= r * r;
}

/** Relative luminance of an sRGB pixel, 0..1 (Rec. 709 weights on gamma-encoded values). */
export function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Box-filters an RGBA image down to a cols × rows grid of luminance values.
 * Cells whose centre falls outside the rounded mask get OUTSIDE.
 * Cells need not be square: each cell maps to its own box in the image.
 */
export function sampleLuminance(
  pixels: ArrayLike<number>,
  width: number,
  height: number,
  cols: number,
  rows: number,
  cornerRadius = 0,
): Float32Array {
  const out = new Float32Array(cols * rows);
  for (let row = 0; row < rows; row++) {
    const y0 = Math.floor((row * height) / rows);
    const y1 = Math.max(y0 + 1, Math.floor(((row + 1) * height) / rows));
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      if (!insideRoundedRect((col + 0.5) / cols, (row + 0.5) / rows, cornerRadius)) {
        out[i] = OUTSIDE;
        continue;
      }
      const x0 = Math.floor((col * width) / cols);
      const x1 = Math.max(x0 + 1, Math.floor(((col + 1) * width) / cols));
      let sum = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const p = (y * width + x) * 4;
          sum += luminance(pixels[p], pixels[p + 1], pixels[p + 2]);
        }
      }
      out[i] = sum / ((x1 - x0) * (y1 - y0));
    }
  }
  return out;
}

/**
 * Stretches the inside cells so the lo..hi quantiles span 0..1, then applies gamma.
 * The avatar photo is low-contrast; this makes it readable as glyphs. OUTSIDE cells stay OUTSIDE.
 */
export function normalize(lum: Float32Array, lo = 0.02, hi = 0.98, gamma = 1): Float32Array {
  const inside = Array.from(lum).filter((v) => v !== OUTSIDE).sort((a, b) => a - b);
  const out = new Float32Array(lum.length);
  if (inside.length === 0) return out.fill(OUTSIDE);
  const at = (q: number) => inside[Math.min(inside.length - 1, Math.floor(q * inside.length))];
  const min = at(lo);
  const span = at(hi) - min || 1;
  for (let i = 0; i < lum.length; i++) {
    const v = lum[i];
    out[i] = v === OUTSIDE ? OUTSIDE : Math.min(1, Math.max(0, (v - min) / span)) ** gamma;
  }
  return out;
}

/**
 * Unsharp mask on a cols × rows luminance grid: v + amount · (v − box blur of radius r).
 * Boosts edges (glasses frame, nose outline) that box-filter downsampling smears away.
 * The blur averages inside cells only, so the mask border does not bleed in. OUTSIDE cells stay OUTSIDE.
 * Results may leave 0..1; normalize clamps them.
 */
export function sharpen(lum: Float32Array, cols: number, rows: number, amount = 1, radius = 1): Float32Array {
  const out = new Float32Array(lum.length);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const v = lum[i];
      if (v === OUTSIDE) {
        out[i] = OUTSIDE;
        continue;
      }
      let sum = 0;
      let n = 0;
      for (let y = Math.max(0, row - radius); y <= Math.min(rows - 1, row + radius); y++) {
        for (let x = Math.max(0, col - radius); x <= Math.min(cols - 1, col + radius); x++) {
          const w = lum[y * cols + x];
          if (w === OUTSIDE) continue;
          sum += w;
          n++;
        }
      }
      out[i] = v + amount * (v - sum / n);
    }
  }
  return out;
}
