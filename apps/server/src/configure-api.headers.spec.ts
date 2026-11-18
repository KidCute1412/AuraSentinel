import { describe, expect, it } from 'vitest';
import { ADMIN_UI_CSP, SECURITY_HEADERS, securityHeaders } from './configure-api';

const csp = (path: string) => securityHeaders(path)['Content-Security-Policy'];

describe('securityHeaders', () => {
  it('keeps the JSON-only policy on every API path, admin JSON included', () => {
    for (const path of ['/api/v1/vaults/0x1/state', '/api/v1/admin/rebalancer', '/api/health', '/admin/queuesx', '/api/v1/admin/queues-evil']) {
      expect(csp(path)).toBe(SECURITY_HEADERS['Content-Security-Policy']);
    }
  });

  it('lets the Bull Board page load its own scripts and styles, and still never be framed', () => {
    for (const path of ['/admin/queues', '/api/v1/admin/queues', '/api/v1/admin/queues/static/js/main.js', '/api/v1/admin/queues/api/queues']) {
      expect(csp(path)).toBe(ADMIN_UI_CSP);
    }
    expect(ADMIN_UI_CSP).toContain("script-src 'self'");
    expect(ADMIN_UI_CSP).toContain("frame-ancestors 'none'");
    expect(ADMIN_UI_CSP).not.toMatch(/script-src[^;]*'unsafe-(inline|eval)'/);
    expect(securityHeaders('/api/v1/admin/queues')['X-Frame-Options']).toBe('DENY');
  });
});
