import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';
import { CLIENT_IP_HEADER, PROXY_SECRET_HEADER, trustWebProxy } from './configure-api';

const SECRET = 'a'.repeat(40);
const run = (secret: string | undefined, headers: Record<string, string>) => {
  const req = { ip: '76.76.21.21', headers: { ...headers } } as unknown as Request;
  let called = false;
  trustWebProxy(secret)(req, {} as Response, (() => (called = true)) as NextFunction);
  return { req, called };
};

describe('trustWebProxy: the visitor IP from the web proxy', () => {
  it('with the right secret, req.ip is the visitor and the hop counts as HTTPS', () => {
    const { req, called } = run(SECRET, { [PROXY_SECRET_HEADER]: SECRET, [CLIENT_IP_HEADER]: '203.0.113.7' });
    expect(called).toBe(true);
    expect(req.ip).toBe('203.0.113.7');
    expect(req.headers['x-forwarded-proto']).toBe('https');
    expect(req.headers[PROXY_SECRET_HEADER]).toBeUndefined(); // never reaches the rest of the app
  });

  it('a wrong secret, or none configured, changes nothing: nobody can claim an IP by calling the server', () => {
    for (const s of [SECRET, undefined]) {
      const { req } = run(s, { [PROXY_SECRET_HEADER]: 'b'.repeat(40), [CLIENT_IP_HEADER]: '1.2.3.4' });
      expect(req.ip).toBe('76.76.21.21');
      expect(req.headers[CLIENT_IP_HEADER]).toBeUndefined();
    }
  });
});
