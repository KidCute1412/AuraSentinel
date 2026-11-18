import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FUJI_DEPLOYMENT } from '../src';

describe('FUJI_DEPLOYMENT', () => {
  it('matches packages/contracts/deployments/fuji.json exactly (redeploy -> update both)', () => {
    const file = JSON.parse(readFileSync(fileURLToPath(new URL('../../contracts/deployments/fuji.json', import.meta.url)), 'utf8')) as Record<string, unknown>;
    expect(FUJI_DEPLOYMENT).toEqual(file);
  });
});
