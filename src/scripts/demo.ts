/**
 * Demo player. Runs a measured curve on our own element, with the browser's own easing engine (WAAPI), and moves
 * the plot's marker in step. Transform and opacity only. With reduced motion on, nothing animates: a click jumps
 * between start and end, and the scrubber steps through the curve by hand.
 */
import { easingFunction, parseEasing } from '../lib/easing';

const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const REDUCED_NOTE = 'Reduced motion is on, so the demo jumps to its end state instead of moving. Drag the scrubber to step through the curve.';

export function setupDemo(root: HTMLElement): void {
  const tf = root.dataset.tf!;
  const baseDuration = Number(root.dataset.durationMs);
  const mode = root.dataset.mode === 'fade' ? 'fade' : 'move';
  const f = easingFunction(parseEasing(tf));
  const stage = root.querySelector<HTMLElement>('[data-stage] .stage-hit')!;
  const puck = root.querySelector<HTMLElement>('[data-puck]')!;
  const marker = root.querySelector<SVGCircleElement>('[data-marker]');
  const svg = root.querySelector<SVGSVGElement>('[data-plot]');
  const slow = root.querySelector<HTMLButtonElement>('[data-slow]');
  const scrub = root.querySelector<HTMLInputElement>('[data-scrub]');
  const status = root.querySelector<HTMLElement>('[data-status]');
  const plays = root.querySelectorAll<HTMLElement>('[data-play]');

  let animation: Animation | null = null;
  let frame = 0;
  let atEnd = false;

  const distance = () => Math.max(0, stage.clientWidth - puck.offsetWidth);

  function placeMarker(t: number, y: number) {
    if (!marker || !svg) return;
    const size = Number(svg.dataset.size);
    const pad = Number(svg.dataset.pad);
    const yMin = Number(svg.dataset.ymin);
    const yMax = Number(svg.dataset.ymax);
    const inner = size - pad * 2;
    const dx = t * inner;
    const dy = -((y - yMin) / (yMax - yMin)) * inner + (-yMin / (yMax - yMin)) * inner;
    marker.setAttribute('transform', `translate(${dx.toFixed(2)} ${dy.toFixed(2)})`);
  }

  function show(t: number) {
    const y = f(t);
    if (mode === 'fade') puck.style.opacity = String(Math.min(1, Math.max(0, y)));
    else puck.style.transform = `translateX(${(y * distance()).toFixed(2)}px)`;
    placeMarker(t, y);
  }

  function stop() {
    cancelAnimationFrame(frame);
    animation?.cancel();
    animation = null;
  }

  function play() {
    stop();
    const duration = baseDuration * (slow?.getAttribute('aria-pressed') === 'true' ? 10 : 1);
    if (reduce.matches || duration === 0) {
      atEnd = !atEnd;
      show(atEnd ? 1 : 0);
      if (scrub) scrub.value = atEnd ? '1000' : '0';
      if (status && reduce.matches) status.textContent = REDUCED_NOTE;
      return;
    }
    atEnd = true;
    puck.style.transform = '';
    puck.style.opacity = '';
    const keyframes =
      mode === 'fade'
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [{ transform: 'translateX(0px)' }, { transform: `translateX(${distance()}px)` }];
    animation = puck.animate(keyframes, { duration, easing: tf, fill: 'forwards' });
    const running = animation;
    const tick = () => {
      if (animation !== running) return;
      const t = Math.min(1, Number(running.currentTime ?? 0) / duration);
      placeMarker(t, f(t));
      if (scrub) scrub.value = String(Math.round(t * 1000));
      if (t < 1 && running.playState === 'running') frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }

  plays.forEach((b) => b.addEventListener('click', play));
  slow?.addEventListener('click', () => {
    slow.setAttribute('aria-pressed', String(slow.getAttribute('aria-pressed') !== 'true'));
  });
  scrub?.addEventListener('input', () => {
    stop();
    const t = Number(scrub.value) / 1000;
    atEnd = t >= 1;
    show(t);
  });
  reduce.addEventListener('change', () => {
    if (!reduce.matches || !animation) return;
    animation.finish();
    if (status) status.textContent = REDUCED_NOTE;
  });
  if (reduce.matches && status) status.textContent = REDUCED_NOTE;
}

document.querySelectorAll<HTMLElement>('[data-demo]').forEach(setupDemo);
