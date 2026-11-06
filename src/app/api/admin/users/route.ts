import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyServerAuth } from '@/lib/auth-guard';
import { logSecurityEvent } from '@/lib/audit';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const { data: users, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ users: users || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    const { targetUserId, role, isSuspended } = await req.json();

    if (!targetUserId) {
      return NextResponse.json({ error: 'targetUserId required' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (role && ['admin', 'owner', 'viewer'].includes(role)) {
      updates.role = role;
    }
    if (typeof isSuspended === 'boolean') {
      updates.is_suspended = isSuspended;
    }

    const { data: updated, error } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', targetUserId)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await logSecurityEvent({
      actorId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: 'ADMIN_ACTION',
      outcome: 'success',
      details: { updatedUser: targetUserId, changes: updates },
    });

    return NextResponse.json({ success: true, user: updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
