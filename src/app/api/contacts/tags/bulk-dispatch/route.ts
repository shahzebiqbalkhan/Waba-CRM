import { after, NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { runAutomationsForTrigger } from '@/lib/automations/engine';
import type { TagTriggerConfig } from '@/types';

interface BulkDispatchItem {
  contactId: string;
  tagId: string;
}

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (error) {
    return toErrorResponse(error);
  }

  const body = (await request.json().catch(() => null)) as {
    items?: unknown;
  } | null;

  if (!body || !Array.isArray(body.items)) {
    return NextResponse.json(
      { error: 'items must be an array of { contactId, tagId }' },
      { status: 400 }
    );
  }

  if (body.items.length === 0) {
    return NextResponse.json({ ok: true, matched: 0, dispatched: 0 });
  }

  // Cap at 5000 items to prevent resource exhaustion
  const rawItems = body.items.slice(0, 5000);
  const items: BulkDispatchItem[] = [];
  for (const item of rawItems) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as BulkDispatchItem).contactId === 'string' &&
      typeof (item as BulkDispatchItem).tagId === 'string' &&
      (item as BulkDispatchItem).contactId.trim() &&
      (item as BulkDispatchItem).tagId.trim()
    ) {
      items.push({
        contactId: (item as BulkDispatchItem).contactId.trim(),
        tagId: (item as BulkDispatchItem).tagId.trim(),
      });
    }
  }

  if (items.length === 0) {
    return NextResponse.json({ ok: true, matched: 0, dispatched: 0 });
  }

  // Find all active tag_added automations for this account
  const { data: automations, error: autoErr } = await ctx.supabase
    .from('automations')
    .select('id, trigger_config')
    .eq('account_id', ctx.accountId)
    .eq('trigger_type', 'tag_added')
    .eq('is_active', true);

  if (autoErr) {
    console.error('[bulk-dispatch] failed to fetch automations:', autoErr);
    return NextResponse.json({ error: autoErr.message }, { status: 500 });
  }

  if (!automations || automations.length === 0) {
    return NextResponse.json({ ok: true, matched: 0, dispatched: 0 });
  }

  const listeningTagIds = new Set<string>();
  for (const a of automations) {
    const cfg = a.trigger_config as TagTriggerConfig | null;
    if (cfg?.tag_id) {
      listeningTagIds.add(cfg.tag_id);
    }
  }

  // Filter only items whose tagId actually has an active automation listening
  const relevantItems = items.filter((it) => listeningTagIds.has(it.tagId));

  if (relevantItems.length === 0) {
    return NextResponse.json({ ok: true, matched: 0, dispatched: 0 });
  }

  // Deduplicate contactId:tagId
  const seen = new Set<string>();
  const deduplicatedItems: BulkDispatchItem[] = [];
  for (const it of relevantItems) {
    const key = `${it.contactId}:${it.tagId}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduplicatedItems.push(it);
    }
  }

  const accountId = ctx.accountId;
  after(async () => {
    for (const item of deduplicatedItems) {
      try {
        await runAutomationsForTrigger({
          accountId,
          triggerType: 'tag_added',
          contactId: item.contactId,
          context: {
            tag_id: item.tagId,
          },
        });
      } catch (err) {
        console.error(
          '[bulk-dispatch] automation run failed for contact:',
          item.contactId,
          err
        );
      }
    }
  });

  return NextResponse.json({
    ok: true,
    matched: deduplicatedItems.length,
    dispatched: deduplicatedItems.length,
  });
}
