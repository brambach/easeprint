/*
 * easeprint's in-page reader. Injected into the page's own world when you click the toolbar button (or at
 * document_start for "Record from load"). It only observes: it never changes the page, except for the highlight
 * overlay you ask for, which lives in its own shadow root and removes itself.
 *
 * Four sources, from most to least certain:
 * 1. transitionrun / animationstart events: exact computed timing for CSS motion as it happens.
 * 2. document.getAnimations() and Element.animate: the Web Animations API, which Motion and others use.
 * 3. A scan of every element's computed transition and animation at rest: what the site has declared, even if it
 *    hasn't moved yet.
 * 4. Inline style changes frame by frame, fitted back to a curve: motion driven from JavaScript.
 */
import { parseDuration, splitList } from '../../src/lib/easing';
import { fitFrames, type Frame } from '../../src/lib/print/fit';
import { observationKey, type Observation, type ObservationKind } from '../../src/lib/print/tiers';

export interface Honesty {
  reducedMotionRules: number;
  reducedMotionQueries: number;
  /** Stylesheets the page loaded that the browser won't let a script read (other origins). */
  unreadableSheets: number;
  readableSheets: number;
  transitionAllElements: number;
  libraries: string[];
  webgl: boolean;
  bigCanvases: number;
  fittedMoves: number;
  scrollLinked: number;
  jsLoops: number;
}

export interface Snapshot {
  version: 1;
  url: string;
  host: string;
  title: string;
  startedAt: number;
  fromLoad: boolean;
  /** Events seen live, as opposed to declared at rest. */
  liveEvents: number;
  elementsScanned: number;
  observations: Observation[];
  honesty: Honesty;
}

interface Acc {
  o: Observation;
  els: WeakRef<Element>[];
}

declare global {
  interface Window {
    __epx?: {
      snapshot(): Snapshot;
      highlight(keys: string[], timingFunction: string, durationMs: number): number;
      rescan(): void;
    };
  }
}

