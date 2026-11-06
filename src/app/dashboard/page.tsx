"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  FileText,
  Upload,
  Download,
  Trash2,
  Share2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Search,
  Lock,
  Users,
  Terminal,
  LogOut,
} from "lucide-react";

interface UserProfile {
  id: string;
  email: string;
  role: "admin" | "owner" | "viewer";
  full_name?: string;
}

interface DocumentItem {
  id: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  created_at: string;
  owner_id: string;
}

interface AuditLogItem {
  id: number;
  event_id: string;
  actor_email: string;
  actor_role: string;
  action: string;
  outcome: string;
  current_hash: string;
  previous_hash: string;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"documents" | "audit" | "upload" | "members">("documents");

  // Documents state
  const [ownedDocs, setOwnedDocs] = useState<DocumentItem[]>([]);
  const [sharedDocs, setSharedDocs] = useState<DocumentItem[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Upload state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ success?: boolean; message?: string } | null>(null);

  // Permission grant modal
  const [grantModalDoc, setGrantModalDoc] = useState<DocumentItem | null>(null);
  const [grantEmail, setGrantEmail] = useState("");
  const [grantType, setGrantType] = useState<"read" | "edit">("read");
  const [granting, setGranting] = useState(false);
  const [grantMessage, setGrantMessage] = useState<string | null>(null);

