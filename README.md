# TrustVault
Secure document sharing with cryptographic tamper-evident audit trail.

Built for **Snovasys Fresher Hiring Challenge 2026 (RISE)**.

## Core Security Guarantees
1. **Server-Enforced Access Wall:** Documents cannot be accessed by ID enumeration or URL guessing (Zero BOLA / IDOR).
2. **Instant Revocation:** Revoking a user's grant immediately terminates download ability even if previous links were held.
3. **Cryptographically Tamper-Evident Audit Trail:** Every event is linked via SHA-256 hash chains, making historical log manipulation mathematically detectable.
4. **Content-Inspected Uploads:** Magic-byte validation prevents executable masquerading as document files.
