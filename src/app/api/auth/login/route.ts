import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logSecurityEvent } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.user) {
      await logSecurityEvent({
        actorEmail: email,
        action: 'LOGIN_FAILURE',
        outcome: 'denied',
        details: { reason: 'Invalid credentials or non-existent user' },
      });
      return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
    }

    // Fetch user profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (profile?.is_suspended) {
      await logSecurityEvent({
        actorId: data.user.id,
        actorEmail: email,
        actorRole: profile.role,
        action: 'LOGIN_FAILURE',
        outcome: 'denied',
        details: { reason: 'Account suspended by administrator' },
      });
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
    }

    await logSecurityEvent({
      actorId: data.user.id,
      actorEmail: email,
      actorRole: profile?.role || 'viewer',
      action: 'LOGIN_SUCCESS',
      outcome: 'success',
      details: { role: profile?.role },
    });

    return NextResponse.json({
      success: true,
      token: data.session?.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: profile?.role || 'viewer',
        full_name: profile?.full_name,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
