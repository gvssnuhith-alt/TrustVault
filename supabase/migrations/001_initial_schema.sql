-- ==============================================================================
-- TRUSTVAULT DATABASE SCHEMA (Snovasys Hiring Challenge 2026 - RISE)
-- Built for Supabase PostgreSQL with strict RLS, tamper-evident chained audit log
-- ==============================================================================

-- 1. Profiles Table (extends auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'owner', 'viewer')),
    is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Document Categories
CREATE TABLE IF NOT EXISTS public.document_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Documents Table
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.document_categories(id) ON DELETE SET NULL,
    original_filename TEXT NOT NULL,
    storage_path TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    file_size BIGINT NOT NULL CHECK (file_size > 0),
    file_hash_sha256 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Document Permissions (Explicit user grants)
CREATE TABLE IF NOT EXISTS public.document_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    permission_type TEXT NOT NULL CHECK (permission_type IN ('read', 'edit')),
    granted_by UUID NOT NULL REFERENCES public.profiles(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    CONSTRAINT unique_active_permission UNIQUE (document_id, user_id)
);

-- 5. Cryptographically Chained Tamper-Evident Audit Log
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_email TEXT,
    actor_role TEXT,
    action TEXT NOT NULL,
    target_document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied')),
    ip_address TEXT,
    user_agent TEXT,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    previous_hash TEXT NOT NULL,
    current_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Indexes for High-Velocity Queries & Filtering
CREATE INDEX IF NOT EXISTS idx_documents_owner ON public.documents(owner_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON public.documents(category_id);
CREATE INDEX IF NOT EXISTS idx_documents_created ON public.documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_permissions_doc_user ON public.document_permissions(document_id, user_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_doc ON public.audit_logs(target_document_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_hash ON public.audit_logs(current_hash);

-- 7. Audit Log Tamper-Proof Trigger Function (SHA-256 Hash Chaining)
CREATE OR REPLACE FUNCTION public.chain_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    last_hash TEXT;
    payload TEXT;
BEGIN
    -- Advisory lock to serialize chain computation and prevent race conditions
    PERFORM pg_advisory_xact_lock(77123991);

    -- Fetch the hash of the latest entry (genesis hash if empty)
    SELECT current_hash INTO last_hash 
    FROM public.audit_logs 
    ORDER BY id DESC 
    LIMIT 1;

    IF last_hash IS NULL THEN
        last_hash := '0000000000000000000000000000000000000000000000000000000000000000';
    END IF;

    NEW.previous_hash := last_hash;

    -- Compute SHA-256 over immutable chain attributes
    payload := last_hash || ':' ||
               COALESCE(NEW.event_id::TEXT, '') || ':' ||
               COALESCE(NEW.actor_id::TEXT, 'anonymous') || ':' ||
               NEW.action || ':' ||
               COALESCE(NEW.target_document_id::TEXT, 'none') || ':' ||
               NEW.outcome || ':' ||
               NEW.details::TEXT || ':' ||
               COALESCE(NEW.created_at::TEXT, NOW()::TEXT);

    NEW.current_hash := encode(digest(payload, 'sha256'), 'hex');

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_chain_audit_log ON public.audit_logs;
CREATE TRIGGER trg_chain_audit_log
BEFORE INSERT ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.chain_audit_log();

-- 8. Disallow Updates or Deletions on Audit Logs (Tamper Resistance)
CREATE OR REPLACE FUNCTION public.prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are append-only. Modification or deletion is cryptographically prohibited.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_log_mod ON public.audit_logs;
CREATE TRIGGER trg_prevent_audit_log_mod
BEFORE UPDATE OR DELETE ON public.audit_logs
FOR EACH ROW
EXECUTE FUNCTION public.prevent_audit_log_modification();
