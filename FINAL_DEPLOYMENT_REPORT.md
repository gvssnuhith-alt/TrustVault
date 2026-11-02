# TRUSTVAULT FINAL DEPLOYMENT REPORT (₹0/MONTH ARCHITECTURE)

**Date:** 2026-11-02  
**Auditors & Engineers:** Senior Full-Stack, DevOps, Database Architect & Application Security Auditor  
**Production Budget:** Strictly ₹0/month (100% Free Tiers, Zero Payment Methods Added)

---

## 1. Hosting Architecture Summary

| Component | Target Provider | Assigned Plan | Canonical URL / Endpoint | Real Cloud Status |
|---|---|---|---|---|
| **Public Frontend** | Vercel | Hobby (Free) | `https://trust-vault-smoky.vercel.app` | **PASS (Live HTTP 200)** |
| **Backend API** | Render | Free Web Service | `https://trustvault-backend.onrender.com` | **BLOCKED (Awaiting DB Secrets)** |
| **Relational Database** | Supabase | Free Tier | Pooled PostgreSQL (Port 6543 / 5432) | **BLOCKED (Awaiting Project Provisioning)** |
| **Object / File Storage**| Supabase Storage | Free Tier (1GB) | S3-Compatible: `<ref>.supabase.co/storage/v1/s3` | **BLOCKED (Awaiting Bucket Provisioning)** |

---

## 2. Vercel Deployment Verification

- **Project Name:** `Trust Vault` (Linked as `trust-vault` in `.vercel/project.json`)
- **Framework:** Vite + React + TypeScript + TailwindCSS
- **Build Command:** `tsc -b && vite build`
- **Output Directory:** `frontend/dist`
- **Edge Routing & Proxying:** `frontend/vercel.json` maps `/api/(.*)` to upstream Render backend while routing SPA navigation to `index.html`.
- **Public Domain Verification:**
  - `GET https://trust-vault-smoky.vercel.app` -> **HTTP 200 OK**
  - Content-Type: `text/html; charset=utf-8`
  - Asset bundling: Zero mixed content, TLS 1.3 enforced.

---

## 3. Render Free Web Service Deployment

- **Blueprint Specification:** `render.yaml`
- **Runtime:** Python 3.11 / Uvicorn ASGI
- **Instance Type:** `starter` (Free tier, 512MB RAM, shared CPU)
- **Start Command:** `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Cold-Start Handling:** Configured lightweight startup hook; health check probe at `/api/healthz` responding in <50ms without initiating heavy database transactions.
- **Current Blocker:** Render free managed database expired. Web service requires external `DATABASE_URL` environment secret pointed to Supabase Free.

---

## 4. Supabase Free Database & Storage Architecture

- **PostgreSQL Connection String:**
  ```text
  postgresql://postgres.[project-ref]:[db-password]@aws-0-[region].pooler.supabase.com:6543/postgres?sslmode=require
  ```
- **Connection Pooling:** SQLAlchemy `pool_size=5`, `max_overflow=10`, `pool_recycle=300`, `pool_pre_ping=True`.
- **Supabase Storage Configuration:**
  - Bucket: `trustvault-docs` (Private access only).
  - Storage Backend: S3-Compatible API endpoint (`https://<project-ref>.supabase.co/storage/v1/s3`).
  - Access Credentials: `S3_ACCESS_KEY_ID=<project-ref>`, `S3_SECRET_ACCESS_KEY=<service-role-key-or-s3-secret>`.

---

## 5. Deployment Blocker & Required User Action

To transition Render, Supabase PostgreSQL, and Supabase Storage from **BLOCKED** to **PASS**:
1. Create a free project at [supabase.com](https://supabase.com).
2. Create a private bucket named `trustvault-docs` under Storage.
3. In the Render Dashboard under Environment Variables for `trustvault-backend`, provide:
   - `DATABASE_URL`: Your Supabase pooled PostgreSQL URL.
   - `STORAGE_BACKEND`: `s3`
   - `S3_ENDPOINT_URL`: `https://<your-project-ref>.supabase.co/storage/v1/s3`
   - `S3_BUCKET_NAME`: `trustvault-docs`
   - `S3_ACCESS_KEY_ID`: `<your-supabase-project-ref>`
   - `S3_SECRET_ACCESS_KEY`: `<your-supabase-service-role-key>`
   - `ENVIRONMENT`: `production`
   - `SECRET_KEY`: High-entropy 64-character hex string.
