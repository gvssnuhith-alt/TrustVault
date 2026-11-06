# TrustVault Threat Model (THREATS.md)
> Snovasys Hiring Challenge 2026 (RISE) — Security Specification

## 1. Threats Identified & Mitigations

### Threat 1: Broken Object Level Authorization (BOLA / IDOR)
* **Attack Scenario:** Attacker (User A) modifies the document ID in the URL `/api/documents/doc-b` to read or download User B's private documents.
* **Mitigation:** Server-side auth guard on every single request. Database checks (`is_owner OR is_active_permission`) before streaming files. Unauthenticated or unauthorized attempts return HTTP 403 and create an immutable `ACCESS_DENIED` audit block.

### Threat 2: Storage Direct Access & Predictable URLs
* **Attack Scenario:** Attacker guesses the storage object key or tries to access Supabase bucket links directly.
* **Mitigation:** Bucket `vault-documents` is strictly private (`public: false`). No signed public URLs are generated. The file is piped exclusively through the Next.js API streaming proxy after verifying user credentials.

### Threat 3: Permission Revocation Race Condition (Stale Cache)
* **Attack Scenario:** Owner revokes User B's access, but User B continues downloading files using an active session or cached token.
* **Mitigation:** Permissions are verified live against PostgreSQL on every document download request. Revoking a permission sets `is_active = FALSE` in real-time (0ms latency cutoff).

### Threat 4: Audit Trail Tampering & Log Deletion
* **Attack Scenario:** A compromised user or malicious actor attempts to `UPDATE` or `DELETE` audit log rows to hide unauthorized downloads.
* **Mitigation:** PostgreSQL DB trigger `trg_prevent_audit_log_mod` throws a runtime exception on any `UPDATE` or `DELETE`. Every row computes a cryptographic SHA-256 hash chained to the prior block.

### Threat 5: Malicious File Uploads & Extension Spoofing
* **Attack Scenario:** Attacker uploads `exploit.exe` or oversized malware disguised as `doc.pdf`.
* **Mitigation:** Strict 50MB file size ceiling, binary SHA-256 hash calculation, safe filename sanitization, and random UUID storage prefix isolation.
