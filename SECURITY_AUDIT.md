# TrustVault Security & Attack Surface Audit

## Threat Model & Live Verification

### 1. Insecure Direct Object Reference (IDOR) & Cross-User Document Access
- **Test**: Viewer (Bob) attempted to `GET`, `PATCH`, and `DELETE` Alice's document (`f6d35ae8-0ddf-4330-bfcd-da82359f2b8d`).
- **Observed Behavior**:
  - `GET /documents/{id}` -> HTTP 404 Not Found (Zero-existence oracle).
  - `PATCH /documents/{id}` -> HTTP 404 / 403 Forbidden.
  - `DELETE /documents/{id}` -> HTTP 403 Forbidden ("Only document owner or admin can delete document").
- **Verdict**: PASS. Non-owners cannot read, alter, or destroy unpermitted documents.

### 2. Privilege Escalation to Admin Controls
- **Test**: Non-admin viewer (Bob) called `GET /api/audit/metrics` and `GET /api/audit/verify`.
- **Observed Behavior**: Both requests returned HTTP 403 Forbidden with `{"detail": "Administrator privileges required"}`.
- **Verdict**: PASS. Role authorization is strictly enforced server-side.

### 3. Immediate Permission Revocation Verification
- **Test**: Alice granted Bob read-only permission, Bob verified download (HTTP 200), Alice invoked `DELETE /documents/{id}/permissions/{bob_id}`. Bob immediately attempted re-download.
- **Observed Behavior**: Bob's subsequent download returned HTTP 404 / 403 ("Access denied").
- **Latency**: 0ms. Access is terminated in the same transaction.
- **Verdict**: PASS.

### 4. File Upload Security & Path Traversal
- **Test**: Uploading path traversal filenames (e.g. `../../etc/passwd`).
- **Observed Behavior**: `os.path.basename` strips directory traversals; magic-byte validator rejects malicious binaries.
- **Size Limit**: Enforced 10MB ceiling (`MAX_FILE_SIZE = 10 * 1024 * 1024`).
- **Verdict**: PASS.

### 5. Cryptographic Audit Chain Tampering Detection
- **Mechanism**: Every audit event computes `current_hash = SHA256(previous_hash + action + user_id + doc_id + metadata + timestamp)`.
- **Verification**: `GET /api/audit/verify` verifies every link in sequence from Genesis block #1. Status: VALID.
- **Verdict**: PASS.
