"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Lock, Mail, ArrowRight, Loader2, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      // Store auth session
      localStorage.setItem("trustvault_token", data.token);
      localStorage.setItem("trustvault_user", JSON.stringify(data.user));

      // Route based on role
      router.push("/dashboard");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication error";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090B0A] text-white flex flex-col justify-center items-center px-4 selection:bg-[#B8E6C5] selection:text-black">
      <div className="w-full max-w-md border border-white/10 rounded-2xl bg-zinc-950/80 p-8 shadow-2xl backdrop-blur-md">
        {/* Header */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="p-3 rounded-xl bg-emerald-950/50 border border-[#B8E6C5]/30 text-[#B8E6C5] mb-3">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-wider">
            TRUST<span className="text-[#C8A45D]">VAULT</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1 font-mono uppercase tracking-widest">
            Cryptographic Access Portal
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-3 rounded-lg bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-mono uppercase text-zinc-400 mb-1.5">
              Authorized Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@trustvault.io"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-black/60 border border-white/10 text-sm text-white focus:outline-none focus:border-[#B8E6C5] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono uppercase text-zinc-400 mb-1.5">
              Access Key / Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-black/60 border border-white/10 text-sm text-white focus:outline-none focus:border-[#B8E6C5] transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 rounded-lg bg-[#B8E6C5] hover:bg-[#a0dcb0] text-black font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying Credentials...</span>
              </>
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Preset Test Credentials Card */}
        <div className="mt-8 p-4 rounded-xl border border-white/10 bg-zinc-950 text-left font-mono text-[11px]">
          <p className="text-zinc-400 font-semibold mb-2 uppercase text-[10px] tracking-wider text-[#C8A45D]">
            Official Evaluation Credentials (RISE)
          </p>
          <div className="space-y-2">
            <div className="flex justify-between items-center py-1 border-b border-white/5">
              <span className="text-[#C8A45D]">Admin</span>
              <span className="text-zinc-300">admin@trustvault.io / AdminSecurePass2026!</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-white/5">
              <span className="text-[#B8E6C5]">Owner</span>
              <span className="text-zinc-300">owner@trustvault.io / OwnerSecurePass2026!</span>
            </div>
            <div className="flex justify-between items-center py-1">
              <span className="text-zinc-400">Viewer</span>
              <span className="text-zinc-300">viewer@trustvault.io / ViewerSecurePass2026!</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
