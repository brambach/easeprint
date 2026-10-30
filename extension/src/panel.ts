/*
 * The side panel: reads the page through the probe, turns what it saw into tiers, and draws the print.
 * Everything shown is computed from the snapshot; nothing here is typed by hand.
 */
import { parseEasing, yRange } from '../../src/lib/easing';
import { plot } from '../../src/lib/plot';
import { exportTiers, FORMATS, type Format } from '../../src/lib/print/export';
import { fingerprint } from '../../src/lib/print/fingerprint';
import { buildTiers, durationLabel, type Tier } from '../../src/lib/print/tiers';
import type { Snapshot } from './probe';
import { savePrint } from './save';

const app = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
const reduce = matchMedia('(prefers-reduced-motion: reduce)');

interface State {
  tabId: number | null;
  phase: 'starting' | 'reading' | 'no-access' | 'unreadable';
  snap: Snapshot | null;
  tiers: Tier[];
  dropped: number;
  format: Format;
  slow: boolean;
  drawn: string;
  focus: number | null;
}

const state: State = {
  tabId: params.has('tab') ? Number(params.get('tab')) : null,
  phase: 'starting',
  snap: null,
  tiers: [],
  dropped: 0,
  format: 'css',
  slow: false,
  drawn: '',
  focus: null,
};

try {
  const saved = localStorage.getItem('format');
  if (saved && FORMATS.some((f) => f.id === saved)) state.format = saved as Format;
} catch {
  /* storage can be off */
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const n = (x: number) => x.toLocaleString('en-US');
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- Talking to the page ---------- */

async function run<T>(func: () => T): Promise<T | undefined> {
  const [res] = await chrome.scripting.executeScript({ target: { tabId: state.tabId! }, world: 'MAIN', func });
  return res?.result as T | undefined;
}

async function poll() {
  if (state.tabId == null) return;
  try {
    let snap = await run(() => (window.__epx ? window.__epx.snapshot() : null));
    if (snap === null) {
      await chrome.scripting.executeScript({ target: { tabId: state.tabId }, world: 'MAIN', files: ['probe.js'] });
      snap = await run(() => (window.__epx ? window.__epx.snapshot() : null));
    }
    if (!snap) return;
    state.phase = 'reading';
    const { tiers, dropped } = buildTiers(snap.observations);
    const changed = JSON.stringify(tiers.map((t) => [t.name, t.timingFunction, t.durationMs, t.count])) !== JSON.stringify(state.tiers.map((t) => [t.name, t.timingFunction, t.durationMs, t.count]));
    const first = !state.snap;
    state.snap = snap;
    state.dropped = dropped;
    if (changed || first) {
      state.tiers = tiers;
      render();
    } else updateStatus();
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    const next = /cannot be scripted|chrome:\/\/|extensions gallery|webstore|cannot access a chrome/i.test(msg) ? 'unreadable' : 'no-access';
    if (state.phase !== next || state.snap) {
      state.phase = next;
      state.snap = null;
      state.tiers = [];
      state.drawn = '';
      render();
    }
  }
}

async function currentTab(): Promise<number | null> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id ?? null;
}

function reset(tabId: number | null) {
  state.tabId = tabId;
  state.snap = null;
  state.tiers = [];
  state.drawn = '';
  state.phase = 'starting';
  render();
  void poll();
}

/* ---------- Rendering ---------- */

const GLYPH = {
  reading: '<svg class="glyph reading" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="18 10" stroke-linecap="round"/></svg>',
  check: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5 5 9l5-6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  cross: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="m3 3 6 6M9 3 3 9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  ring: '<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
};

function statusText(): string {
  const s = state.snap;
  if (!s) return 'Starting';
  const secs = Math.max(1, Math.round((Date.now() - s.startedAt) / 1000));
  const t = secs < 90 ? `${secs}s` : `${Math.round(secs / 60)}m`;
  return `Reading · ${n(s.liveEvents)} moves seen · ${t}`;
}

function updateStatus() {
  const el = document.getElementById('status-text');
  if (el) el.textContent = statusText();
}

