import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { logSecurityEvent } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const { email, password, full_name, role = 'viewer' } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    // 1. Create auth user in Supabase GoTrue Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, role },
    });

    if (authError || !authData.user) {
      await logSecurityEvent({
        actorEmail: email,
        action: 'LOGIN_FAILURE',
        outcome: 'denied',
        details: { reason: 'User registration failed', error: authError?.message },
      });
      return NextResponse.json({ error: authError?.message || 'Failed to create user' }, { status: 400 });
    }

    const userId = authData.user.id;

    // 2. Insert into profiles table
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: userId,
      email,
      full_name: full_name || email.split('@')[0],
      role: ['admin', 'owner', 'viewer'].includes(role) ? role : 'viewer',
    });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    await logSecurityEvent({
      actorId: userId,
      actorEmail: email,
      actorRole: role,
      action: 'LOGIN_SUCCESS',
      outcome: 'success',
      details: { message: 'New user registered and provisioned' },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: userId,
        email,
        full_name,
        role,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
