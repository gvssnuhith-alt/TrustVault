import { NextRequest } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export interface AuthContext {
  userId: string;
  email: string;
  role: 'admin' | 'owner' | 'viewer';
  isSuspended: boolean;
}

export async function verifyServerAuth(req: NextRequest): Promise<AuthContext | null> {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.replace('Bearer ', '').trim();
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return null;
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    const role = (profile?.role || user.user_metadata?.role || 'viewer') as 'admin' | 'owner' | 'viewer';

    if (profile?.is_suspended) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email || profile?.email || '',
      role,
      isSuspended: profile?.is_suspended || false,
    };
  } catch {
    return null;
  }
}