function render() {
  if (state.phase === 'no-access' || state.phase === 'unreadable') return renderBlank();
  const s = state.snap;
  if (!s) {
    app.innerHTML = `<div class="blank"><span class="brand">easeprint<b>.</b></span><p class="hint">Reading the page…</p></div>`;
    return;
  }
  const tiers = state.tiers;
  const totalMoves = tiers.reduce((x, t) => x + t.count, 0);
  app.innerHTML = `
    <header class="head">
      <div class="head-row">
        <span class="brand">easeprint<b>.</b></span>
        <button class="btn" id="from-load" title="Reload the page with easeprint reading from the first frame">Record from load</button>
      </div>
      <h1>${esc(s.host || 'This page')}</h1>
      <p class="status">${GLYPH.reading}<span id="status-text">${esc(statusText())}</span></p>
    </header>
    ${tiers.length ? printBlock(tiers, totalMoves) : emptyBlock()}
    ${tiers.length ? tiersBlock(tiers) : ''}
    ${honestBlock(s)}
    ${tiers.length ? copyBlock(s, tiers) : ''}
  `;
  wire();
  drawPrint();
}

function renderBlank() {
  const unreadable = state.phase === 'unreadable';
  app.innerHTML = `<div class="blank">
    <span class="brand">easeprint<b>.</b></span>
    <h1>${unreadable ? 'Browser pages can’t be read' : 'Click easeprint on a page'}</h1>
    <p>${
      unreadable
        ? 'Chrome doesn’t let extensions read its own pages or the Web Store. Open any other site and click the easeprint button.'
        : 'easeprint only reads a page after you click its button in the toolbar, and stops when you leave that page. Click it on the site you want to read, or press <kbd>Alt</kbd> <kbd>Shift</kbd> <kbd>E</kbd>.'
    }</p>
  </div>`;
}

function emptyBlock(): string {
  return `<section class="print"><p class="hint">Nothing has moved yet and nothing on the page declares motion. Hover, scroll and click around; the print fills in as the page moves.</p></section>`;
}

function printBlock(tiers: Tier[], moves: number): string {
  return `<figure class="print" id="print" style="margin:0">
    <div id="print-art"></div>
    <figcaption class="print-caption mono">${tiers.length} tier${tiers.length === 1 ? '' : 's'} · ${n(moves)} moves${state.dropped ? ` · ${n(state.dropped)} more in rarer pairs` : ''}</figcaption>
  </figure>`;
}

function demoKind(t: Tier): 'pop' | 'word' | 'card' | 'spin' {
  if (t.role === 'loop') return 'spin';
  try {
    if (yRange(parseEasing(t.timingFunction))[1] > 1.02) return 'pop';
  } catch {
    /* steps and friends fall through */
  }
  if (t.properties.every((p) => p === 'opacity') || t.durationMs >= 600) return 'word';
  return 'card';
}

function demoMarkup(t: Tier): string {
  switch (demoKind(t)) {
    case 'pop':
      return '<div class="pop" data-part="pop"></div>';
    case 'word':
      return '<div class="word"><span data-part="word">Aa</span></div>';
    case 'spin':
      return '<div class="spin" data-part="spin"></div>';
    default:
      return '<div class="card" data-part="card"><div class="card-shadow" data-part="shadow"></div></div>';
  }
}

function tiersBlock(tiers: Tier[]): string {
  const longest = Math.max(...tiers.map((t) => t.durationMs));
  return `<section>
    <div class="section-head">
      <h2>Tiers</h2>
      <div class="tools">
        <button class="btn" id="slow" aria-pressed="${state.slow}">Slow-mo 10%</button>
        <button class="btn primary" id="play">Play all</button>
      </div>
    </div>
    <label class="scrub"><input id="scrub" type="range" min="0" max="${Math.round(longest)}" value="0" step="1" aria-label="Scrub every demo together, in milliseconds" /><output id="scrub-out" class="mono">0ms</output></label>
    <ol class="tiers">
      ${tiers
        .map(
          (t, i) => `<li class="tier" data-i="${i}" tabindex="0" aria-label="${esc(`${t.name}, ${t.timingFunction}, ${durationLabel(t.durationMs)}`)}">
            <div class="demo" aria-hidden="true">${demoMarkup(t)}</div>
            <div class="tier-main">
              <span class="tier-name">${esc(t.name)}${t.fitted ? ' <span class="fit">fitted</span>' : ''}</span>
              <span class="tier-value">${esc(shortTf(t.timingFunction))}</span>
              <span class="tier-meta">${esc(t.properties.join(', '))} · ${n(t.count)}×</span>
            </div>
            <div class="tier-side">
              <span class="tier-dur">${durationLabel(t.durationMs)}</span>
              <button class="icon-btn" data-show="${i}" title="Outline the elements that use it, moving on this curve">Show</button>
            </div>
          </li>`,
        )
        .join('')}
    </ol>
  </section>`;
}

