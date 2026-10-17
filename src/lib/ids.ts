let n = 0;

/** A build-unique id for SVG defs, so two plots on one page never share a clipPath. */
export const nextId = (prefix: string) => `${prefix}-${++n}`;
