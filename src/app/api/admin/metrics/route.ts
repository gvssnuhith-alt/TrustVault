import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyServerAuth } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth || auth.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
    }

    // 1. Total members count
    const { count: totalMembers } = await supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    // 2. Total documents count
    const { count: totalDocuments } = await supabaseAdmin
      .from('documents')
      .select('*', { count: 'exact', head: true });

    // 3. Storage bytes used
    const { data: docs } = await supabaseAdmin
      .from('documents')
      .select('file_size');
    const totalStorageBytes = (docs || []).reduce((acc, d) => acc + (d.file_size || 0), 0);

    // 4. Access attempts metrics
    const { count: successAttempts } = await supabaseAdmin
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('outcome', 'success');

    const { count: deniedAttempts } = await supabaseAdmin
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('outcome', 'denied');

    // 5. Recent security events
    const { data: recentLogs } = await supabaseAdmin
      .from('audit_logs')
      .select('*')
      .order('id', { ascending: false })
      .limit(10);

    return NextResponse.json({
      metrics: {
        total_members: totalMembers || 0,
        total_documents: totalDocuments || 0,
        storage_bytes_used: totalStorageBytes,
        successful_accesses: successAttempts || 0,
        denied_accesses: deniedAttempts || 0,
      },
      recent_security_events: recentLogs || [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