function shortTf(tf: string): string {
  if (tf.length <= 60) return tf;
  try {
    const e = parseEasing(tf);
    if (e.kind === 'linear-fn') return `linear() with ${e.stops.length} stops`;
  } catch {
    /* fall through */
  }
  return `${tf.slice(0, 57)}…`;
}

function honestBlock(s: Snapshot): string {
  const h = s.honesty;
  const items: [keyof typeof GLYPH, string][] = [];
  if (h.reducedMotionRules || h.reducedMotionQueries) {
    items.push(['check', `Checks for reduced motion: ${h.reducedMotionRules} CSS rule${h.reducedMotionRules === 1 ? '' : 's'}${h.reducedMotionQueries ? `, ${h.reducedMotionQueries} script check${h.reducedMotionQueries === 1 ? '' : 's'}` : ''}. Whether they cover the motion above wasn’t tested.`]);
  } else {
    items.push(['cross', `No reduced-motion check found in ${h.readableSheets} readable stylesheet${h.readableSheets === 1 ? '' : 's'}${s.fromLoad ? ' or in scripts' : ''}.`]);
  }
  if (h.transitionAllElements) items.push(['cross', `transition: all on ${n(h.transitionAllElements)} element${h.transitionAllElements === 1 ? '' : 's'}.`]);
  if (h.fittedMoves) items.push(['ring', `${n(h.fittedMoves)} move${h.fittedMoves === 1 ? '' : 's'} driven from JavaScript, fitted from their frames. Fitted curves are close, not exact.`]);
  if (h.libraries.length) items.push(['ring', `Built with ${h.libraries.join(', ')}.`]);
  if (h.scrollLinked) items.push(['ring', `${n(h.scrollLinked)} scroll-linked move${h.scrollLinked === 1 ? '' : 's'} left out: they follow your scroll, not a clock.`]);
  if (h.webgl || h.bigCanvases) items.push(['cross', 'Part of this page draws in a canvas. Motion inside it can’t be read.']);
  if (h.unreadableSheets) items.push(['ring', `${h.unreadableSheets} stylesheet${h.unreadableSheets === 1 ? '' : 's'} from other domains couldn’t be read for reduced-motion rules.`]);
  if (!s.fromLoad) items.push(['ring', 'Motion that played before you clicked isn’t here. Record from load catches it.']);
  return `<section>
    <h2>What it saw, and didn’t</h2>
    <ul class="honest">${items.map(([g, t]) => `<li>${GLYPH[g]}<span>${esc(t).replace(/transition: all/g, '<code class="mono">transition: all</code>')}</span></li>`).join('')}</ul>
  </section>`;
}

function exportText(s: Snapshot, tiers: Tier[]): string {
  return exportTiers({ site: s.host, date: today(), tiers }, state.format);
}

function copyBlock(s: Snapshot, tiers: Tier[]): string {
  return `<section>
    <div class="section-head"><h2>Copy</h2></div>
    <div class="formats" role="group" aria-label="Format">
      ${FORMATS.map((f) => `<button class="btn" data-format="${f.id}" aria-pressed="${state.format === f.id}">${esc(f.label)}</button>`).join('')}
    </div>
    <pre id="code">${esc(exportText(s, tiers))}</pre>
    <div class="copy-row">
      <button class="btn primary" id="copy">Copy</button>
      <button class="btn" id="save">Save print</button>
      <span class="stamp" id="stamp" role="status"></span>
    </div>
  </section>`;
}

/* ---------- The print ---------- */

function printTiers() {
  return state.tiers.map((t) => ({ timingFunction: t.timingFunction, durationMs: t.durationMs, count: t.count, loop: t.role === 'loop' }));
}

