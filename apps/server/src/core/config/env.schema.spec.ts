import { FUJI_DEPLOYMENT, FUJI_FACTORY_BLOCK, FUJI_PUBLIC_RPC_URLS } from '@agentshield/shared';
import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.schema';

const KEY = `0x${'1'.repeat(64)}`;

describe('parseEnv defaults', () => {
  it('dev needs nothing but the agent key: Fuji addresses, public RPCs and the local compose ports are filled in', () => {
    const env = parseEnv({ AGENT_PRIVATE_KEY: KEY });
    expect(env.NODE_ENV).toBe('development');
    expect(env.SAFE_ADDRESS).toBe(FUJI_DEPLOYMENT.publicSafe);
    expect(env.POLICY_MODULE_ADDRESS).toBe(FUJI_DEPLOYMENT.publicModule);
    expect(env.TOKEN_A_ADDRESS).toBe(FUJI_DEPLOYMENT.usdc);
    expect(env.TOKEN_B_ADDRESS).toBe(FUJI_DEPLOYMENT.wavax);
    expect(env.FACTORY_ADDRESS).toBe(FUJI_DEPLOYMENT.factory);
    expect(env.INDEXER_START_BLOCK).toBe(BigInt(FUJI_FACTORY_BLOCK));
    expect(env.FUJI_RPC_URLS).toEqual([...FUJI_PUBLIC_RPC_URLS]);
    expect(env.DATABASE_URL).toBe('postgres://agentshield:agentshield@localhost:55432/agentshield');
    expect(env.REDIS_URL).toBe('redis://localhost:56379');
    expect(env.SIWE_DOMAINS).toEqual(['localhost:5173']);
  });

  it('a value in the env always wins, and an empty one (KEY=) still falls back', () => {
    const env = parseEnv({ SAFE_ADDRESS: FUJI_DEPLOYMENT.stageSafe, FUJI_RPC_URLS: 'https://rpc.example', FACTORY_ADDRESS: '' });
    expect(env.SAFE_ADDRESS).toBe(FUJI_DEPLOYMENT.stageSafe);
    expect(env.FUJI_RPC_URLS).toEqual(['https://rpc.example']);
    expect(env.FACTORY_ADDRESS).toBe(FUJI_DEPLOYMENT.factory);
  });

  it('production keeps the Fuji defaults but never guesses the database or Redis', () => {
    expect(() => parseEnv({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32) })).toThrow(/DATABASE_URL[\s\S]*REDIS_URL/);
    const env = parseEnv({ NODE_ENV: 'production', SESSION_SECRET: 'x'.repeat(32), DATABASE_URL: 'postgres://u:p@postgres:5432/db', REDIS_URL: 'redis://redis:6379' });
    expect(env.SAFE_ADDRESS).toBe(FUJI_DEPLOYMENT.publicSafe);
    expect(env.SIWE_DOMAINS).toEqual([]); // the request Host, unless the deployment names its domain
  });

  it('tests get no defaults, so a missing address can never reach the real Fuji contracts', () => {
    expect(() => parseEnv({ NODE_ENV: 'test' })).toThrow(/DATABASE_URL/);
    const env = parseEnv({ NODE_ENV: 'test', DATABASE_URL: 'postgres://u:p@h:1/d', REDIS_URL: 'redis://h:1', FUJI_RPC_URLS: 'http://127.0.0.1:1' });
    expect(env.SAFE_ADDRESS).toBeUndefined();
    expect(env.FACTORY_ADDRESS).toBeUndefined();
  });
});
