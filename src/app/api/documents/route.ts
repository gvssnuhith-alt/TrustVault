import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { verifyServerAuth } from '@/lib/auth-guard';
import { logSecurityEvent } from '@/lib/audit';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (auth.role !== 'owner' && auth.role !== 'admin') {
      await logSecurityEvent({
        actorId: auth.userId,
        actorEmail: auth.email,
        actorRole: auth.role,
        action: 'ACCESS_DENIED',
        outcome: 'denied',
        details: { reason: 'Only owners or admins can upload documents' },
      });
      return NextResponse.json({ error: 'Forbidden: Insufficient role' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const categoryId = (formData.get('category_id') as string) || null;

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    // Security validation
    const maxFileSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxFileSize || file.size === 0) {
      return NextResponse.json({ error: 'Invalid file size' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Generate safe storage path
    const storagePath = `${auth.userId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    // Upload to private bucket
    const { error: storageError } = await supabaseAdmin.storage
      .from('vault-documents')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });

    if (storageError) {
      return NextResponse.json({ error: storageError.message }, { status: 500 });
    }

    // Insert record in documents table
    const { data: doc, error: dbError } = await supabaseAdmin
      .from('documents')
      .insert({
        owner_id: auth.userId,
        category_id: categoryId,
        original_filename: file.name,
        storage_path: storagePath,
        mime_type: file.type || 'application/octet-stream',
        file_size: file.size,
        file_hash_sha256: fileHash,
        status: 'active',
      })
      .select('*')
      .single();

    if (dbError || !doc) {
      return NextResponse.json({ error: dbError?.message || 'Database error' }, { status: 500 });
    }

    await logSecurityEvent({
      actorId: auth.userId,
      actorEmail: auth.email,
      actorRole: auth.role,
      action: 'DOCUMENT_UPLOAD',
      targetDocumentId: doc.id,
      outcome: 'success',
      details: {
        filename: file.name,
        size: file.size,
        hash: fileHash,
      },
    });

    return NextResponse.json({ success: true, document: doc });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyServerAuth(req);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (auth.role === 'admin') {
      const { data } = await supabaseAdmin.from('documents').select('*').order('created_at', { ascending: false });
      return NextResponse.json({ documents: data || [] });
    }

    // Fetch owned documents
    const { data: owned } = await supabaseAdmin
      .from('documents')
      .select('*')
      .eq('owner_id', auth.userId)
      .eq('status', 'active');

    // Fetch shared documents where active permission exists
    const { data: permissions } = await supabaseAdmin
      .from('document_permissions')
      .select('document_id, permission_type')
      .eq('user_id', auth.userId)
      .eq('is_active', true);

    const docIds = (permissions || []).map((p) => p.document_id);
    let shared: unknown[] = [];
    if (docIds.length > 0) {
      const { data: sharedDocs } = await supabaseAdmin
        .from('documents')
        .select('*')
        .in('id', docIds)
        .eq('status', 'active');
      shared = sharedDocs || [];
    }

    return NextResponse.json({
      owned: owned || [],
      shared: shared || [],
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
