const HEX = '0123456789abcdef';
const DURATION_MS = 420;
const FLICKER_MS = 1000;

/**
 * One frame of the scramble: characters left of `progress` (0..1) show the real text,
 * the rest show random hex. Spaces stay spaces, so word shapes survive.
 */
export function scrambleFrame(text: string, progress: number, rand: () => number = Math.random): string {
  const resolved = Math.floor(text.length * Math.min(1, Math.max(0, progress)));
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    out += i < resolved || ch === ' ' ? ch : HEX[Math.floor(rand() * HEX.length)];
  }
  return out;
}

/**
 * A link's label and URL idle as flickering hex and resolve into their real text on hover
 * or focus, then decay back when the pointer leaves. Only on devices that can hover:
 * touch screens and reduced motion always show the real text.
 */
export function attachScramble(anchor: HTMLAnchorElement, reduced: MediaQueryList, canHover: MediaQueryList): void {
  const label = anchor.querySelector<HTMLElement>('.label');
  if (!label) return;
  const parts = Array.from(anchor.querySelectorAll<HTMLElement>('.label, .url'));
  const texts = parts.map((el) => el.textContent ?? '');
  // Screen readers keep the real name while the visible text is noise.
  anchor.setAttribute('aria-label', label.textContent ?? '');
  const show = (p: number | null) =>
    parts.forEach((el, i) => (el.textContent = p === null ? texts[i] : scrambleFrame(texts[i], p)));
  const active = () => canHover.matches && !reduced.matches;

  let progress = 0; // 0 = all hex, 1 = real text
  let target = 0;
  let frame = 0;
  let lastFlicker = 0;
  let last = 0;

  const step = (now: number) => {
    if (!active()) {
      show(null);
      return;
    }
    const dt = last ? now - last : 0;
    last = now;
    const delta = dt / DURATION_MS;
    progress = target > progress ? Math.min(target, progress + delta) : Math.max(target, progress - delta);
    if (progress < 1 && (progress !== target || now - lastFlicker > FLICKER_MS)) {
      show(progress);
      lastFlicker = now;
    } else if (progress === 1) {
      show(null);
    }
    // Keep flickering while any hex is visible; stop once fully resolved.
    if (progress < 1 || progress !== target) frame = requestAnimationFrame(step);
  };

  const go = (to: number) => {
    target = to;
    cancelAnimationFrame(frame);
    last = 0;
    frame = requestAnimationFrame(step);
  };

  anchor.addEventListener('pointerenter', () => go(1));
  anchor.addEventListener('focus', () => go(1));
  anchor.addEventListener('pointerleave', () => {
    if (document.activeElement !== anchor) go(0);
  });
  anchor.addEventListener('blur', () => go(0));
  reduced.addEventListener('change', () => go(target));
  canHover.addEventListener('change', () => go(target));
  go(0);
}
