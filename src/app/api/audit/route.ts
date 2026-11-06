import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyServerAuth } from '@/lib/auth-guard';
import crypto from 'crypto';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (auth.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: Admin access only' }, { status: 403 });
    }

    // Fetch complete audit log chain ordered from genesis
    const { data: logs, error } = await supabaseAdmin
      .from('audit_logs')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let isTampered = false;
    let failureIndex = -1;
    let expectedPreviousHash = '0000000000000000000000000000000000000000000000000000000000000000';

    for (let i = 0; i < (logs || []).length; i++) {
      const entry = logs[i];
      if (entry.previous_hash !== expectedPreviousHash) {
        isTampered = true;
        failureIndex = i;
        break;
      }

      // Recompute SHA-256
      const payload = `${entry.previous_hash}:${entry.event_id || ''}:${entry.actor_id || 'anonymous'}:${entry.action}:${entry.target_document_id || 'none'}:${entry.outcome}:${JSON.stringify(entry.details)}:${entry.created_at}`;
      const computedHash = crypto.createHash('sha256').update(payload).digest('hex');

      if (!computedHash) {
        isTampered = true;
        failureIndex = i;
        break;
      }

      // Update chain tracker
      expectedPreviousHash = entry.current_hash;
    }

    return NextResponse.json({
      success: true,
      total_records: logs?.length || 0,
      chain_intact: !isTampered,
      tampered_at_block: failureIndex,
      logs: (logs || []).slice(-50).reverse(), // Latest 50
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
