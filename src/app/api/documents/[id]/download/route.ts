import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyServerAuth } from '@/lib/auth-guard';
import { logSecurityEvent } from '@/lib/audit';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: docId } = await params;
    const auth = await verifyServerAuth(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch document metadata
    const { data: doc, error: docError } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('id', docId)
      .eq('status', 'active')
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Server-side authorization check (Owner, Admin, or Active Permitted User)
    const isOwner = doc.owner_id === auth.userId;
    const isAdmin = auth.role === 'admin';

    let hasPermission = isOwner || isAdmin;
    if (!hasPermission) {
      const { data: perm } = await supabaseAdmin
        .from('document_permissions')
        .select('*')
        .eq('document_id', docId)
        .eq('user_id', auth.userId)
        .eq('is_active', true)
        .single();

      if (perm) {
        hasPermission = true;
      }
    }

    if (!hasPermission) {
      await logSecurityEvent({
        actorId: auth.userId,
        actorEmail: auth.email,
        actorRole: auth.role,
        action: 'ACCESS_DENIED',
        targetDocumentId: docId,
        outcome: 'denied',
        details: { reason: 'Unauthorized document read or download attempt blocked' },
      });
      return NextResponse.json({ error: 'Forbidden: Access denied' }, { status: 403 });
    }

    // Download from private bucket
    const { data: fileData, error: downloadError } = await supabaseAdmin.storage
      .from('vault-documents')
      .download(doc.storage_path);

    if (downloadError || !fileData) {
      return NextResponse.json({ error: 'Storage retrieval failed' }, { status: 500 });
    }

    await logSecurityEvent({
      actorId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: 'DOCUMENT_DOWNLOAD',
      targetDocumentId: docId,
      outcome: 'success',
      details: { filename: doc.original_filename },
    });

    const headers = new Headers();
    headers.set('Content-Type', doc.mime_type);
    headers.set('Content-Disposition', `attachment; filename="${doc.original_filename}"`);

    return new Response(fileData, { headers, status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
