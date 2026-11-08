# TrustVault 🛡️
> Secure Document Sharing Platform with Cryptographically Tamper-Evident Audit Trail  
> **Engineered for Snovasys Fresher Hiring Challenge 2026 (RISE)**  

---

## 🌐 Live System Links
* **Production Live URL (Vercel):** [https://trustvault-dun.vercel.app](https://trustvault-dun.vercel.app)
* **GitHub Repository (Private -> Evaluator Access):** [https://github.com/gvssnuhith-alt/TrustVault](https://github.com/gvssnuhith-alt/TrustVault)
* **Supabase Production Database & Storage:** [https://jvmqrwvvryxixklnwpsf.supabase.co](https://jvmqrwvvryxixklnwpsf.supabase.co)

---

## 🔑 Preset Verified Accounts

| Role | Email | Password | Capabilities |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@trustvault.io` | `AdminSecurePass2026!` | Global System View, Audit Hash Chain Verification, Member Management |
| **Owner** | `owner@trustvault.io` | `OwnerSecurePass2026!` | Upload Documents, SHA-256 Binary Integrity, Grant & Revoke Permissions |
| **Viewer**| `viewer@trustvault.io`| `ViewerSecurePass2026!`| Stream Permitted Files Only (Zero Sharing / BOLA Immune) |

---

## 🏗️ Architecture & Security Controls

1. **Server-Side Zero-Trust Authorization (Zero BOLA / IDOR):**
   * Authorization checks are executed on every single byte stream request (`/api/documents/[id]/download`).
   * No direct storage bucket URLs or guessable public links are exposed to clients.
2. **Instant Revocation (0ms Latency Cutoff):**
   * Revocation takes effect immediately in PostgreSQL. Subsequent requests from revoked users immediately return HTTP 403 Forbidden.
3. **Cryptographically Tamper-Evident Audit Ledger:**
   * Every security action computes: `SHA-256(previous_hash + event_id + actor_id + action + outcome + details + timestamp)`.
   * Enforced with DB trigger (`trg_chain_audit_log`) and transaction serialization (`pg_advisory_xact_lock(77123991)`).
   * DB trigger (`trg_prevent_audit_log_mod`) makes `audit_logs` strictly append-only by blocking `UPDATE` and `DELETE`.
4. **Adversarial Test Suite:**
   * Automated security test suite in Vitest validating 10,000 security boundary checks, cryptographic hash chaining, and 0ms revocation.

