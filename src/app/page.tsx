import React from "react";
import { Shield, Lock, FileCheck, Terminal, ArrowRight, Activity, Users } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#090B0A] text-white flex flex-col font-sans selection:bg-[#B8E6C5] selection:text-black">
      {/* Top Navbar */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between backdrop-blur-md sticky top-0 z-50 bg-[#090B0A]/80">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-950/60 border border-[#B8E6C5]/30 text-[#B8E6C5]">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-wider text-white">
              TRUST<span className="text-[#C8A45D]">VAULT</span>
            </h1>
            <p className="text-[10px] tracking-widest text-[#B8E6C5] uppercase font-mono">Zero-Trust Document Security</p>
          </div>
        </div>

        <nav className="flex items-center gap-4">
          <a
            href="/login"
            className="text-xs uppercase tracking-wider font-semibold px-4 py-2 rounded-md bg-[#B8E6C5] text-black hover:bg-[#a0dcb0] transition-colors"
          >
            Sign In
          </a>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-16 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#B8E6C5]/20 bg-emerald-950/20 text-[#B8E6C5] text-xs font-mono mb-8">
          <Activity className="w-3.5 h-3.5" />
          <span>SNOVASYS HIRING CHALLENGE 2026 — RISE SUBMISSION</span>
        </div>

        <h2 className="text-4xl sm:text-6xl font-extrabold tracking-tight max-w-4xl leading-[1.1] mb-6">
          The document platform where the wrong person{" "}
          <span className="text-[#B8E6C5] underline decoration-[#C8A45D] underline-offset-8">can never read</span> the file.
        </h2>

        <p className="text-zinc-400 max-w-2xl text-base sm:text-lg mb-10 leading-relaxed font-light">
          Server-side Zero-Trust authorization on every byte. Cryptographically chained SHA-256 audit logs. Instant 0ms revocation. Verified against real adversarial security attacks.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 mb-16">
          <a
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#B8E6C5] text-black font-semibold text-sm hover:bg-[#a0dcb0] transition-all shadow-lg shadow-emerald-950/50"
          >
            <span>Launch Security Console</span>
            <ArrowRight className="w-4 h-4" />
          </a>
          <a
            href="#architecture"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-white/10 bg-zinc-900/60 text-white font-medium text-sm hover:bg-zinc-800 transition-colors"
          >
            <span>View Architecture</span>
          </a>
        </div>

        {/* Feature Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left" id="architecture">
          <div className="p-6 rounded-xl border border-white/10 bg-zinc-950/60 hover:border-[#B8E6C5]/40 transition-colors">
            <div className="p-3 w-fit rounded-lg bg-emerald-950/40 border border-[#B8E6C5]/20 text-[#B8E6C5] mb-4">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Zero-Trust Access Gate</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Every download, read, and edit request runs authorization checks directly against Postgres database state. Zero client-side trust or exposed permanent file links.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-white/10 bg-zinc-950/60 hover:border-[#C8A45D]/40 transition-colors">
            <div className="p-3 w-fit rounded-lg bg-amber-950/40 border border-[#C8A45D]/20 text-[#C8A45D] mb-4">
              <Terminal className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Chained SHA-256 Ledger</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Every action (grant, revoke, download, denied access) computes a SHA-256 hash linked to the prior block. Database-level triggers make log modification impossible.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-white/10 bg-zinc-950/60 hover:border-[#B8E6C5]/40 transition-colors">
            <div className="p-3 w-fit rounded-lg bg-emerald-950/40 border border-[#B8E6C5]/20 text-[#B8E6C5] mb-4">
              <FileCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Instant 0ms Revocation</h3>
            <p className="text-xs text-zinc-400 leading-relaxed">
              When an owner revokes permission, access ceases immediately. Subsequent API and storage requests are denied with HTTP 403 Forbidden without cache lag.
            </p>
          </div>
        </div>

        {/* Roles & Permissions Breakdown */}
        <div className="mt-16 w-full border border-white/10 rounded-xl p-8 bg-zinc-950/80 text-left">
          <div className="flex items-center gap-3 mb-6">
            <Users className="w-5 h-5 text-[#C8A45D]" />
            <h3 className="text-lg font-bold text-white">Three-Tier Least Privilege RBAC</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 font-mono text-xs">
            <div className="p-4 rounded-lg bg-black/40 border border-white/5">
              <span className="text-[#C8A45D] font-bold block mb-2 text-sm">ADMIN</span>
              <ul className="text-zinc-400 space-y-1">
                <li>• Global system observability</li>
                <li>• Tamper-proof audit inspection</li>
                <li>• User management & account locks</li>
                <li>• Zero silent document snooping</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-black/40 border border-white/5">
              <span className="text-[#B8E6C5] font-bold block mb-2 text-sm">OWNER</span>
              <ul className="text-zinc-400 space-y-1">
                <li>• Upload & categorize files</li>
                <li>• Grant named Read / Edit rights</li>
                <li>• Instant permission revocation</li>
                <li>• Real-time per-doc audit trail</li>
              </ul>
            </div>
            <div className="p-4 rounded-lg bg-black/40 border border-white/5">
              <span className="text-zinc-300 font-bold block mb-2 text-sm">VIEWER</span>
              <ul className="text-zinc-400 space-y-1">
                <li>• Stream permitted docs only</li>
                <li>• Strict download proxy control</li>
                <li>• Zero re-share or grant capabilities</li>
                <li>• Denied requests recorded in audit</li>
              </ul>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-6 px-6 text-center text-xs text-zinc-500 font-mono">
        <p>TrustVault • Snovasys Hiring Challenge 2026 (RISE) • Zero-Trust Document Security Platform</p>
      </footer>
    </div>
  );
}
