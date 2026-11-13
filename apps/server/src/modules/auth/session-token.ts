import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Minimal HS256 JWT for the session cookie (A9), with node:crypto instead of a dependency.
 * The token only proves which address signed in (api.md §3); roles are re-read from the chain
 * and the allowlist on every request, never trusted from the token.
 */
export interface SessionClaims {
  /** Lowercase address that signed the SIWE message. */
  sub: string;
  iat: number;
  exp: number;
}

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');
const HEADER = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

const sign = (data: string, secret: string) => createHmac('sha256', secret).update(data).digest();

export function signSession(address: string, ttlS: number, secret: string, nowS = Math.floor(Date.now() / 1000)): string {
  const claims: SessionClaims = { sub: address.toLowerCase(), iat: nowS, exp: nowS + ttlS };
  const body = `${HEADER}.${b64url(JSON.stringify(claims))}`;
  return `${body}.${b64url(sign(body, secret))}`;
}

/** The claims of a valid, unexpired token; null for anything else (never throws). */
export function verifySession(token: string, secret: string, nowS = Math.floor(Date.now() / 1000)): SessionClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== HEADER) return null;
  const expected = sign(`${parts[0]}.${parts[1]}`, secret);
  const given = Buffer.from(parts[2]!, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const c = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as Partial<SessionClaims>;
    if (typeof c.sub !== 'string' || !/^0x[0-9a-f]{40}$/.test(c.sub)) return null;
    if (typeof c.exp !== 'number' || c.exp <= nowS) return null;
    return { sub: c.sub, iat: Number(c.iat ?? 0), exp: c.exp };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = 'session';

/** Reads one cookie from a raw Cookie header (no cookie-parser dependency). */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/**
 * Set-Cookie value: httpOnly (JS cannot read it), SameSite=Lax (a cross-site POST carries no
 * session, so no CSRF on the write endpoints), Secure only over https (local demo is plain http).
 */
export function sessionCookie(token: string, maxAgeS: number, secure: boolean): string {
  return [`${SESSION_COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeS}`, ...(secure ? ['Secure'] : [])].join('; ');
}

export const clearedSessionCookie = (secure: boolean) => sessionCookie('', 0, secure);
