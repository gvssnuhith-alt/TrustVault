# AI Development & Prompts Log (PROMPTS.md)
> Recorded AI engineering sessions, bug catches, and architectural corrections for Snovasys Challenge.

## Entry 1: 2026-11-06 — Project Inception & Node.js Platform Compatibility
* **Intent:** Initialize Next.js 14 App Router project with TypeScript and Tailwind CSS.
* **AI Got Wrong:** Standard Turbopack binary bindings failed on Windows x64 Node 24 due to native binding architecture mismatches.
* **Correction Applied:** Configured NVM to lock Node.js to v20.19.0 (LTS requirement), disabled Turbopack in favor of stable Webpack compiler, and verified clean compilation.

## Entry 2: 2026-11-06 — Server-Side Zero-Trust Authorization & IDOR Defense
* **Intent:** Design document download API that prevents unauthorized access.
* **AI Got Wrong:** Initial thought suggested using Supabase client-side signed URLs with 1-hour expiration.
* **Correction Applied:** Identified that long-lived signed URLs break the immediate revocation requirement (revoked user could still download for 60 minutes). Implemented Next.js Server Streaming Proxy (`/api/documents/[id]/download`) which checks database permission state on every single request.

## Entry 3: 2026-11-06 — Cryptographic Hash Chain Audit Ledger
* **Intent:** Build append-only audit trail with SHA-256 integrity verification.
* **AI Got Wrong:** Application-level hashing without DB concurrency locks allowed race conditions under concurrent writes.
* **Correction Applied:** Added PostgreSQL advisory transaction lock (`pg_advisory_xact_lock(77123991)`) inside `chain_audit_log` PL/pgSQL trigger to serialize hash calculations and guarantee mathematically unbroken blockchain sequencing.

## Entry 4: 2026-11-06 — User Roles & Identity Synchronization
* **Intent:** Support 3 distinct user tiers: Admin, Owner, Viewer.
* **AI Got Wrong:** Session retrieval fell back to viewer when profile row query had slight delay after signup.
* **Correction Applied:** Implemented fallback resolution checking both `profiles.role` and `auth.users.user_metadata.role`, ensuring zero privilege escalation while preserving instant login capabilities.

## Entry 5: 2026-11-06 — 10,000 Iterations Adversarial Security Test Suite
* **Intent:** Deliver automated test suite covering RBAC, hash chaining, and revocation.
* **AI Got Wrong:** High-volume async test runs caused connection pool exhaustion against cloud free tier.
* **Correction Applied:** Created targeted algorithmic verification suite in Vitest testing 5,000 block hash calculations, 3,000 role boundary transitions, and 2,000 instant revocation cuts in memory with zero cloud throttling.
