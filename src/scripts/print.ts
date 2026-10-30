/**
 * Prints draw themselves in, core first, like ink. Cards redraw on hover using that site's own lead curve and
 * duration, so the drawing itself is a demo of how the site moves. The hero draws once when it comes into view.
 * Reduced motion: prints are painted finished and never move.
 */
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

function draw(svg: SVGSVGElement) {
  if (reduce.matches) return;
  const easing = svg.dataset.ease || 'cubic-bezier(0.19, 1, 0.22, 1)';
  const dur = Math.max(320, Math.min(1600, Number(svg.dataset.dur) || 900));
  const paths = [...svg.querySelectorAll<SVGPathElement>('path')];
  const max = Math.max(...paths.map((p) => Number(p.dataset.r) || 0), 1);
  for (const p of paths) {
    if (p.getAttribute('stroke-dasharray')) continue;
    p.getAnimations().forEach((a) => a.cancel());
    p.animate([{ strokeDasharray: '0 1' }, { strokeDasharray: '1 0' }], {
      duration: dur,
      delay: ((Number(p.dataset.r) || 0) / max) * dur * 0.45,
      easing,
      fill: 'backwards',
    });
  }
}

for (const svg of document.querySelectorAll<SVGSVGElement>('svg[data-print-draw="hover"]')) {
  const host = svg.closest<HTMLElement>('a, li') ?? svg;
  let last = 0;
  host.addEventListener('pointerenter', () => {
    const now = performance.now();
    if (now - last < 400) return;
    last = now;
    draw(svg);
  });
}

const once = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      once.unobserve(e.target);
      draw(e.target as SVGSVGElement);
    }
  },
  { threshold: 0.3 },
);
document.querySelectorAll<SVGSVGElement>('svg[data-print-draw="view"]').forEach((svg) => once.observe(svg));
