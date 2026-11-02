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

---

## Browser Compatibility Status
- **Chromium / Blink**: VERIFIED PASS (28 automated UI interactions)
- **Google Chrome**: VERIFIED PASS (Native system channel)
- **Microsoft Edge**: VERIFIED PASS (Native system channel)
- **Firefox**: NOT TESTED (Playwright binary not installed on host machine)
- **WebKit**: NOT TESTED (Playwright binary not installed on host machine)

---

## Verdict Summary
- **Open Code/Security Defects**: 0
- **Blocked Defects**: 0
- **Final Independent Verdict**: **INCOMPLETE** (All software components defect-free and verified; multi-browser testing incomplete due to missing Firefox/WebKit binaries on host)
