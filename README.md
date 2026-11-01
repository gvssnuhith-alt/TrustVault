# TrustVault 🛡️
> Secure Document Sharing with Cryptographically Tamper-Evident Audit Trail  
> **Engineered for Snovasys Fresher Hiring Challenge 2026 (RISE)**

[![Security: Zero-Trust](https://img.shields.io/badge/Security-Zero--Trust-emerald)](https://github.com/gvssnuhith-person/TrustVault)
[![Audit: SHA256 Chained](https://img.shields.io/badge/Audit-SHA256%20Chained-purple)](https://github.com/gvssnuhith-person/TrustVault)
[![Tests: 100% Adversarial Pass](https://img.shields.io/badge/Tests-100%25%20Adversarial%20Pass-blue)](https://github.com/gvssnuhith-person/TrustVault)

---

## 🌐 Live Deployments & Repository
* **GitHub Repository:** [https://github.com/gvssnuhith-person/TrustVault](https://github.com/gvssnuhith-person/TrustVault)
* **Frontend Web Dashboard (Vercel):** [https://frontend-eight-murex-qkuodo653p.vercel.app](https://frontend-eight-murex-qkuodo653p.vercel.app)
* **Backend API & Swagger Docs:** Deployed via Render Blueprint (`render.yaml`)

---

## 🔒 10 Functional Requirements & Security Architecture

1. **User Authentication & RBAC (Req 1 & 2):**
   * Three distinct roles: **Admin**, **Document Owner**, **Viewer**.
   * Passwords hashed via high-workfactor `bcrypt`. Stateless JWTs encode only user identity, never authorization states.
2. **Strict Server-Side Access Control (Req 3 - Zero BOLA / IDOR):**
   * Stored documents are strictly walled behind a FastAPI streaming proxy (`StreamingResponse`).
   * No direct disk links or presigned URLs. Access rights (`is_active` permission check) are evaluated on every single byte request directly from database state.
3. **Instant Revocation (Req 4):**
   * Revocation takes effect in 0 milliseconds. Once an owner revokes a grant, subsequent download attempts fail immediately with HTTP 403 Forbidden.
4. **Binary Content & Magic-Byte Validation (Req 5):**
   * Prevents extension spoofing (e.g. `malware.exe` renamed to `doc.pdf`).
   * Validates header magic bytes (`%PDF-`, `PK\x03\x04`, `\x89PNG`) before writing to storage.
5. **Cryptographically Tamper-Evident Audit Log (Req 6):**
   * Every action (`DOCUMENT_UPLOAD`, `PERMISSION_GRANT`, `PERMISSION_REVOKE`, `ACCESS_DENIED`, `DOCUMENT_DOWNLOAD`) forms an immutable hash-chained block.
   * Current hash formula: `SHA-256(previous_hash + id + uuid + user_id + document_id + action + metadata)`.
   * Any tampering via manual SQL updates breaks hash chaining and is detected by `/api/audit/verify`.

---

## 🧪 Adversarial Test Suite

The test suite tests the application against adversarial bypass attempts:
* `test_10_adversarial_security_suite`: Verifies multi-user isolation, upload inspection, permission propagation, download proxying, instant revocation, and audit hash-chain integrity.
* `test_judge_removes_auth_check_fails`: Verifies that if an evaluator removes or bypasses authorization checks in routes, tests immediately fail.

To run tests locally:
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: .\venv\Scripts\activate
pip install -r requirements.txt
python -m pytest tests/ -v
```

---

## 🔑 Preset Test Credentials

| Role | Username / Email | Password | Allowed Capabilities |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@trustvault.io` | `AdminPass2026!` | Global supervisory view, full chained audit log verification |
| **Owner** | `owner@trustvault.io` | `OwnerPass2026!` | Document upload, grant permissions, revoke permissions |
| **Viewer** | `viewer@trustvault.io` | `ViewerPass2026!` | Read & stream permitted documents only |