  // Audit state
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [chainIntact, setChainIntact] = useState<boolean | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);

  useEffect(() => {
    const storedToken = localStorage.getItem("trustvault_token");
    const storedUser = localStorage.getItem("trustvault_user");

    if (!storedToken || !storedUser) {
      router.push("/login");
      return;
    }

    setToken(storedToken);
    setUser(JSON.parse(storedUser));
  }, [router]);

  useEffect(() => {
    if (token) {
      const getDocs = async () => {
        setLoadingDocs(true);
        try {
          const res = await fetch("/api/documents", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const data = await res.json();
          if (res.ok) {
            if (data.documents) {
              setOwnedDocs(data.documents);
              setSharedDocs([]);
            } else {
              setOwnedDocs(data.owned || []);
              setSharedDocs(data.shared || []);
            }
          }
        } catch (err) {
          console.error(err);
        } finally {
          setLoadingDocs(false);
        }
      };
      getDocs();
    }
  }, [token]);

  const fetchDocuments = async () => {
    setLoadingDocs(true);
    try {
      const res = await fetch("/api/documents", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        if (data.documents) {
          // Admin view
          setOwnedDocs(data.documents);
          setSharedDocs([]);
        } else {
          setOwnedDocs(data.owned || []);
          setSharedDocs(data.shared || []);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    setUploadStatus(null);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setUploadStatus({ success: true, message: "Document verified & cryptographically vaulted!" });
      setSelectedFile(null);
      fetchDocuments();
      setActiveTab("documents");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload error";
      setUploadStatus({ success: false, message: msg });
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: DocumentItem) => {
    try {
      const res = await fetch(`/api/documents/${doc.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`Access Blocked: ${error.error || "Forbidden"}`);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.original_filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch {
      alert("Download failed");
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Are you sure you want to delete this document?")) return;

    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        fetchDocuments();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to delete");
      }
    } catch {
      alert("Delete request failed");
    }
  };

  const handleGrantPermission = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grantModalDoc) return;
    setGranting(true);
    setGrantMessage(null);

    try {
      const res = await fetch("/api/permissions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId: grantModalDoc.id,
          targetUserEmail: grantEmail,
          permissionType: grantType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Grant failed");
      }

      setGrantMessage(`Granted ${grantType.toUpperCase()} access to ${grantEmail}`);
      setGrantEmail("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Grant error";
      setGrantMessage(`Error: ${msg}`);
    } finally {
      setGranting(false);
    }
  };

  const fetchAuditLogs = async () => {
    setLoadingAudit(true);
    try {
      const res = await fetch("/api/audit", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setAuditLogs(data.logs || []);
        setChainIntact(data.chain_intact);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("trustvault_token");
    localStorage.removeItem("trustvault_user");
    router.push("/login");
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#090B0A] flex items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#B8E6C5]" />
      </div>
    );
  }

  const allFilteredDocs = [...ownedDocs, ...sharedDocs].filter((d) =>
    d.original_filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#090B0A] text-white flex flex-col font-sans selection:bg-[#B8E6C5] selection:text-black">
      {/* Navbar */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between bg-black/60 sticky top-0 z-40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-950/60 border border-[#B8E6C5]/30 text-[#B8E6C5]">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-wider text-white">
              TRUST<span className="text-[#C8A45D]">VAULT</span>
            </h1>
            <p className="text-[10px] tracking-widest text-[#B8E6C5] uppercase font-mono">
              Security Console • {user.role.toUpperCase()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-right">
            <p className="text-xs font-semibold text-white">{user.full_name || user.email}</p>
            <p className="text-[10px] text-zinc-400 font-mono">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 rounded-lg border border-white/10 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 flex flex-col md:flex-row gap-8">
        {/* Sidebar Nav */}
        <aside className="w-full md:w-64 flex flex-col gap-2 shrink-0">
          <button
            onClick={() => setActiveTab("documents")}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all text-left ${
              activeTab === "documents"
                ? "bg-[#B8E6C5] text-black shadow-lg shadow-emerald-950/50"
                : "text-zinc-400 hover:bg-white/5 hover:text-white"
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Documents</span>
          </button>

          {(user.role === "owner" || user.role === "admin") && (
            <button
              onClick={() => setActiveTab("upload")}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all text-left ${
                activeTab === "upload"
                  ? "bg-[#B8E6C5] text-black shadow-lg shadow-emerald-950/50"
                  : "text-zinc-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Upload Vault</span>
            </button>
          )}

          {user.role === "admin" && (
            <>
              <button
                onClick={() => {
                  setActiveTab("audit");
                  fetchAuditLogs();
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all text-left ${
                  activeTab === "audit"
                    ? "bg-[#B8E6C5] text-black shadow-lg shadow-emerald-950/50"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Terminal className="w-4 h-4" />
                <span>Audit Ledger</span>
              </button>
              <button
                onClick={() => setActiveTab("members")}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all text-left ${
                  activeTab === "members"
                    ? "bg-[#B8E6C5] text-black shadow-lg shadow-emerald-950/50"
                    : "text-zinc-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Members</span>
              </button>
            </>
          )}
        </aside>

        {/* Content Area */}
        <main className="flex-1">
          {/* TAB: DOCUMENTS */}
          {activeTab === "documents" && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h2 className="text-xl font-bold">Secure Documents</h2>
                  <p className="text-xs text-zinc-400 font-mono">
                    Zero-Trust Access Protected Files
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Search documents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 rounded-lg bg-zinc-950 border border-white/10 text-xs text-white focus:outline-none focus:border-[#B8E6C5]"
                  />
                </div>
              </div>

              {loadingDocs ? (
                <div className="p-12 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-[#B8E6C5]" />
                </div>
              ) : allFilteredDocs.length === 0 ? (
                <div className="p-12 border border-white/5 rounded-2xl bg-zinc-950/40 text-center">
                  <Lock className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
                  <p className="text-sm text-zinc-400 font-medium">No documents found</p>
                  <p className="text-xs text-zinc-600 mt-1">Upload a file or ask an owner to grant access</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {allFilteredDocs.map((doc) => {
                    const isOwner = doc.owner_id === user.id;
                    return (
                      <div
                        key={doc.id}
                        className="p-5 rounded-xl border border-white/10 bg-zinc-950/60 hover:border-white/20 transition-all flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex justify-between items-start gap-2 mb-2">
                            <span className="text-sm font-semibold truncate text-white">
                              {doc.original_filename}
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded-full font-mono shrink-0 ${
                                isOwner
                                  ? "bg-[#B8E6C5]/20 text-[#B8E6C5] border border-[#B8E6C5]/30"
                                  : "bg-[#C8A45D]/20 text-[#C8A45D] border border-[#C8A45D]/30"
                              }`}
                            >
                              {isOwner ? "OWNER" : "SHARED"}
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500 font-mono">
                            {(doc.file_size / 1024).toFixed(1)} KB • {new Date(doc.created_at).toLocaleDateString()}
                          </p>
                        </div>

                        <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-3">
                          <button
                            onClick={() => handleDownload(doc)}
                            className="inline-flex items-center gap-1.5 text-xs text-[#B8E6C5] hover:underline font-mono"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </button>

                          <div className="flex items-center gap-2">
                            {(isOwner || user.role === "admin") && (
                              <>
                                <button
                                  onClick={() => {
                                    setGrantModalDoc(doc);
                                    setGrantMessage(null);
                                  }}
                                  className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white"
                                  title="Manage Permissions"
                                >
                                  <Share2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(doc.id)}
                                  className="p-1.5 rounded-md hover:bg-red-950/40 text-red-400 hover:text-red-300"
                                  title="Delete Document"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: UPLOAD */}
          {activeTab === "upload" && (
            <div className="max-w-xl mx-auto p-8 rounded-2xl border border-white/10 bg-zinc-950/80">
              <h2 className="text-xl font-bold mb-2">Upload to Vault</h2>
              <p className="text-xs text-zinc-400 mb-6 font-mono">
                Files are cryptographically hashed (SHA-256) and saved to a private storage bucket.
              </p>

              {uploadStatus && (
                <div
                  className={`mb-6 p-4 rounded-xl text-xs flex items-center gap-3 ${
                    uploadStatus.success
                      ? "bg-emerald-950/40 border border-[#B8E6C5]/30 text-[#B8E6C5]"
                      : "bg-red-950/40 border border-red-500/30 text-red-300"
                  }`}
                >
                  {uploadStatus.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0" />
                  )}
                  <span>{uploadStatus.message}</span>
                </div>
              )}

              <form onSubmit={handleUpload} className="space-y-6">
                <div className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center hover:border-[#B8E6C5]/40 transition-colors">
                  <Upload className="w-8 h-8 mx-auto text-zinc-500 mb-2" />
                  <input
                    type="file"
                    required
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="block w-full text-xs text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-[#B8E6C5] file:text-black hover:file:bg-[#a0dcb0] cursor-pointer"
                  />
                  {selectedFile && (
                    <p className="text-xs text-[#B8E6C5] mt-3 font-mono">
                      Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={uploading || !selectedFile}
                  className="w-full py-3 px-4 rounded-lg bg-[#B8E6C5] hover:bg-[#a0dcb0] text-black font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Hashing & Encrypting...</span>
                    </>
                  ) : (
                    <span>Submit to Secure Vault</span>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* TAB: AUDIT (Admin only) */}
          {activeTab === "audit" && user.role === "admin" && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold">SHA-256 Chained Audit Trail</h2>
                  <p className="text-xs text-zinc-400 font-mono">
                    Append-only ledger with cryptographic hash chaining
                  </p>
                </div>
                {chainIntact !== null && (
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-mono border flex items-center gap-1.5 ${
                      chainIntact
                        ? "bg-emerald-950/40 text-[#B8E6C5] border-[#B8E6C5]/30"
                        : "bg-red-950/40 text-red-300 border-red-500/30"
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{chainIntact ? "CHAIN INTACT (VERIFIED)" : "TAMPER DETECTED"}</span>
                  </span>
                )}
              </div>

              {loadingAudit ? (
                <div className="p-12 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-[#B8E6C5]" />
                </div>
              ) : (
                <div className="border border-white/10 rounded-xl overflow-hidden bg-zinc-950">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-black/60 border-b border-white/10 text-zinc-400 uppercase">
                        <tr>
                          <th className="p-3">Event</th>
                          <th className="p-3">Actor</th>
                          <th className="p-3">Action</th>
                          <th className="p-3">Outcome</th>
                          <th className="p-3">Current Block Hash</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {auditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-white/[0.02]">
                            <td className="p-3 text-zinc-400">#{log.id}</td>
                            <td className="p-3 text-white truncate max-w-[150px]">
                              {log.actor_email || "System"}
                            </td>
                            <td className="p-3 text-[#C8A45D]">{log.action}</td>
                            <td className="p-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] ${
                                  log.outcome === "success"
                                    ? "bg-emerald-950 text-[#B8E6C5]"
                                    : "bg-red-950 text-red-300"
                                }`}
                              >
                                {log.outcome.toUpperCase()}
                              </span>
                            </td>
                            <td className="p-3 text-zinc-500 truncate max-w-[200px]" title={log.current_hash}>
                              {log.current_hash}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* TAB: MEMBERS (Admin only) */}
          {activeTab === "members" && user.role === "admin" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">Member Management</h2>
              <p className="text-xs text-zinc-400 font-mono">Manage roles & access status</p>
            </div>
          )}
        </main>
      </div>

      {/* Grant Permission Modal */}
      {grantModalDoc && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md border border-white/10 rounded-2xl bg-zinc-950 p-6 shadow-2xl">
            <h3 className="text-base font-bold mb-1">Grant Access</h3>
            <p className="text-xs text-zinc-400 font-mono mb-4 truncate">
              Doc: {grantModalDoc.original_filename}
            </p>

            {grantMessage && (
              <div className="mb-4 p-3 rounded-lg bg-zinc-900 border border-white/10 text-xs text-white">
                {grantMessage}
              </div>
            )}

            <form onSubmit={handleGrantPermission} className="space-y-4">
              <div>
                <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">User Email</label>
                <input
                  type="email"
                  required
                  placeholder="collaborator@trustvault.io"
                  value={grantEmail}
                  onChange={(e) => setGrantEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black border border-white/10 text-xs text-white focus:outline-none focus:border-[#B8E6C5]"
                />
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-zinc-400 mb-1">Permission Level</label>
                <select
                  value={grantType}
                  onChange={(e) => setGrantType(e.target.value as "read" | "edit")}
                  className="w-full px-3 py-2 rounded-lg bg-black border border-white/10 text-xs text-white focus:outline-none focus:border-[#B8E6C5]"
                >
                  <option value="read">Read-Only (Download & View)</option>
                  <option value="edit">Edit (Modify & View)</option>
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setGrantModalDoc(null)}
                  className="flex-1 py-2 rounded-lg border border-white/10 text-xs text-zinc-400 hover:text-white"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={granting}
                  className="flex-1 py-2 rounded-lg bg-[#B8E6C5] text-black font-semibold text-xs hover:bg-[#a0dcb0]"
                >
                  {granting ? "Granting..." : "Confirm Grant"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
