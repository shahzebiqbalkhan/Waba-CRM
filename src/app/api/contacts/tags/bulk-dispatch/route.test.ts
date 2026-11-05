import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  runAutomationsForTrigger: vi.fn(),
  automations: [] as Array<Record<string, unknown>>,
  automationsError: null as { message: string } | null,
}));

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: (callback: () => unknown) => {
    mocks.afterCallbacks.push(callback);
  },
}));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() =>
    Response.json({ error: 'auth failed' }, { status: 403 })
  ),
}));

vi.mock('@/lib/automations/engine', () => ({
  runAutomationsForTrigger: mocks.runAutomationsForTrigger,
}));

import { POST } from './route';

const fakeDb = {
  from: (table: string) => {
    if (table === 'automations') {
      const query = {
        select: () => query,
        eq: () => query,
        then: (resolve: (v: unknown) => unknown) =>
          resolve({
            data: mocks.automations,
            error: mocks.automationsError,
          }),
      };
      return query;
    }
    return {
      select: () => ({ eq: () => ({ then: (r: (v: unknown) => unknown) => r({ data: [], error: null }) }) }),
    };
  },
};

const context = {
  supabase: fakeDb,
  accountId: 'account-1',
  userId: 'user-1',
  role: 'agent',
};

function createRequest(body: unknown) {
  return new Request('http://localhost/api/contacts/tags/bulk-dispatch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  mocks.requireRole.mockReset();
  mocks.afterCallbacks = [];
  mocks.runAutomationsForTrigger.mockReset();
  mocks.automations = [];
  mocks.automationsError = null;
  mocks.requireRole.mockResolvedValue(context);
});

describe('POST /api/contacts/tags/bulk-dispatch', () => {
  it('rejects requests without agent role', async () => {
    mocks.requireRole.mockRejectedValueOnce(new Error('unauthorized'));
    const response = await POST(createRequest({ items: [] }));
    expect(response.status).toBe(403);
  });

  it('rejects invalid payload body', async () => {
    const response = await POST(createRequest({ items: 'not-an-array' }));
    expect(response.status).toBe(400);
  });

  it('handles empty items without errors', async () => {
    const response = await POST(createRequest({ items: [] }));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ ok: true, matched: 0, dispatched: 0 });
    expect(mocks.afterCallbacks).toHaveLength(0);
  });

  it('does nothing when no active tag_added automations exist', async () => {
    mocks.automations = [];
    const response = await POST(
      createRequest({
        items: [{ contactId: 'c-1', tagId: 'tag-1' }],
      })
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ ok: true, matched: 0, dispatched: 0 });
    expect(mocks.afterCallbacks).toHaveLength(0);
  });

  it('does nothing when active automations listen to other tags', async () => {
    mocks.automations = [
      { id: 'auto-1', trigger_config: { tag_id: 'tag-other' } },
    ];
    const response = await POST(
      createRequest({
        items: [{ contactId: 'c-1', tagId: 'tag-1' }],
      })
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ ok: true, matched: 0, dispatched: 0 });
    expect(mocks.afterCallbacks).toHaveLength(0);
  });

  it('matches listening tags, registers after() callback, and runs triggers', async () => {
    mocks.automations = [
      { id: 'auto-1', trigger_config: { tag_id: 'tag-1' } },
    ];
    const response = await POST(
      createRequest({
        items: [
          { contactId: 'c-1', tagId: 'tag-1' },
          { contactId: 'c-2', tagId: 'tag-2' }, // should be ignored
          { contactId: 'c-3', tagId: 'tag-1' },
          { contactId: 'c-1', tagId: 'tag-1' }, // duplicate, should be deduplicated
        ],
      })
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ ok: true, matched: 2, dispatched: 2 });
    expect(mocks.afterCallbacks).toHaveLength(1);

    // Drain the after() callback
    await mocks.afterCallbacks[0]();

    expect(mocks.runAutomationsForTrigger).toHaveBeenCalledTimes(2);
    expect(mocks.runAutomationsForTrigger).toHaveBeenCalledWith({
      accountId: 'account-1',
      triggerType: 'tag_added',
      contactId: 'c-1',
      context: { tag_id: 'tag-1' },
    });
    expect(mocks.runAutomationsForTrigger).toHaveBeenCalledWith({
      accountId: 'account-1',
      triggerType: 'tag_added',
      contactId: 'c-3',
      context: { tag_id: 'tag-1' },
    });
  });
});
