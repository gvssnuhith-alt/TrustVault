/**
 * TrustVault - Cryptographic SHA-256 Audit Logger
 */
import { supabaseAdmin } from './supabase/server';

export interface AuditLogEntry {
  actorId?: string;
  actorEmail?: string;
  actorRole?: 'admin' | 'owner' | 'viewer' | 'anonymous';
  action: 
    | 'DOCUMENT_UPLOAD'
    | 'DOCUMENT_DOWNLOAD'
    | 'DOCUMENT_READ'
    | 'DOCUMENT_EDIT'
    | 'DOCUMENT_DELETE'
    | 'PERMISSION_GRANT'
    | 'PERMISSION_REVOKE'
    | 'ACCESS_DENIED'
    | 'LOGIN_SUCCESS'
    | 'LOGIN_FAILURE'
    | 'ADMIN_ACTION';
  targetDocumentId?: string;
  outcome: 'success' | 'denied';
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export async function logSecurityEvent(entry: AuditLogEntry) {
  try {
    const { error } = await supabaseAdmin.from('audit_logs').insert({
      actor_id: entry.actorId || null,
      actor_email: entry.actorEmail || null,
      actor_role: entry.actorRole || 'anonymous',
      action: entry.action,
      target_document_id: entry.targetDocumentId || null,
      outcome: entry.outcome,
      ip_address: entry.ipAddress || null,
      user_agent: entry.userAgent || null,
      details: entry.details || {},
      previous_hash: 'pending',
      current_hash: 'pending',
    });

    if (error) {
      console.error('[AuditLogger Error]:', error.message);
    }
  } catch (err) {
    console.error('[AuditLogger Exception]:', err);
  }
}
