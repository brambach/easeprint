import { describe, expect, it } from 'vitest';
import { customProperties, transitionValue } from '../../src/lib/copy';

describe('copy strings', () => {
  const tier = { kind: 'transition' as const, role: 'statement', property: 'transform', timingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)', duration: '1.2s' };
  it('writes the transition exactly as measured', () => {
    expect(transitionValue(tier)).toBe('transition: transform 1.2s cubic-bezier(0.16, 1, 0.3, 1);');
  });
  it('writes custom properties named by role', () => {
    expect(customProperties(tier)).toBe('--ease-statement: cubic-bezier(0.16, 1, 0.3, 1);\n--duration-statement: 1.2s;');
  });
  it('writes animation timing for keyframe animations', () => {
    expect(transitionValue({ ...tier, kind: 'animation', property: 'fade-in-up', timingFunction: 'ease', duration: '1s' })).toBe(
      'animation-duration: 1s;\nanimation-timing-function: ease;',
    );
  });
});
