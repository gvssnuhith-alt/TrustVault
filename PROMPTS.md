# PROMPTS.md - AI Direction & Correction Journal
*Required deliverable for Snovasys Hiring Challenge 2026*

This journal logs AI interactions, specifically documenting where AI suggestions were scrutinized, found defective or insecure, and corrected to adhere to the zero-trust security model of TrustVault.

---

### Entry 1: 2026-11-01 - System Architecture & Initial Authorization Model
* **Task Requested:** Generate initial database schema and authorization checks for multi-role document access (Admin, Owner, Viewer).
* **AI Output:**
  The AI suggested a straightforward permission table with `can_read` and `can_edit` booleans and recommended checking permissions via FastAPI path dependencies using JWT claims (storing user role and allowed document IDs inside the JWT payload).
* **Defect / Security Flaw Identified:**
  1. Storing document permissions inside JWT tokens violates **Requirement 3 (Instant Revocation)**: if an owner revokes access, the recipient's JWT remains valid until expiration (typically 15–60 mins) unless an active token blacklist is queried.
  2. The AI's suggested schema lacked an immutable hash pointer for the audit trail, leaving audit records vulnerable to silent database updates (`UPDATE audit_logs SET action = '...'`).
* **Correction Implemented:**
  1. Rejected permission storage inside JWTs. Kept JWT purely for identity authentication (`sub=user_id`, `role=role`).
  2. Enforced that **every document read/download request queries the database authority directly** inside an atomic transaction.
  3. Added `previous_entry_hash` and `current_hash` columns with a SHA-256 genesis-linked chain to ensure the audit log is mathematically tamper-evident.
* **Commit:** Initial repository setup & threat modeling.

---
*(Additional dated entries will be recorded in-flight as features and edge-case mitigations are developed)*
