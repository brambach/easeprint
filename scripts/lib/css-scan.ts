/**
 * Counts in stylesheet and script text the page downloaded. Nothing here stores the source itself, only counts,
 * names and short matched declarations, so raw files never carry a site's code.
 */
export interface CssScan {
  files: number;
  bytes: number;
  reducedMotionQueries: number;
  transitionAll: { file: string; match: string }[];
  transitionAllCount: number;
  keyframes: string[];
  cubicBeziers: Record<string, number>;
}

export interface ScriptScan {
  files: number;
  bytes: number;
  reducedMotionMentions: number;
  libraries: Record<string, boolean>;
}

export function emptyCssScan(): CssScan {
  return { files: 0, bytes: 0, reducedMotionQueries: 0, transitionAll: [], transitionAllCount: 0, keyframes: [], cubicBeziers: {} };
}

export function emptyScriptScan(): ScriptScan {
  return { files: 0, bytes: 0, reducedMotionMentions: 0, libraries: {} };
}

const TRANSITION_ALL = /transition(?:-property)?\s*:\s*([^;}]*?(?:^|[\s,:])all(?:[\s,;}]|$)[^;}]*)/gi;

export function scanCss(scan: CssScan, file: string, text: string): void {
  scan.files++;
  scan.bytes += text.length;
  scan.reducedMotionQueries += (text.match(/prefers-reduced-motion/gi) ?? []).length;
  for (const m of text.matchAll(TRANSITION_ALL)) {
    scan.transitionAllCount++;
    if (scan.transitionAll.length < 40) scan.transitionAll.push({ file, match: m[0].slice(0, 120) });
  }
  const names = new Set(scan.keyframes);
  for (const m of text.matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)/g)) names.add(m[1]!);
  scan.keyframes = [...names].slice(0, 200);
  for (const m of text.matchAll(/cubic-bezier\(\s*([^)]+)\)/gi)) {
    const key = `cubic-bezier(${m[1]!.split(',').map((n) => String(Number(n.trim()))).join(', ')})`;
    scan.cubicBeziers[key] = (scan.cubicBeziers[key] ?? 0) + 1;
  }
}

const LIBRARIES: Record<string, RegExp> = {
  gsap: /\bgsap\b|GreenSock/,
  scrollTrigger: /ScrollTrigger/,
  lenis: /\blenis\b/i,
  locomotiveScroll: /locomotive-scroll|LocomotiveScroll/,
  framerMotion: /framer-motion|motion-dom|useReducedMotion|MotionConfig/,
  three: /\bTHREE\b|three\.module|WebGLRenderer/,
  pixi: /\bPIXI\b|pixi\.js/,
  ogl: /\bogl\b.*Renderer|new Renderer\(\{/,
  barba: /@barba|barba\.init/,
  swup: /\bswup\b/i,
  lottie: /lottie|bodymovin/i,
  rive: /@rive-app|rive\.wasm/,
  springPhysics: /stiffness|damping/,
};

export function scanScript(scan: ScriptScan, text: string): void {
  scan.files++;
  scan.bytes += text.length;
  scan.reducedMotionMentions += (text.match(/prefers-reduced-motion/gi) ?? []).length;
  for (const [name, re] of Object.entries(LIBRARIES)) {
    if (re.test(text)) scan.libraries[name] = true;
  }
}
