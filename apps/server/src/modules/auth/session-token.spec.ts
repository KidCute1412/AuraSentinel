import { describe, expect, it } from 'vitest';
import { clearedSessionCookie, readCookie, sessionCookie, signSession, verifySession } from './session-token';

const SECRET = 'x'.repeat(32);
const ADDR = '0xAbC0000000000000000000000000000000000001';

describe('session token', () => {
  it('round-trips a lowercase address until it expires', () => {
    const t = signSession(ADDR, 60, SECRET, 1_000);
    expect(verifySession(t, SECRET, 1_030)).toEqual({ sub: ADDR.toLowerCase(), iat: 1_000, exp: 1_060 });
    expect(verifySession(t, SECRET, 1_060)).toBeNull();
  });

  it('rejects another secret, a tampered payload and garbage', () => {
    const t = signSession(ADDR, 60, SECRET, 1_000);
    expect(verifySession(t, 'y'.repeat(32), 1_001)).toBeNull();
    const [h, , s] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: '0x' + '9'.repeat(40), iat: 1_000, exp: 9_999_999_999 })).toString('base64url');
    expect(verifySession(`${h}.${forged}.${s}`, SECRET, 1_001)).toBeNull();
    expect(verifySession('not.a.jwt', SECRET)).toBeNull();
    expect(verifySession('', SECRET)).toBeNull();
  });

  it('rejects alg confusion (a header other than HS256)', () => {
    const t = signSession(ADDR, 60, SECRET, 1_000);
    const none = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    expect(verifySession(`${none}.${t.split('.')[1]}.`, SECRET, 1_001)).toBeNull();
  });
});

describe('cookies', () => {
  it('reads one cookie among several', () => {
    expect(readCookie('a=1; session=abc%2Edef; b=2', 'session')).toBe('abc.def');
    expect(readCookie('a=1', 'session')).toBeUndefined();
    expect(readCookie(undefined, 'session')).toBeUndefined();
  });

  it('is httpOnly + SameSite=Lax, Secure only over https', () => {
    expect(sessionCookie('t', 60, false)).toBe('session=t; Path=/; HttpOnly; SameSite=Lax; Max-Age=60');
    expect(sessionCookie('t', 60, true)).toMatch(/; Secure$/);
    expect(clearedSessionCookie(false)).toContain('Max-Age=0');
  });
});
