/**
 * Compare view: two measured tiers on one scale, two demos on one clock. Transform only. With reduced motion on,
 * nothing animates: Play jumps both to their end state and the scrubber steps through by hand.
 */
import { easingFunction, parseEasing, progressAtQuarter } from '../lib/easing';
import { transitionValue, type CopyTier } from '../lib/copy';
import { plot, sharedRange } from '../lib/plot';

interface Option extends CopyTier {
  key: string;
  site: string;
  slug: string;
  label: string;
  durationMs: number;
}

const root = document.querySelector<HTMLElement>('[data-compare]');
if (root) {
  const options: Option[] = JSON.parse(document.getElementById('compare-data')!.textContent!);
  const byKey = new Map(options.map((o) => [o.key, o]));
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const svg = root.querySelector<SVGSVGElement>('[data-overlay]')!;
  const sides = ['a', 'b'] as const;
  type Side = (typeof sides)[number];
  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const pick = (s: Side) => $<HTMLSelectElement>(`[data-pick="${s}"]`);
  const slow = $<HTMLButtonElement>('[data-slow]');
  const scrub = $<HTMLInputElement>('[data-scrub]');
  const status = $<HTMLElement>('[data-status]');
  const SIZE = 320;
  const PAD = 20;
  let toSvg: (t: number, y: number) => [number, number] = () => [0, 0];
  let animations: Animation[] = [];
  let frame = 0;
  let atEnd = false;

  const params = new URL(location.href).searchParams;
  for (const s of sides) {
    const wanted = params.get(s);
    if (wanted && byKey.has(wanted)) pick(s).value = wanted;
  }

  const current = (s: Side) => byKey.get(pick(s).value)!;
  const puck = (s: Side) => $<HTMLElement>(`[data-puck="${s}"]`);
  const distance = (s: Side) => Math.max(0, puck(s).parentElement!.clientWidth - 24 - puck(s).offsetWidth);

  function draw() {
    const a = current('a');
    const b = current('b');
    const range = sharedRange([a.timingFunction, b.timingFunction]);
    for (const s of sides) {
      const o = current(s);
      const p = plot(o.timingFunction, { size: SIZE, pad: PAD, ...range });
      toSvg = p.toSvg;
      $<SVGPathElement>(`[data-curve="${s}"]`).setAttribute('d', p.d);
      $(`[data-tf="${s}"]`).textContent = o.timingFunction.startsWith('linear(') ? 'linear() spring, sampled' : o.timingFunction;
      $(`[data-dur="${s}"]`).textContent = o.duration;
      $(`[data-quarter="${s}"]`).textContent = `${Math.round(progressAtQuarter(parseEasing(o.timingFunction)) * 100)}% of the way`;
      const link = $<HTMLAnchorElement>(`[data-link="${s}"]`);
      link.href = `/entries/${o.slug}/`;
      link.textContent = `${o.site}, ${o.role}: ${o.label}`;
      const copy = $<HTMLButtonElement>(`[data-copy-side="${s}"]`);
      copy.dataset.copy = transitionValue(o);
      copy.textContent = o.kind === 'animation' ? 'Copy animation timing' : 'Copy transition';
    }
    const [x0, y0] = toSvg(0, 0);
    const [x1, y1] = toSvg(1, 1);
    const frameRect = $<SVGRectElement>('[data-frame]');
    frameRect.setAttribute('x', String(x0));
    frameRect.setAttribute('y', String(y1));
    frameRect.setAttribute('width', String(x1 - x0));
    frameRect.setAttribute('height', String(y0 - y1));
    const overshoot = range.yMax > 1.001 || range.yMin < -0.001;
    for (const [i, y] of [
      [0, 0],
      [1, 1],
    ] as const) {
      const g = $<SVGLineElement>(`[data-guide-${i}]`);
      const [, gy] = toSvg(0, y);
      g.setAttribute('x1', String(PAD));
      g.setAttribute('x2', String(SIZE - PAD));
      g.setAttribute('y1', String(gy));
      g.setAttribute('y2', String(gy));
      g.style.display = overshoot ? '' : 'none';
    }
    svg.setAttribute('aria-label', `A: ${a.site} ${a.timingFunction} over ${a.duration}. B: ${b.site} ${b.timingFunction} over ${b.duration}.`);
    const url = new URL(location.href);
    url.searchParams.set('a', a.key);
    url.searchParams.set('b', b.key);
    history.replaceState(null, '', url);
    show(0);
  }

  /** Puts both demos and markers at shared-clock time ms. */
  function show(ms: number) {
    for (const s of sides) {
      const o = current(s);
      const t = o.durationMs === 0 ? 1 : Math.min(1, ms / o.durationMs);
      const y = easingFunction(parseEasing(o.timingFunction))(t);
      puck(s).style.transform = `translateX(${(y * distance(s)).toFixed(2)}px)`;
      const [cx, cy] = toSvg(t, y);
      const m = $<SVGCircleElement>(`[data-marker="${s}"]`);
      m.setAttribute('cx', String(cx));
      m.setAttribute('cy', String(cy));
    }
  }

  const longest = () => Math.max(current('a').durationMs, current('b').durationMs);
  const factor = () => (slow.getAttribute('aria-pressed') === 'true' ? 10 : 1);

  function stop() {
    cancelAnimationFrame(frame);
    animations.forEach((a) => a.cancel());
    animations = [];
  }

  function play() {
    stop();
    if (reduce.matches) {
      atEnd = !atEnd;
      show(atEnd ? longest() : 0);
      scrub.value = atEnd ? '1000' : '0';
      status.textContent = 'Reduced motion is on, so both demos jump to their end state. Drag the scrubber to step through.';
      return;
    }
    atEnd = true;
    const k = factor();
    animations = sides.map((s) => {
      const o = current(s);
      puck(s).style.transform = '';
      return puck(s).animate([{ transform: 'translateX(0px)' }, { transform: `translateX(${distance(s)}px)` }], {
        duration: o.durationMs * k,
        easing: o.timingFunction,
        fill: 'forwards',
      });
    });
    const start = performance.now();
    const total = longest() * k;
    const tick = (now: number) => {
      const ms = Math.min(total, now - start) / k;
      for (const s of sides) {
        const o = current(s);
        const t = o.durationMs === 0 ? 1 : Math.min(1, ms / o.durationMs);
        const [cx, cy] = toSvg(t, easingFunction(parseEasing(o.timingFunction))(t));
        const m = $<SVGCircleElement>(`[data-marker="${s}"]`);
        m.setAttribute('cx', String(cx));
        m.setAttribute('cy', String(cy));
      }
      scrub.value = String(Math.round((ms / longest()) * 1000));
      if (now - start < total) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  sides.forEach((s) =>
    pick(s).addEventListener('change', () => {
      stop();
      draw();
    }),
  );
  $<HTMLButtonElement>('[data-play-both]').addEventListener('click', play);
  slow.addEventListener('click', () => slow.setAttribute('aria-pressed', String(slow.getAttribute('aria-pressed') !== 'true')));
  scrub.addEventListener('input', () => {
    stop();
    show((Number(scrub.value) / 1000) * longest());
  });
  reduce.addEventListener('change', () => {
    if (reduce.matches) animations.forEach((a) => a.finish());
  });
  if (reduce.matches) status.textContent = 'Reduced motion is on, so Play jumps to the end. Drag the scrubber to step through.';
  draw();
}
