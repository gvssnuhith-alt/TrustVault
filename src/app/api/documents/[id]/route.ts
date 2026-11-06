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

    const { data: doc, error: docError } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('id', docId)
      .eq('status', 'active')
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const isOwner = doc.owner_id === auth.userId;
    const isAdmin = auth.role === 'admin';

    let hasPermission = isOwner || isAdmin;
    let permType = isOwner ? 'owner' : isAdmin ? 'admin' : null;

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
        permType = perm.permission_type;
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
        details: { reason: 'Unauthorized document view attempt' },
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch active permissions for owner/admin
    let permissions: unknown[] = [];
    if (isOwner || isAdmin) {
      const { data: perms } = await supabaseAdmin
        .from('document_permissions')
        .select('*, profiles(email, full_name)')
        .eq('document_id', docId)
        .eq('is_active', true);
      permissions = perms || [];
    }

    await logSecurityEvent({
      actorId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: 'DOCUMENT_READ',
      targetDocumentId: docId,
      outcome: 'success',
      details: { filename: doc.original_filename },
    });

    return NextResponse.json({
      document: doc,
      permissionType: permType,
      permissions,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: docId } = await params;
    const auth = await verifyServerAuth(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: doc, error: docError } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('id', docId)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (doc.owner_id !== auth.userId && auth.role !== 'admin') {
      await logSecurityEvent({
        actorId: auth.userId,
        actorEmail: auth.email,
        actorRole: auth.role,
        action: 'ACCESS_DENIED',
        targetDocumentId: docId,
        outcome: 'denied',
        details: { reason: 'Unauthorized document deletion attempt' },
      });
      return NextResponse.json({ error: 'Forbidden: Only owner can delete' }, { status: 403 });
    }

    // Soft delete document
    const { error: deleteError } = await supabaseAdmin
      .from('documents')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('id', docId);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    // Deactivate all permissions
    await supabaseAdmin
      .from('document_permissions')
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq('document_id', docId);

    await logSecurityEvent({
      actorId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: 'DOCUMENT_DELETE',
      targetDocumentId: docId,
      outcome: 'success',
      details: { filename: doc.original_filename },
    });

    return NextResponse.json({ success: true, message: 'Document deleted successfully' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
