import { resolve } from 'node:path';
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';

/** The house rules are lint rules: no `transition: all`, and transitions only on transform and opacity. */
const configFile = resolve(__dirname, '../../.stylelintrc.json');
const lint = async (code: string) => (await stylelint.lint({ code, configFile })).results[0]!.warnings.map((w) => w.rule);

describe('stylelint', () => {
  it('fails on transition: all', async () => {
    expect(await lint('a { transition: all 0.2s ease; }\n')).toContain('declaration-property-value-disallowed-list');
  });

  it('fails on transition-property: all and on a list that includes all', async () => {
    expect(await lint('a { transition-property: all; }\n')).toContain('declaration-property-value-disallowed-list');
    expect(await lint('a { transition: opacity 0.2s ease, all 0.3s ease; }\n')).toContain('declaration-property-value-disallowed-list');
  });

  it('fails on transitioning anything but transform and opacity', async () => {
    expect(await lint('a { transition: color 0.2s ease; }\n')).toContain('declaration-property-value-allowed-list');
  });

  it('passes transform and opacity transitions', async () => {
    expect(await lint('a { transition: transform 0.2s ease-out, opacity 0.14s ease-in; }\n')).toEqual([]);
  });

  it('passes the site stylesheets', async () => {
    const result = await stylelint.lint({ files: resolve(__dirname, '../../src/**/*.css'), configFile });
    expect(result.errored).toBe(false);
  });
});
