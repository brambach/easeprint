import { formatBezier, parseEasing, sampleEasing } from '../easing';
import { durationLabel, type Tier } from './tiers';

/**
 * A site's tiers as code you can paste. Every format carries the exact timing strings the browser computed, except
 * where a format can't express them; those lines say so in a comment instead of quietly changing the curve.
 */
export type Format = 'css' | 'tailwind' | 'tailwind3' | 'motion' | 'swiftui';

export const FORMATS: readonly { id: Format; label: string }[] = [
  { id: 'css', label: 'CSS' },
  { id: 'tailwind', label: 'Tailwind 4' },
  { id: 'tailwind3', label: 'Tailwind 3' },
  { id: 'motion', label: 'Motion' },
  { id: 'swiftui', label: 'SwiftUI' },
];

export interface ExportInput {
  site: string;
  date: string;
  tiers: Pick<Tier, 'name' | 'timingFunction' | 'durationMs' | 'fitted'>[];
}

const camel = (s: string) => s.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
const num = (n: number) => String(Number(n.toFixed(4)));

function header(i: ExportInput, comment: (s: string) => string): string {
  return comment(`${i.site} motion, measured by easeprint on ${i.date}`);
}

function fittedNote(t: ExportInput['tiers'][number]): string {
  return t.fitted ? ' (fitted from JS motion)' : '';
}

export function exportTiers(i: ExportInput, format: Format): string {
  switch (format) {
    case 'css':
      return [
        header(i, (s) => `/* ${s} */`),
        ':root {',
        ...i.tiers.flatMap((t) => [
          `  --ease-${t.name}: ${t.timingFunction};${t.fitted ? ' /* fitted from JS motion */' : ''}`,
          `  --duration-${t.name}: ${durationLabel(t.durationMs)};`,
        ]),
        '}',
        '',
      ].join('\n');
    case 'tailwind':
      return [
        header(i, (s) => `/* ${s} */`),
        '@theme {',
        ...i.tiers.map((t) => `  --ease-${t.name}: ${t.timingFunction};${t.fitted ? ' /* fitted from JS motion */' : ''}`),
        '}',
        '',
        `/* Durations: ${i.tiers.map((t) => `${t.name} duration-${Math.round(t.durationMs)}`).join(', ')} */`,
        '',
      ].join('\n');
    case 'tailwind3':
      return [
        header(i, (s) => `// ${s}`),
        'module.exports = {',
        '  theme: {',
        '    extend: {',
        '      transitionTimingFunction: {',
        ...i.tiers.map((t) => `        '${t.name}': '${t.timingFunction}',${fittedNote(t) ? ` //${fittedNote(t)}` : ''}`),
        '      },',
        '      transitionDuration: {',
        ...i.tiers.map((t) => `        '${t.name}': '${Math.round(t.durationMs)}ms',`),
        '      },',
        '    },',
        '  },',
        '};',
        '',
      ].join('\n');
    case 'motion':
      return [header(i, (s) => `// ${s}`), ...motionLines(i), ''].join('\n');
    case 'swiftui':
      return [header(i, (s) => `// ${s}`), 'import SwiftUI', '', 'extension Animation {', ...swiftLines(i), '}', ''].join('\n');
  }
}

function motionLines(i: ExportInput): string[] {
  const out: string[] = [];
  let needsLinear = false;
  for (const t of i.tiers) {
    const e = parseEasing(t.timingFunction);
    const name = camel(t.name);
    const seconds = num(t.durationMs / 1000);
    if (e.kind === 'cubic') {
      out.push(`export const ${name} = { duration: ${seconds}, ease: [${e.bezier.map(num).join(', ')}] };${fittedNote(t) ? ` //${fittedNote(t)}` : ''}`);
    } else if (e.kind === 'linear-fn') {
      needsLinear = true;
      out.push(`export const ${name} = { duration: ${seconds}, ease: linear([${e.stops.map((s) => `[${num(s.at)}, ${num(s.value)}]`).join(', ')}]) };`);
    } else {
      out.push(`// ${name}: ${t.timingFunction} has no Motion equivalent; use it in CSS.`);
    }
  }
  if (needsLinear) {
    out.unshift(
      '// CSS linear() stops as an easing function: [at, value] pairs, straight lines between.',
      'const linear = (stops) => (t) => {',
      '  for (let i = 1; i < stops.length; i++) {',
      '    const [a, va] = stops[i - 1], [b, vb] = stops[i];',
      '    if (t <= b) return b === a ? vb : va + ((vb - va) * (t - a)) / (b - a);',
      '  }',
      '  return stops[stops.length - 1][1];',
      '};',
      '',
    );
  }
  return out;
}

function swiftLines(i: ExportInput): string[] {
  return i.tiers.map((t) => {
    const e = parseEasing(t.timingFunction);
    const name = camel(t.name);
    const seconds = num(t.durationMs / 1000);
    if (e.kind === 'cubic') {
      const [x1, y1, x2, y2] = e.bezier.map(num);
      return `  static let ${name} = Animation.timingCurve(${x1}, ${y1}, ${x2}, ${y2}, duration: ${seconds})${fittedNote(t) ? ` //${fittedNote(t)}` : ''}`;
    }
    if (e.kind === 'linear-fn') {
      const peak = Math.max(...sampleEasing(e, 200).map(([, y]) => y));
      const bounce = num(Math.min(0.9, Math.max(0, (peak - 1) * 2)));
      return `  // ${name}: a linear() spring in CSS. Approximated from its ${Math.round((peak - 1) * 100)}% overshoot.\n  static let ${name} = Animation.spring(duration: ${seconds}, bounce: ${bounce})`;
    }
    return `  // ${name}: ${t.timingFunction} has no SwiftUI equivalent.`;
  });
}

/** A single value for one tier, the way a copy button puts it on the clipboard. */
export function tierValue(t: Pick<Tier, 'timingFunction' | 'durationMs'>, property = 'transform'): string {
  return `transition: ${property} ${durationLabel(t.durationMs)} ${t.timingFunction};`;
}

export { formatBezier };