function drawPrint() {
  const host = document.getElementById('print-art');
  if (!host) return;
  const p = fingerprint(printTiers());
  const sig = p.ridges.map((r) => r.d).join('');
  const firstDraw = state.drawn === '';
  host.innerHTML = `<svg viewBox="${p.viewBox}" role="img" aria-label="Motion fingerprint of ${esc(state.snap?.host ?? 'this page')}">
    <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
      ${p.ridges
        .map((r) =>
          r.measured
            ? `<path d="${r.d}" data-tier="${r.tier}" stroke-width="0.62" pathLength="1"${r.loop ? ' stroke-dasharray="0.012 0.01"' : ''}/>`
            : `<path d="${r.d}" stroke-width="0.37" opacity="0.62" pathLength="1"/>`,
        )
        .join('')}
    </g></svg>`;
  const svg = host.querySelector('svg')!;
  if (firstDraw && !reduce.matches) {
    // The one statement move: the print draws itself in, core first, like ink.
    const paths = [...svg.querySelectorAll('path')];
    const max = Math.max(...p.ridges.map((r) => r.radius));
    paths.forEach((path, i) => {
      const r = p.ridges[i]!;
      if (r.loop) return;
      path.animate([{ strokeDasharray: '0 1' }, { strokeDasharray: '1 0' }], {
        duration: 900,
        delay: (r.radius / max) * 420,
        easing: 'cubic-bezier(.2, .7, .2, 1)',
        fill: 'backwards',
      });
    });
  } else if (sig !== state.drawn) {
    svg.animate([{ opacity: 0.45 }, { opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.2, .7, .2, 1)' });
  }
  state.drawn = sig;
  applyFocus();
}

function applyFocus() {
  const fig = document.getElementById('print');
  if (!fig) return;
  fig.classList.toggle('focus', state.focus !== null);
  fig.querySelectorAll<SVGPathElement>('path[data-tier]').forEach((p) => p.classList.toggle('on', Number(p.dataset.tier) === state.focus));
}

/* ---------- Demos ---------- */

const demos = new Map<number, Animation[]>();

function keyframesFor(kind: ReturnType<typeof demoKind>, part: string): Keyframe[] {
  switch (part) {
    case 'card':
      return [{ transform: 'translateY(4px)' }, { transform: 'translateY(-3px)' }];
    case 'shadow':
      return [{ opacity: 0 }, { opacity: 1 }];
    case 'word':
      return [{ transform: 'translateY(110%)' }, { transform: 'none' }];
    case 'pop':
      return [{ transform: 'scale(0.4)' }, { transform: 'none' }];
    case 'spin':
      return [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }];
  }
  void kind;
  return [];
}

function makeDemo(i: number): Animation[] {
  const t = state.tiers[i]!;
  const row = app.querySelector<HTMLElement>(`.tier[data-i="${i}"]`);
  if (!row) return [];
  const kind = demoKind(t);
  const out: Animation[] = [];
  row.querySelectorAll<HTMLElement>('[data-part]').forEach((el) => {
    const a = el.animate(keyframesFor(kind, el.dataset.part!), {
      duration: t.durationMs * (state.slow ? 10 : 1),
      easing: t.timingFunction,
      fill: 'both',
      iterations: kind === 'spin' ? 2 : 1,
    });
    // At rest every demo shows where it lands; play and scrub run it from the start.
    a.pause();
    a.currentTime = t.durationMs * (state.slow ? 10 : 1) * (kind === 'spin' ? 2 : 1);
    out.push(a);
  });
  demos.get(i)?.forEach((a) => a.cancel());
  demos.set(i, out);
  return out;
}

function play(indices: number[]) {
  if (reduce.matches) {
    // Show the end state, no movement.
    for (const i of indices) makeDemo(i).forEach((a) => a.finish());
    return;
  }
  for (const i of indices)
    makeDemo(i).forEach((a) => {
      a.currentTime = 0;
      a.play();
    });
}

function scrubTo(ms: number) {
  const scale = state.slow ? 10 : 1;
  state.tiers.forEach((t, i) => {
    const anims = demos.get(i) ?? makeDemo(i);
    anims.forEach((a) => {
      a.pause();
      a.currentTime = Math.min(ms, t.durationMs * (demoKind(t) === 'spin' ? 2 : 1)) * scale;
    });
  });
  const out = document.getElementById('scrub-out');
  if (out) out.textContent = `${Math.round(ms)}ms`;
}

/* ---------- Events ---------- */

function wire() {
  demos.clear();
  // Every demo sits at its start until you play or scrub.
  state.tiers.forEach((_, i) => makeDemo(i));

  document.getElementById('play')?.addEventListener('click', () => {
    const scrub = document.getElementById('scrub') as HTMLInputElement | null;
    if (scrub) scrub.value = '0';
    play(state.tiers.map((_, i) => i));
  });
  document.getElementById('slow')?.addEventListener('click', (e) => {
    state.slow = !state.slow;
    (e.currentTarget as HTMLElement).setAttribute('aria-pressed', String(state.slow));
    state.tiers.forEach((_, i) => makeDemo(i));
  });
  document.getElementById('scrub')?.addEventListener('input', (e) => scrubTo(Number((e.target as HTMLInputElement).value)));

  app.querySelectorAll<HTMLElement>('.tier').forEach((row) => {
    const i = Number(row.dataset.i);
    row.addEventListener('pointerenter', () => {
      state.focus = i;
      applyFocus();
    });
    row.addEventListener('pointerleave', () => {
      state.focus = null;
      applyFocus();
    });
    row.addEventListener('focus', () => {
      state.focus = i;
      applyFocus();
    });
    row.addEventListener('blur', () => {
      state.focus = null;
      applyFocus();
    });
    row.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-show]')) return;
      play([i]);
    });
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        play([i]);
      }
    });
  });

  app.querySelectorAll<HTMLButtonElement>('[data-show]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const t = state.tiers[Number(btn.dataset.show)]!;
      play([Number(btn.dataset.show)]);
      const keys = t.keys;
      const shown = await chrome.scripting
        .executeScript({
          target: { tabId: state.tabId! },
          world: 'MAIN',
          func: (k: string[], tf: string, d: number) => window.__epx?.highlight(k, tf, d) ?? 0,
          args: [keys, t.timingFunction, t.durationMs],
        })
        .then(([r]) => r?.result as number)
        .catch(() => 0);
      btn.textContent = shown ? `${shown} shown` : 'Off screen';
      setTimeout(() => (btn.textContent = 'Show'), 2200);
    }),
  );

  app.querySelectorAll<HTMLButtonElement>('[data-format]').forEach((btn) =>
    btn.addEventListener('click', () => {
      state.format = btn.dataset.format as Format;
      try {
        localStorage.setItem('format', state.format);
      } catch {
        /* fine */
      }
      app.querySelectorAll('[data-format]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      const code = document.getElementById('code');
      if (code && state.snap) code.textContent = exportText(state.snap, state.tiers);
    }),
  );

  document.getElementById('copy')?.addEventListener('click', async () => {
    if (!state.snap) return;
    await navigator.clipboard.writeText(exportText(state.snap, state.tiers));
    stamp('Copied');
  });
  document.getElementById('save')?.addEventListener('click', async () => {
    if (!state.snap) return;
    await savePrint(state.snap.host, today(), state.tiers, printTiers());
    stamp('Saved');
  });
  document.getElementById('from-load')?.addEventListener('click', recordFromLoad);
}

