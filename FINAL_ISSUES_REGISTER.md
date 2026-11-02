# TrustVault Final Issues Register

| Issue ID | Severity | Component | Summary | Status | Resolution |
|----------|----------|-----------|---------|--------|------------|
| ISS-001 | Critical | Frontend Base URL | Hardcoded dead Cloudflare tunnel URL | RESOLVED | Changed to dynamic `/api` reverse proxy with `VITE_API_URL` support |
| ISS-002 | High | Backend Routes | Missing `PATCH /{id}` and `DELETE /{id}` endpoints | RESOLVED | Added mutation routes with audit logging |
| ISS-003 | High | Backend Schemas | Grant permission Pydantic schema rejected usernames | RESOLVED | Allowed username and email string with case-insensitive DB query |
| ISS-004 | High | Backend Query | Revoke permission failed when ID was permission record ID | RESOLVED | Updated query with `or_(grantee_id, id)` and audit logging |
| ISS-005 | High | Frontend | React unhandled exception on `metrics.chain_status` | RESOLVED | Fixed key access to `metrics.chain_integrity?.status` |
| ISS-006 | Medium | Responsive Layout | 320px viewport overflowed by 37px | RESOLVED | Refactored compact buttons and enforced `overflow-x-hidden` |
| ISS-007 | Medium | Frontend State | Active tab stayed on 'audit' after logout | RESOLVED | Reset `activeTab` to 'vault' on logout |
| ISS-008 | High | Auth Security | Old JWT token could still access APIs after logout | RESOLVED | Added `RevokedToken` table, hashed token on logout, enforced check in `get_current_user` |
| ISS-009 | Medium | API Protocol | Upload exceeding 10MB returned HTTP 400 instead of 413 | RESOLVED | Patched `routes_documents.py` to return `HTTP_413_REQUEST_ENTITY_TOO_LARGE` |
| ISS-010 | Low | Deployment Config| Missing `.env.example` documenting `VITE_API_URL` | RESOLVED | Added `frontend/.env.example` with deployment configuration |
| ISS-011 | High | Audit Integrity | Race condition in concurrent audit log writes broke hash chain | RESOLVED | Serialized hash computation and insertion in `backend/app/audit.py` with `threading.Lock()` |
| ISS-012 | Medium | Dependency / Clean Clone | Fresh clone failed on `EmailStr` and grantee username revocation | RESOLVED | Added `pydantic[email]` & `email-validator` to `requirements.txt`; updated grantee resolution |
| ISS-013 | High | Remote Production Infrastructure | Remote Render backend timed out; Vercel points to dead Cloudflare tunnel (HTTP 530) | BLOCKED | Local and clean-clone production builds verified; remote verification blocked by dead cloud targets |

---

## Browser Compatibility Status (Full Playwright Automation Executed)
- **Chromium / Blink**: **VERIFIED PASS** (Full 28 interaction E2E suite + 45 element audit)
- **Mozilla Firefox (Gecko)**: **VERIFIED PASS** (Full 28 interaction E2E suite executed via Playwright Firefox)
- **WebKit (Safari)**: **VERIFIED PASS** (Full 28 interaction E2E suite executed via Playwright WebKit)
- **Google Chrome**: **VERIFIED PASS** (Full 28 interaction E2E suite executed via Playwright Chrome channel)
- **Microsoft Edge**: **VERIFIED PASS** (Full 28 interaction E2E suite executed via Playwright MSEdge channel)

---

## Verdict Summary
- **Open Code/Security Defects**: 0
- **Codebase Tests Passing**: 100% (Backend: 26/26 pytest, E2E: 5/5 browsers passed, 45/45 elements verified)
- **Blocked Verifications**: 1 (Remote production deployment inaccessible: Render service offline, Cloudflare tunnel HTTP 530)
- **Final Independent Verdict**: **INCOMPLETE**
  *(Local system, all 5 browser engines, JWT revocation, concurrency lock, clean clone, and 45 UI elements are 100% verified with hard test proof; production cloud verification cannot pass because remote hosting endpoints are offline)*
