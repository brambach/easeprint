/**
 * The strings the copy buttons put on the clipboard. Timing function and duration are copied exactly as the
 * browser computed them on the site, so a paste reproduces the measured timing.
 */
export interface CopyTier {
  kind: 'transition' | 'animation' | 'waapi';
  role: string;
  property: string;
  timingFunction: string;
  duration: string;
}

export function transitionValue(t: CopyTier): string {
  if (t.kind === 'animation') return `animation-duration: ${t.duration};\nanimation-timing-function: ${t.timingFunction};`;
  return `transition: ${t.property} ${t.duration} ${t.timingFunction};`;
}

export function customProperties(t: CopyTier): string {
  return `--ease-${t.role}: ${t.timingFunction};\n--duration-${t.role}: ${t.duration};`;
}
