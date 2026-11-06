import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyServerAuth } from '@/lib/auth-guard';
import { logSecurityEvent } from '@/lib/audit';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { documentId, targetUserEmail, permissionType } = await req.json();

    if (!documentId || !targetUserEmail || !['read', 'edit'].includes(permissionType)) {
      return NextResponse.json({ error: 'Invalid permission payload' }, { status: 400 });
    }

    // Verify document ownership
    const { data: doc, error: docError } = await supabaseAdmin
      .from('documents')
      .select('owner_id')
      .eq('id', documentId)
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
        targetDocumentId: documentId,
        outcome: 'denied',
        details: { reason: 'Only the document owner can grant permissions' },
      });
      return NextResponse.json({ error: 'Forbidden: Only owner can grant' }, { status: 403 });
    }

    // Lookup target user
    const { data: targetUser, error: userError } = await supabaseAdmin
      .from('profiles')
      .select('id, email')
      .eq('email', targetUserEmail)
      .single();

    if (userError || !targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
    }

    // Upsert permission
    const { data: perm, error: permError } = await supabaseAdmin
      .from('document_permissions')
      .upsert({
        document_id: documentId,
        user_id: targetUser.id,
        permission_type: permissionType,
        granted_by: auth.userId,
        is_active: true,
        revoked_at: null,
      }, { onConflict: 'document_id, user_id' })
      .select('*')
      .single();

    if (permError) {
      return NextResponse.json({ error: permError.message }, { status: 500 });
    }

    await logSecurityEvent({
      actorId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: 'PERMISSION_GRANT',
      targetDocumentId: documentId,
      outcome: 'success',
      details: {
        granteeId: targetUser.id,
        granteeEmail: targetUserEmail,
        type: permissionType,
      },
    });

    return NextResponse.json({ success: true, permission: perm });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { documentId, targetUserId } = await req.json();

    if (!documentId || !targetUserId) {
      return NextResponse.json({ error: 'documentId and targetUserId required' }, { status: 400 });
    }

    // Verify document ownership
    const { data: doc, error: docError } = await supabaseAdmin
      .from('documents')
      .select('owner_id')
      .eq('id', documentId)
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
        targetDocumentId: documentId,
        outcome: 'denied',
        details: { reason: 'Only the document owner can revoke permissions' },
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Instant revocation: update is_active to false
    const { error: revokeError } = await supabaseAdmin
      .from('document_permissions')
      .update({
        is_active: false,
        revoked_at: new Date().toISOString(),
      })
      .eq('document_id', documentId)
      .eq('user_id', targetUserId);

    if (revokeError) {
      return NextResponse.json({ error: revokeError.message }, { status: 500 });
    }

    await logSecurityEvent({
      actorId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: 'PERMISSION_REVOKE',
      targetDocumentId: documentId,
      outcome: 'success',
      details: {
        revokedUserId: targetUserId,
      },
    });

    return NextResponse.json({ success: true, message: 'Permission revoked immediately' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
