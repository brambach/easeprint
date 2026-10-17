/*
 * easeprint probe. Injected into the page before any of its own scripts run, by scripts/measure.ts.
 * Plain browser JavaScript on purpose: it's sent as text, so no build step can rewrite it.
 *
 * It only observes. It never clicks, never changes the page's DOM, and keeps everything on window.__ep.
 */
(() => {
  if (window.top !== window || window.__ep) return;

  const MAX_KEYS = 4000;
  const ep = {
    phase: 'load',
    records: new Map(),
    webglContexts: 0,
    canvas2dContexts: 0,
    reducedMotionQueries: [],
    reducedMotionQueryCount: 0,
    errors: [],
  };
  window.__ep = ep;

  const seen = new WeakSet();

  function describe(el) {
    if (!el || el.nodeType !== 1) return String(el && el.nodeName ? el.nodeName.toLowerCase() : 'unknown');
    const one = (node) => {
      let s = node.localName;
      if (node.id && /^[a-zA-Z][\w-]{0,40}$/.test(node.id)) return `${s}#${node.id}`;
      const cls = typeof node.className === 'string' ? node.className : node.getAttribute('class') || '';
      const parts = cls
        .split(/\s+/)
        .filter((c) => c && /^[a-zA-Z_][\w-]{0,40}$/.test(c))
        .slice(0, 2);
      if (parts.length) s += `.${parts.join('.')}`;
      return s;
    };
    const parent = el.parentElement && el.parentElement !== document.body ? `${one(el.parentElement)} > ` : '';
    return (parent + one(el)).slice(0, 140);
  }
  ep.describe = describe;

  function record(r) {
    const key = [r.kind, r.phase, r.property || r.name || '', r.duration, r.timingFunction, r.delay || '', r.selector].join('|');
    const existing = ep.records.get(key);
    if (existing) {
      existing.count++;
      return;
    }
    if (ep.records.size >= MAX_KEYS) return;
    ep.records.set(key, { ...r, count: 1 });
  }

  function split(value) {
    const out = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < value.length; i++) {
      const c = value[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      else if (c === ',' && depth === 0) {
        out.push(value.slice(start, i).trim());
        start = i + 1;
      }
    }
    out.push(value.slice(start).trim());
    return out;
  }
  ep.split = split;

  const at = (list, i) => list[i % list.length];

  function fromTransitionEvent(event) {
    try {
      const target = event.target;
      const pseudo = event.pseudoElement || null;
      const cs = getComputedStyle(target, pseudo);
      const props = split(cs.transitionProperty);
      let i = props.indexOf(event.propertyName);
      if (i < 0) i = props.indexOf('all');
      if (i < 0) i = 0;
      record({
        kind: 'transition',
        phase: ep.phase,
        property: event.propertyName,
        declaredProperty: props[i],
        duration: at(split(cs.transitionDuration), i),
        timingFunction: at(split(cs.transitionTimingFunction), i),
        delay: at(split(cs.transitionDelay), i),
        selector: describe(target) + (pseudo || ''),
      });
    } catch (e) {
      ep.errors.push(`transition: ${e && e.message}`);
    }
  }

  function fromAnimationEvent(event) {
    try {
      const target = event.target;
      const pseudo = event.pseudoElement || null;
      const cs = getComputedStyle(target, pseudo);
      const names = split(cs.animationName);
      let i = names.indexOf(event.animationName);
      if (i < 0) i = 0;
      let properties;
      try {
        const anim = target.getAnimations().find((a) => a.animationName === event.animationName);
        const frames = anim && anim.effect ? anim.effect.getKeyframes() : [];
        properties = [
          ...new Set(frames.flatMap((f) => Object.keys(f).filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)))),
        ].join(', ');
      } catch {
        properties = undefined;
      }
      record({
        kind: 'animation',
        phase: ep.phase,
        name: event.animationName,
        keyframeProperties: properties,
        duration: at(split(cs.animationDuration), i),
        timingFunction: at(split(cs.animationTimingFunction), i),
        delay: at(split(cs.animationDelay), i),
        iterations: at(split(cs.animationIterationCount), i),
        selector: describe(target) + (pseudo || ''),
      });
    } catch (e) {
      ep.errors.push(`animation: ${e && e.message}`);
    }
  }

  addEventListener('transitionrun', fromTransitionEvent, true);
  addEventListener('animationstart', fromAnimationEvent, true);

  function fromWaapi(animation, source) {
    if (seen.has(animation)) return;
    seen.add(animation);
    try {
      const effect = animation.effect;
      if (!effect || typeof effect.getTiming !== 'function') return;
      const timing = effect.getTiming();
      const frames = typeof effect.getKeyframes === 'function' ? effect.getKeyframes() : [];
      const properties = [
        ...new Set(frames.flatMap((f) => Object.keys(f).filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k)))),
      ];
      const frameEasings = [...new Set(frames.map((f) => f.easing).filter((e) => e && e !== 'linear'))];
      const duration = typeof timing.duration === 'number' ? `${Math.round(timing.duration * 1000) / 1000}ms` : String(timing.duration);
      record({
        kind: 'waapi',
        phase: ep.phase,
        property: properties.join(', '),
        duration,
        timingFunction: timing.easing || 'linear',
        keyframeEasings: frameEasings,
        delay: `${timing.delay || 0}ms`,
        iterations: String(timing.iterations),
        source,
        selector: effect.target ? describe(effect.target) + (effect.pseudoElement || '') : 'no target',
      });
    } catch (e) {
      ep.errors.push(`waapi: ${e && e.message}`);
    }
  }

  const nativeAnimate = Element.prototype.animate;
  Element.prototype.animate = function animate(...args) {
    const animation = nativeAnimate.apply(this, args);
    fromWaapi(animation, 'element.animate');
    return animation;
  };

  const nativeGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) {
    const ctx = nativeGetContext.call(this, type, ...rest);
    if (ctx && /^(webgl|webgl2|experimental-webgl|webgpu)$/i.test(String(type))) ep.webglContexts++;
    if (ctx && type === '2d') ep.canvas2dContexts++;
    return ctx;
  };

  const nativeMatchMedia = window.matchMedia;
  window.matchMedia = function matchMedia(query) {
    if (/prefers-reduced-motion/i.test(String(query))) {
      ep.reducedMotionQueryCount++;
      if (ep.reducedMotionQueries.length < 10) ep.reducedMotionQueries.push(String(query));
    }
    return nativeMatchMedia.call(window, query);
  };

  const gsapSeen = new WeakSet();
  function gsapSample() {
    const gsap = window.gsap;
    if (!gsap || !gsap.globalTimeline || typeof gsap.globalTimeline.getChildren !== 'function') return;
    let defaultEase = 'power1.out';
    try {
      const d = gsap.defaults && gsap.defaults();
      if (d && typeof d.ease === 'string') defaultEase = d.ease;
    } catch {
      /* keep the documented default */
    }
    for (const tween of gsap.globalTimeline.getChildren(true, true, false)) {
      if (gsapSeen.has(tween)) continue;
      gsapSeen.add(tween);
      const vars = tween.vars || {};
      const ease = typeof vars.ease === 'string' ? vars.ease : vars.ease ? 'custom function' : `${defaultEase} (default)`;
      const targets = typeof tween.targets === 'function' ? tween.targets() : [];
      const props = Object.keys(vars).filter(
        (k) => !/^(ease|duration|delay|stagger|onComplete|onStart|onUpdate|scrollTrigger|repeat|yoyo|overwrite|immediateRender|paused|callbackScope|id|data|lazy|inherit|runBackwards|startAt|onReverseComplete|onRepeat)$/.test(k),
      );
      record({
        kind: 'gsap',
        phase: ep.phase,
        property: props.slice(0, 6).join(', '),
        duration: `${Math.round(tween.duration() * 1000)}ms`,
        timingFunction: ease,
        delay: `${Math.round((vars.delay || 0) * 1000)}ms`,
        scrollTriggered: Boolean(vars.scrollTrigger),
        selector: targets[0] && targets[0].nodeType === 1 ? describe(targets[0]) : typeof targets[0],
      });
    }
  }

  function sample() {
    try {
      for (const a of document.getAnimations()) {
        const name = a.constructor && a.constructor.name;
        if (name === 'CSSTransition' || name === 'CSSAnimation') continue;
        fromWaapi(a, 'getAnimations');
      }
      gsapSample();
    } catch (e) {
      ep.errors.push(`sample: ${e && e.message}`);
    }
  }
  ep.sample = sample;
  setInterval(sample, 120);

  /* ---------- Called by the runner at the end ---------- */

  /** Every element's computed transitions and animations, aggregated by exact value. */
  ep.computedScan = (limit = 20000) => {
    const transitions = new Map();
    const animations = new Map();
    let transitionAllElements = 0;
    let scanned = 0;
    const add = (map, key, value, selector) => {
      const existing = map.get(key);
      if (existing) {
        existing.count++;
        if (existing.samples.length < 3 && !existing.samples.includes(selector)) existing.samples.push(selector);
      } else if (map.size < MAX_KEYS) {
        map.set(key, { ...value, count: 1, samples: [selector] });
      }
    };
    const visit = (el, pseudo) => {
      const cs = getComputedStyle(el, pseudo);
      if (pseudo && (cs.content === 'none' || cs.content === 'normal')) return;
      const selector = describe(el) + (pseudo || '');
      const durations = split(cs.transitionDuration);
      if (durations.some((d) => parseFloat(d) > 0)) {
        const props = split(cs.transitionProperty);
        const timings = split(cs.transitionTimingFunction);
        const delays = split(cs.transitionDelay);
        if (props.includes('all')) transitionAllElements++;
        props.forEach((property, i) => {
          const duration = at(durations, i);
          if (!(parseFloat(duration) > 0)) return;
          const value = { property, duration, timingFunction: at(timings, i), delay: at(delays, i) };
          add(transitions, Object.values(value).join('|'), value, selector);
        });
      }
      if (cs.animationName && cs.animationName !== 'none') {
        const names = split(cs.animationName);
        const durations2 = split(cs.animationDuration);
        const timings = split(cs.animationTimingFunction);
        const delays = split(cs.animationDelay);
        const iterations = split(cs.animationIterationCount);
        names.forEach((name, i) => {
          if (name === 'none') return;
          const value = {
            name,
            duration: at(durations2, i),
            timingFunction: at(timings, i),
            delay: at(delays, i),
            iterations: at(iterations, i),
          };
          add(animations, Object.values(value).join('|'), value, selector);
        });
      }
    };
    for (const el of document.querySelectorAll('*')) {
      if (scanned++ >= limit) break;
      visit(el, null);
      visit(el, '::before');
      visit(el, '::after');
    }
    const sorted = (map) => [...map.values()].sort((a, b) => b.count - a.count);
    return {
      elementsScanned: Math.min(scanned, limit),
      elementsTotal: document.querySelectorAll('*').length,
      transitionAllElements,
      transitions: sorted(transitions),
      animations: sorted(animations),
    };
  };

  /** Stylesheets the page built in the document: inline <style> and adopted sheets. External files are read from the network. */
  ep.inlineSheetScan = () => {
    const out = { sheets: 0, reducedMotionRules: 0, transitionAll: [], keyframes: [], unreadable: 0 };
    const walk = (rules) => {
      for (const rule of rules) {
        if (rule.type === CSSRule.KEYFRAMES_RULE) out.keyframes.push(rule.name);
        else if (rule.type === CSSRule.MEDIA_RULE) {
          if (/prefers-reduced-motion/i.test(rule.conditionText || rule.media.mediaText)) out.reducedMotionRules++;
          walk(rule.cssRules);
        } else if (rule.cssRules && rule.cssRules.length) walk(rule.cssRules);
        if (rule.style) {
          const t = `${rule.style.transition || ''} ${rule.style.transitionProperty || ''}`;
          if (/(^|[\s,])all([\s,]|$)/.test(t) && out.transitionAll.length < 50) {
            out.transitionAll.push({ selector: String(rule.selectorText || '').slice(0, 140), value: t.trim().slice(0, 140) });
          }
        }
      }
    };
    const sheets = [...document.styleSheets].filter((s) => !s.href);
    for (const sheet of [...sheets, ...(document.adoptedStyleSheets || [])]) {
      out.sheets++;
      try {
        walk(sheet.cssRules);
      } catch {
        out.unreadable++;
      }
    }
    out.keyframes = [...new Set(out.keyframes)];
    return out;
  };

  /** What the page is built with, as far as motion goes. Presence checks only. */
  ep.fingerprint = () => {
    const html = document.documentElement;
    const canvases = [...document.querySelectorAll('canvas')];
    const big = canvases.filter((c) => {
      const r = c.getBoundingClientRect();
      return r.width * r.height > innerWidth * innerHeight * 0.25;
    });
    return {
      title: document.title.slice(0, 140),
      canvases: canvases.length,
      viewportSizedCanvases: big.length,
      webglContexts: ep.webglContexts,
      canvas2dContexts: ep.canvas2dContexts,
      videos: document.querySelectorAll('video').length,
      gsap: window.gsap && window.gsap.version ? String(window.gsap.version) : null,
      scrollTrigger: Boolean(window.ScrollTrigger),
      lenis: Boolean(window.lenis || window.Lenis || html.classList.contains('lenis')),
      locomotiveScroll: Boolean(html.classList.contains('has-scroll-smooth') || document.querySelector('[data-scroll-container]')),
      framerMotionAttrs: document.querySelectorAll('[data-framer-appear-id],[data-framer-name]').length,
      reducedMotionQueryCount: ep.reducedMotionQueryCount,
      reducedMotionQueries: ep.reducedMotionQueries,
      documentHeight: document.documentElement.scrollHeight,
    };
  };

  /** Up to n visible, distinct interactive elements, spread through the page. */
  ep.hoverCandidates = (n = 30) => {
    const all = [
      ...document.querySelectorAll('a[href], button, [role="button"], [role="tab"], summary, [class*="card" i], [class*="btn" i]'),
    ];
    const byDescriptor = new Map();
    for (const el of all) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width < 8 || r.height < 8 || cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
      const d = describe(el);
      if (!byDescriptor.has(d)) byDescriptor.set(d, el);
    }
    const unique = [...byDescriptor.values()];
    const step = Math.max(1, unique.length / n);
    const picked = [];
    for (let i = 0; i < unique.length && picked.length < n; i += step) picked.push(unique[Math.floor(i)]);
    ep.hoverTargets = picked;
    return { available: all.length, distinct: unique.length, picked: picked.map(describe) };
  };

  /** Brings hover target i on screen and returns its centre, or null if it can't be hovered. */
  ep.hoverPoint = (i) => {
    const el = ep.hoverTargets && ep.hoverTargets[i];
    if (!el || !el.isConnected) return null;
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    const x = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 2);
    const y = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 2);
    const hit = document.elementFromPoint(x, y);
    return { x, y, selector: describe(el), covered: Boolean(hit && hit !== el && !el.contains(hit)) };
  };

  ep.dump = () => [...ep.records.values()].sort((a, b) => b.count - a.count);
})();