function stamp(text: string) {
  const el = document.getElementById('stamp');
  if (!el) return;
  el.textContent = text;
  el.getAnimations().forEach((a) => a.cancel());
  el.animate([{ opacity: 0, transform: 'translateY(2px)' }, { opacity: 1, transform: 'none', offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], {
    duration: reduce.matches ? 1 : 1800,
    easing: 'cubic-bezier(.2, .7, .2, 1)',
    fill: 'forwards',
  });
  if (reduce.matches) el.style.opacity = '1';
}

async function recordFromLoad() {
  if (state.tabId == null || !state.snap) return;
  const origin = new URL(state.snap.url).origin;
  const ok = await chrome.permissions.request({ origins: [`${origin}/*`] });
  if (!ok) return;
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['easeprint-load'] });
  } catch {
    /* none yet */
  }
  await chrome.scripting.registerContentScripts([
    { id: 'easeprint-load', matches: [`${origin}/*`], js: ['probe.js'], runAt: 'document_start', world: 'MAIN', allFrames: false, persistAcrossSessions: false },
  ]);
  await chrome.storage.session.set({ [`fromLoad:${state.tabId}`]: true });
  reset(state.tabId);
  await chrome.tabs.reload(state.tabId);
}

/* ---------- Start ---------- */

void (async () => {
  if (state.tabId == null) state.tabId = await currentTab();
  render();
  void poll();
  setInterval(poll, 700);
  if (!params.has('tab')) {
    chrome.tabs.onActivated.addListener(({ tabId }) => reset(tabId));
  }
  chrome.tabs.onUpdated.addListener((tabId, info) => {
    if (tabId === state.tabId && info.status === 'loading' && info.url) reset(tabId);
  });
})();

export { plot };
