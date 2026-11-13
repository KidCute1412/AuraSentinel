import { problem } from '@agentshield/shared';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProblemFilter } from './problem.filter';

function run(exception: unknown) {
  const res = { headersSent: false, status: vi.fn(), type: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.type.mockReturnValue(res);
  const host = { switchToHttp: () => ({ getResponse: () => res }) };
  new ProblemFilter().catch(exception, host as never);
  return { status: res.status.mock.calls[0]![0], type: res.type.mock.calls[0]![0], body: res.json.mock.calls[0]![0] };
}

describe('ProblemFilter', () => {
  it('passes a controller problem through as application/problem+json', () => {
    const out = run(new ConflictException(problem('QUEUE_BUSY', 'A swap is already running', '0xSafe')));
    expect(out).toMatchObject({ status: 409, type: 'application/problem+json' });
    expect(out.body).toMatchObject({ code: 'QUEUE_BUSY', status: 409, detail: '0xSafe' });
  });

  it('wraps a bare Nest exception (unknown route)', () => {
    const out = run(new NotFoundException('Cannot GET /api/v1/nope'));
    expect(out.status).toBe(404);
    expect(out.body).toMatchObject({ status: 404, code: 'VALIDATION_ERROR', title: 'Cannot GET /api/v1/nope' });
  });

  it('hides the message of an unexpected error behind a 500', () => {
    const out = run(new Error('db password is hunter2'));
    expect(out.status).toBe(500);
    expect(JSON.stringify(out.body)).not.toContain('hunter2');
  });
});