(() => {
  if (window.top !== window || window.__epx) return;
  const startedAt = Date.now();
  const fromLoad = document.readyState === 'loading';
  const live = new Map<string, Acc>();
  const declared = new Map<string, Acc>();
  let liveEvents = 0;
  let elementsScanned = 0;
  let transitionAllElements = 0;
  let reducedMotionQueries = 0;
  let webglContexts = 0;
  let fittedMoves = 0;
  let scrollLinked = 0;
  let jsLoops = 0;
  const MAX = 3000;

  const describe = (el: Element): string => {
    const one = (n: Element) => {
      let s = n.localName;
      if (n.id && /^[a-zA-Z][\w-]{0,40}$/.test(n.id)) return `${s}#${n.id}`;
      const cls = (n.getAttribute('class') || '').split(/\s+/).filter((c) => /^[a-zA-Z_][\w-]{0,40}$/.test(c)).slice(0, 2);
      if (cls.length) s += `.${cls.join('.')}`;
      return s;
    };
    const p = el.parentElement && el.parentElement !== document.body ? `${one(el.parentElement)} > ` : '';
    return (p + one(el)).slice(0, 140);
  };

  const ms = (d: string) => {
    try {
      return parseDuration(d);
    } catch {
      return 0;
    }
  };
  const at = (list: string[], i: number) => list[i % list.length] ?? list[0] ?? '';

  function add(map: Map<string, Acc>, o: Omit<Observation, 'count'>, el: Element | null, n = 1) {
    if (!(o.durationMs > 0)) return;
    const key = `${o.kind}|${o.property}|${observationKey(o)}|${o.iterations ?? ''}`;
    const hit = map.get(key);
    if (hit) {
      hit.o.count += n;
      if (el && hit.els.length < 24) hit.els.push(new WeakRef(el));
      return;
    }
    if (map.size >= MAX) return;
    map.set(key, { o: { ...o, count: n }, els: el ? [new WeakRef(el)] : [] });
  }

  /* 1. CSS events */
  addEventListener(
    'transitionrun',
    (e) => {
      const el = e.target as Element;
      const cs = getComputedStyle(el, e.pseudoElement || null);
      const props = splitList(cs.transitionProperty);
      let i = props.indexOf(e.propertyName);
      if (i < 0) i = Math.max(0, props.indexOf('all'));
      liveEvents++;
      add(
        live,
        {
          kind: 'transition',
          property: e.propertyName,
          timingFunction: at(splitList(cs.transitionTimingFunction), i),
          durationMs: ms(at(splitList(cs.transitionDuration), i)),
          selector: describe(el),
        },
        el,
      );
    },
    true,
  );
  addEventListener(
    'animationstart',
    (e) => {
      const el = e.target as Element;
      const cs = getComputedStyle(el, e.pseudoElement || null);
      const names = splitList(cs.animationName);
      const i = Math.max(0, names.indexOf(e.animationName));
      liveEvents++;
      add(
        live,
        {
          kind: 'animation',
          property: e.animationName,
          timingFunction: at(splitList(cs.animationTimingFunction), i),
          durationMs: ms(at(splitList(cs.animationDuration), i)),
          iterations: at(splitList(cs.animationIterationCount), i),
          selector: describe(el),
        },
        el,
      );
    },
    true,
  );

  /* 2. Web Animations */
  const seen = new WeakSet<Animation>();
  function fromWaapi(a: Animation) {
    if (seen.has(a)) return;
    seen.add(a);
    const name = a.constructor?.name;
    if (name === 'CSSTransition' || name === 'CSSAnimation') return;
    const effect = a.effect as KeyframeEffect | null;
    if (!effect || typeof effect.getTiming !== 'function') return;
    const t = effect.getTiming();
    const frames = effect.getKeyframes?.() ?? [];
    const props = [...new Set(frames.flatMap((f) => Object.keys(f).filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k))))];
    const perFrame = [...new Set(frames.map((f) => f.easing).filter((x): x is string => Boolean(x) && x !== 'linear'))];
    // Motion and others often ease per keyframe and leave the overall easing linear. The per-frame curve is the feel.
    const timingFunction = (t.easing && t.easing !== 'linear') || perFrame.length !== 1 ? t.easing || 'linear' : perFrame[0]!;
    liveEvents++;
    add(
      live,
      {
        kind: 'waapi',
        property: props.join(', ') || 'unknown',
        timingFunction,
        durationMs: typeof t.duration === 'number' ? t.duration : 0,
        iterations: t.iterations === Infinity ? 'infinite' : String(t.iterations ?? 1),
        selector: effect.target ? describe(effect.target) : undefined,
      },
      effect.target,
    );
  }
  const nativeAnimate = Element.prototype.animate;
  Element.prototype.animate = function animate(this: Element, ...args: Parameters<Element['animate']>) {
    const a = nativeAnimate.apply(this, args);
    try {
      fromWaapi(a);
    } catch {
      /* never break the page */
    }
    return a;
  };
  const nativeMatchMedia = window.matchMedia;
  window.matchMedia = function matchMedia(q: string) {
    if (/prefers-reduced-motion/i.test(String(q))) reducedMotionQueries++;
    return nativeMatchMedia.call(window, q);
  };
  const nativeGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
    const ctx = (nativeGetContext as (...a: unknown[]) => RenderingContext | null).call(this, type, ...rest);
    if (ctx && /webgl|webgpu/i.test(type)) webglContexts++;
    return ctx;
  } as typeof HTMLCanvasElement.prototype.getContext;

  /* 4. JS motion: inline style changes, frame by frame */
  interface Track {
    frames: Frame[];
    lastScrollFrames: number;
    el: Element;
  }
  const tracks = new Map<Element, Track>();
  let lastScroll = -1e9;
  addEventListener('scroll', () => (lastScroll = performance.now()), { capture: true, passive: true });
  const read = (el: Element): number[] => {
    const cs = getComputedStyle(el);
    let m: DOMMatrix;
    try {
      m = new DOMMatrix(cs.transform === 'none' ? undefined : cs.transform);
    } catch {
      m = new DOMMatrix();
    }
    return [m.m41, m.m42, Math.hypot(m.a, m.b), (Math.atan2(m.b, m.a) * 180) / Math.PI, Number(cs.opacity)];
  };
  const observer = new MutationObserver((list) => {
    const now = performance.now();
    for (const m of list) {
      const el = m.target as Element;
      if (!(el instanceof HTMLElement || el instanceof SVGElement)) continue;
      let tr = tracks.get(el);
      if (!tr) {
        if (tracks.size > 200) continue;
        tr = { frames: [], lastScrollFrames: 0, el };
        tracks.set(el, tr);
      }
      const last = tr.frames[tr.frames.length - 1];
      if (last && now - last.t < 4) continue;
      tr.frames.push({ t: now, v: read(el) });
      if (now - lastScroll < 60) tr.lastScrollFrames++;
    }
  });
  observer.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['style'] });
  setInterval(() => {
    const now = performance.now();
    for (const [el, tr] of tracks) {
      const last = tr.frames[tr.frames.length - 1];
      if (!last) continue;
      const span = last.t - tr.frames[0]!.t;
      if (span > 5000) {
        jsLoops++;
        tracks.delete(el);
        continue;
      }
      if (now - last.t < 160) continue;
      tracks.delete(el);
      if (tr.frames.length < 6) continue;
      if (tr.lastScrollFrames > tr.frames.length / 2) {
        scrollLinked++;
        continue;
      }
      // A CSS transition or animation on the element already told us exactly; don't guess on top of it.
      const cs = getComputedStyle(el);
      if (splitList(cs.transitionDuration).some((d) => ms(d) > 0) || cs.animationName !== 'none') continue;
      const fit = fitFrames(tr.frames);
      if (!fit) continue;
      fittedMoves++;
      liveEvents++;
      add(
        live,
        {
          kind: 'fitted',
          property: ['translate', 'translate', 'scale', 'rotate', 'opacity'][fit.component] ?? 'transform',
          timingFunction: fit.timingFunction,
          durationMs: fit.durationMs,
          selector: describe(el),
          fitError: fit.error,
        },
        el,
      );
    }
    try {
      for (const a of document.getAnimations()) fromWaapi(a);
    } catch {
      /* some pages throw here mid-navigation */
    }
  }, 120);

  /* 3. Declared at rest */
  function scan(limit = 6000) {
    declared.clear();
    transitionAllElements = 0;
    const all = document.querySelectorAll('*');
    elementsScanned = Math.min(all.length, limit);
    for (let n = 0; n < elementsScanned; n++) {
      const el = all[n]!;
      for (const pseudo of [null, '::before', '::after'] as const) {
        const cs = getComputedStyle(el, pseudo);
        if (pseudo && (cs.content === 'none' || cs.content === 'normal')) continue;
        const durs = splitList(cs.transitionDuration);
        if (durs.some((d) => ms(d) > 0)) {
          const props = splitList(cs.transitionProperty);
          const tfs = splitList(cs.transitionTimingFunction);
          if (props.includes('all')) transitionAllElements++;
          props.forEach((property, i) => {
            add(declared, { kind: 'transition', property, timingFunction: at(tfs, i), durationMs: ms(at(durs, i)), selector: describe(el) }, el);
          });
        }
        if (cs.animationName && cs.animationName !== 'none') {
          const names = splitList(cs.animationName);
          const d = splitList(cs.animationDuration);
          const tf = splitList(cs.animationTimingFunction);
          const it = splitList(cs.animationIterationCount);
          names.forEach((name, i) => {
            if (name === 'none') return;
            add(
              declared,
              {
                kind: 'animation',
                property: name,
                timingFunction: at(tf, i),
                durationMs: ms(at(d, i)),
                iterations: at(it, i),
                selector: describe(el),
              },
              el,
            );
          });
        }
      }
    }
  }

  function sheets() {
    let rules = 0;
    let readable = 0;
    let unreadable = 0;
    const walk = (list: CSSRuleList) => {
      for (const r of Array.from(list)) {
        if (r instanceof CSSMediaRule && /prefers-reduced-motion/i.test(r.conditionText)) rules++;
        if ('cssRules' in r && (r as CSSGroupingRule).cssRules) walk((r as CSSGroupingRule).cssRules);
      }
    };
    for (const s of [...Array.from(document.styleSheets), ...(document.adoptedStyleSheets ?? [])]) {
      try {
        walk(s.cssRules);
        readable++;
      } catch {
        unreadable++;
      }
    }
    return { rules, readable, unreadable };
  }

  function libraries(): string[] {
    const w = window as unknown as Record<string, unknown>;
    const html = document.documentElement;
    const out: string[] = [];
    if (w.gsap) out.push('GSAP');
    if (w.ScrollTrigger) out.push('ScrollTrigger');
    if (w.lenis || w.Lenis || html.classList.contains('lenis')) out.push('Lenis');
    if (html.classList.contains('has-scroll-smooth') || document.querySelector('[data-scroll-container]')) out.push('Locomotive Scroll');
    if (document.querySelector('[data-framer-appear-id],[data-framer-name]')) out.push('Framer');
    if (w.anime) out.push('anime.js');
    if (w.THREE || document.querySelector('canvas[data-engine*="three" i]')) out.push('three.js');
    if (document.querySelector('lottie-player, dotlottie-player, [class*="lottie" i]')) out.push('Lottie');
    if (document.querySelector('canvas[class*="rive" i], [data-rive]')) out.push('Rive');
    return out;
  }

  const ready = () => scan();
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
  addEventListener('load', () => setTimeout(scan, 300), { once: true });

  function highlight(keys: string[], timingFunction: string, durationMs: number): number {
    const want = new Set(keys);
    const els = new Set<Element>();
    for (const map of [live, declared]) {
      for (const acc of map.values()) {
        if (!want.has(observationKey(acc.o))) continue;
        for (const ref of acc.els) {
          const el = ref.deref();
          if (el && el.isConnected) els.add(el);
          if (els.size >= 40) break;
        }
      }
    }
    document.getElementById('__easeprint-hl')?.remove();
    const host = document.createElement('div');
    host.id = '__easeprint-hl';
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    const root = host.attachShadow({ mode: 'closed' });
    const reduce = nativeMatchMedia.call(window, '(prefers-reduced-motion: reduce)').matches;
    let shown = 0;
    let first: Element | null = null;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      first ??= el;
      const box = document.createElement('div');
      box.style.cssText = `position:fixed;left:${r.left - 3}px;top:${r.top - 3}px;width:${r.width + 6}px;height:${r.height + 6}px;border:1.5px solid #c4552a;border-radius:6px;background:rgb(196 85 42 / 6%)`;
      root.append(box);
      shown++;
      // The highlight itself moves on the tier's own curve and duration, so you see the timing on the real page.
      if (!reduce)
        nativeAnimate.call(box, [{ transform: 'scale(0.92)', opacity: 0 }, { transform: 'none', opacity: 1 }], {
          duration: durationMs,
          easing: timingFunction,
          fill: 'both',
        });
    }
    document.documentElement.append(host);
    if (first && shown) {
      const r = first.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) first.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }
    setTimeout(() => host.remove(), Math.max(1800, durationMs + 1400));
    return shown;
  }

  function snapshot(): Snapshot {
    const s = sheets();
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const bigCanvases = canvases.filter((c) => {
      const r = c.getBoundingClientRect();
      return r.width * r.height > innerWidth * innerHeight * 0.25;
    }).length;
    // Live events are the stronger evidence. A declared pair that also fired live is counted once, as live.
    const liveKeys = new Set([...live.values()].map((a) => observationKey(a.o)));
    const observations = [
      ...[...live.values()].map((a) => a.o),
      ...[...declared.values()].filter((a) => !liveKeys.has(observationKey(a.o))).map((a) => a.o),
    ];
    return {
      version: 1,
      url: location.href,
      host: location.hostname.replace(/^www\./, ''),
      title: document.title.slice(0, 140),
      startedAt,
      fromLoad,
      liveEvents,
      elementsScanned,
      observations,
      honesty: {
        reducedMotionRules: s.rules,
        reducedMotionQueries,
        unreadableSheets: s.unreadable,
        readableSheets: s.readable,
        transitionAllElements,
        libraries: libraries(),
        webgl: webglContexts > 0,
        bigCanvases,
        fittedMoves,
        scrollLinked,
        jsLoops,
      },
    };
  }

  window.__epx = { snapshot, highlight, rescan: () => scan() };
})();

export type { ObservationKind };
