import React, { useState, useEffect } from 'react';
import { 
  Shield, Lock, FileText, Upload, 
  Search, CheckCircle2, AlertTriangle, LogOut, 
  Eye, Download, RefreshCw, Users, ShieldAlert, History
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'https://characteristic-neck-stages-lap.trycloudflare.com/api';

interface User {
  id: string;
  email: string;
  username: string;
  role: 'admin' | 'owner' | 'viewer';
}

interface Document {
  id: string;
  title: string;
  original_filename: string;
  category: string;
  mime_type: string;
  file_size: number;
  file_hash_sha256: string;
  owner_id: string;
  created_at: string;
  permissions: any[];
}

interface AuditLog {
  id: number;
  uuid_str: string;
  timestamp: string;
  user_id: string | null;
  document_id: string | null;
  action: string;
  previous_hash: string;
  current_hash: string;
  metadata_json: string;
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('tv_token'));
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [chainStatus, setChainStatus] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'vault' | 'audit'>('vault');
  
  // Login form state
  const [loginId, setLoginId] = useState('owner@trustvault.io');
  const [password, setPassword] = useState('OwnerPass2026!');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Upload modal state
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('Legal');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Permission grant state
  const [grantEmail, setGrantEmail] = useState('viewer@trustvault.io');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (token) {
      fetchCurrentUser();
    }
  }, [token]);

  useEffect(() => {
    if (currentUser) {
      loadDocuments();
      if (currentUser.role === 'admin') {
        loadAuditLogs();
        verifyChain();
      }
    }
  }, [currentUser, searchQuery]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username_or_email: loginId, password })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Login failed');
      }
      const data = await res.json();
      localStorage.setItem('tv_token', data.access_token);
      setToken(data.access_token);
      setCurrentUser(data.user);
      setSuccessMsg(`Authenticated as ${data.user.role.toUpperCase()}: ${data.user.username}`);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const user = await res.json();
        setCurrentUser(user);
      } else {
        logout();
      }
    } catch {
      logout();
    }
  };

  const logout = () => {
    localStorage.removeItem('tv_token');
    setToken(null);
    setCurrentUser(null);
    setDocs([]);
    setAuditLogs([]);
  };

  const loadDocuments = async () => {
    try {
      const url = searchQuery 
        ? `${API_BASE}/documents?search=${encodeURIComponent(searchQuery)}`
        : `${API_BASE}/documents`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDocs(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/audit?limit=50`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const verifyChain = async () => {
    try {
      const res = await fetch(`${API_BASE}/audit/verify`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setChainStatus(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;
    setErrorMsg('');
    const form = new FormData();
    form.append('title', uploadTitle);
    form.append('category', uploadCategory);
    form.append('file', uploadFile);

    try {
      const res = await fetch(`${API_BASE}/documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Upload failed');
      }
      setSuccessMsg('Document securely uploaded and hash-recorded.');
      setUploadTitle('');
      setUploadFile(null);
      loadDocuments();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleDownload = async (docId: string, filename: string) => {
    try {
      const res = await fetch(`${API_BASE}/documents/${docId}/download`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('Access denied: Server live-authorization check refused download.');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setSuccessMsg(`Downloaded ${filename} successfully.`);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleGrant = async (docId: string) => {
    try {
      const res = await fetch(`${API_BASE}/documents/${docId}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ grantee_email: grantEmail, can_read: true, can_edit: false })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Grant failed');
      }
      setSuccessMsg(`Access granted to ${grantEmail}`);
      loadDocuments();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleRevoke = async (docId: string, granteeId: string) => {
    try {
      const res = await fetch(`${API_BASE}/documents/${docId}/permissions/${granteeId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Revoke failed');
      }
      setSuccessMsg('Access instantly revoked (zero-millisecond cache latency).');
      loadDocuments();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const quickSwitch = (u: string, p: string) => {
    setLoginId(u);
    setPassword(p);
  };

  return (
    <div className="min-h-screen bg-[#030712] text-zinc-100 flex flex-col font-sans selection:bg-purple-900 selection:text-white">
      {/* Top Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/60 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-purple-900/30">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-white text-lg">TrustVault</span>
              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">RISE 2026</span>
            </div>
            <p className="text-xs text-zinc-400">Zero-Trust Document Sharing & Chained Audit Engine</p>
          </div>
        </div>

        {currentUser ? (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-xs font-medium text-white">{currentUser.username}</div>
              <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 justify-end">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${currentUser.role === 'admin' ? 'bg-amber-400' : currentUser.role === 'owner' ? 'bg-emerald-400' : 'bg-blue-400'}`} />
                {currentUser.role.toUpperCase()}
              </div>
            </div>
            <button 
              onClick={logout} 
              className="px-3 py-1.5 rounded-md border border-zinc-800 hover:bg-zinc-800 text-zinc-300 text-xs flex items-center gap-1.5 transition"
            >
              <LogOut className="h-3.5 w-3.5" /> Logout
            </button>
          </div>
        ) : (
          <div className="text-xs text-zinc-400 flex items-center gap-2">
            <span>Preset Accounts Available</span>
          </div>
        )}
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 flex flex-col gap-6">
        {errorMsg && (
          <div className="p-3.5 rounded-lg bg-red-950/40 border border-red-500/30 text-red-200 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button onClick={() => setErrorMsg('')} className="text-xs text-red-400 hover:underline">Dismiss</button>
          </div>
        )}
        {successMsg && (
          <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-200 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button onClick={() => setSuccessMsg('')} className="text-xs text-emerald-400 hover:underline">Dismiss</button>
          </div>
        )}

        {!currentUser ? (
          <div className="max-w-md w-full mx-auto my-auto py-12 flex flex-col gap-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-white">Sign in to TrustVault</h1>
              <p className="text-sm text-zinc-400 mt-1">Select a role to test cross-tenant isolation live.</p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button 
                type="button" 
                onClick={() => quickSwitch('admin@trustvault.io', 'AdminPass2026!')}
                className={`p-2.5 rounded-lg border text-xs text-left transition ${loginId.includes('admin') ? 'bg-purple-950/40 border-purple-500/50 text-white' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
              >
                <div className="font-semibold text-amber-400">Admin</div>
                <div className="text-[10px] text-zinc-500">Supervisory audit</div>
              </button>
              <button 
                type="button" 
                onClick={() => quickSwitch('owner@trustvault.io', 'OwnerPass2026!')}
                className={`p-2.5 rounded-lg border text-xs text-left transition ${loginId.includes('owner') ? 'bg-purple-950/40 border-purple-500/50 text-white' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
              >
                <div className="font-semibold text-emerald-400">Owner</div>
                <div className="text-[10px] text-zinc-500">Upload & grants</div>
              </button>
              <button 
                type="button" 
                onClick={() => quickSwitch('viewer@trustvault.io', 'ViewerPass2026!')}
                className={`p-2.5 rounded-lg border text-xs text-left transition ${loginId.includes('viewer') ? 'bg-purple-950/40 border-purple-500/50 text-white' : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'}`}
              >
                <div className="font-semibold text-blue-400">Viewer</div>
                <div className="text-[10px] text-zinc-500">Read & download</div>
              </button>
            </div>

            <form onSubmit={handleLogin} className="bg-zinc-900/40 border border-zinc-800 p-6 rounded-xl flex flex-col gap-4 shadow-xl">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Username or Email</label>
                <input 
                  type="text" 
                  value={loginId} 
                  onChange={(e) => setLoginId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition" 
                  required 
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Password</label>
                <input 
                  type="password" 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-purple-500 transition" 
                  required 
                />
              </div>
              <button 
                type="submit" 
                className="mt-2 w-full py-2.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-medium text-sm transition shadow-lg shadow-purple-950/50"
              >
                Authenticate & Enter Vault
              </button>
            </form>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setActiveTab('vault')}
                  className={`px-4 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2 ${activeTab === 'vault' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'}`}
                >
                  <FileText className="h-4 w-4" /> Vault Documents ({docs.length})
                </button>
                {currentUser.role === 'admin' && (
                  <button 
                    onClick={() => { setActiveTab('audit'); loadAuditLogs(); verifyChain(); }}
                    className={`px-4 py-2 rounded-lg text-xs font-medium transition flex items-center gap-2 ${activeTab === 'audit' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'}`}
                  >
                    <History className="h-4 w-4" /> Chained Audit Trail
                  </button>
                )}
              </div>

              {activeTab === 'vault' && (
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
                    <input 
                      type="text" 
                      placeholder="Search vault..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 w-52"
                    />
                  </div>
                  <button 
                    onClick={loadDocuments} 
                    className="p-2 rounded-lg border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
                    title="Refresh"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {activeTab === 'vault' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 flex flex-col gap-4">
                  {docs.length === 0 ? (
                    <div className="p-12 text-center border border-dashed border-zinc-800 rounded-xl bg-zinc-950/30">
                      <Lock className="h-8 w-8 text-zinc-600 mx-auto mb-3" />
                      <h3 className="text-sm font-semibold text-zinc-300">No Documents Visible</h3>
                      <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                        Either no documents exist, or your account lacks explicit permission grants for existing vault files.
                      </p>
                    </div>
                  ) : (
                    docs.map((doc) => (
                      <div key={doc.id} className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/30 hover:border-zinc-700 transition flex flex-col gap-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white text-sm">{doc.title}</span>
                              <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                {doc.category}
                              </span>
                            </div>
                            <div className="text-xs text-zinc-400 mt-1 flex items-center gap-3">
                              <span>File: {doc.original_filename}</span>
                              <span>•</span>
                              <span>{(doc.file_size / 1024).toFixed(1)} KB</span>
                              <span>•</span>
                              <span className="font-mono text-[10px] text-zinc-500">SHA: {doc.file_hash_sha256.substring(0, 8)}...</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => handleDownload(doc.id, doc.original_filename)}
                              className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium flex items-center gap-1.5 transition shadow"
                            >
                              <Download className="h-3.5 w-3.5" /> Download
                            </button>
                          </div>
                        </div>

                        {(currentUser.role === 'admin' || currentUser.id === doc.owner_id) && (
                          <div className="mt-2 pt-3 border-t border-zinc-800/60 flex flex-col gap-2">
                            <div className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5 text-purple-400" /> Active Permissions:
                            </div>
                            
                            <div className="flex flex-wrap gap-2 items-center">
                              {doc.permissions?.filter(p => p.is_active).length === 0 ? (
                                <span className="text-[11px] text-zinc-500 italic">No external grants active.</span>
                              ) : (
                                doc.permissions?.filter(p => p.is_active).map(p => (
                                  <div key={p.id} className="text-xs px-2.5 py-1 rounded bg-zinc-800 text-zinc-200 border border-zinc-700 flex items-center gap-2">
                                    <span>{p.grantee_username || p.grantee_email}</span>
                                    <button 
                                      onClick={() => handleRevoke(doc.id, p.grantee_id)}
                                      className="text-red-400 hover:text-red-300 ml-1 font-bold"
                                      title="Instantly Revoke"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))
                              )}

                              <div className="flex items-center gap-1.5 ml-auto">
                                <input 
                                  type="email" 
                                  placeholder="grantee email..." 
                                  defaultValue="viewer@trustvault.io"
                                  id={`grant-${doc.id}`}
                                  className="px-2 py-1 bg-zinc-950 border border-zinc-800 rounded text-xs text-white placeholder-zinc-600 w-40"
                                />
                                <button 
                                  onClick={() => {
                                    const val = (document.getElementById(`grant-${doc.id}`) as HTMLInputElement)?.value;
                                    if (val) {
                                      setGrantEmail(val);
                                      handleGrant(doc.id);
                                    }
                                  }}
                                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 font-medium"
                                >
                                  + Grant
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="flex flex-col gap-4">
                  {(currentUser.role === 'admin' || currentUser.role === 'owner') ? (
                    <form onSubmit={handleUpload} className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col gap-3 shadow-lg">
                      <div className="flex items-center gap-2 font-semibold text-sm text-white">
                        <Upload className="h-4 w-4 text-purple-400" />
                        <span>Upload to Vault</span>
                      </div>
                      <p className="text-xs text-zinc-400">
                        Files undergo strict magic-byte inspection. Executables disguised as documents are rejected.
                      </p>

                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Document Title</label>
                        <input 
                          type="text" 
                          value={uploadTitle}
                          onChange={(e) => setUploadTitle(e.target.value)}
                          placeholder="e.g. Master Services Agreement"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Category</label>
                        <select 
                          value={uploadCategory}
                          onChange={(e) => setUploadCategory(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500"
                        >
                          <option value="Legal">Legal & Contracts</option>
                          <option value="Finance">Finance & Payroll</option>
                          <option value="Technical">Technical Specifications</option>
                          <option value="General">General Confidential</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Binary File</label>
                        <input 
                          type="file" 
                          onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                          className="w-full text-xs text-zinc-400 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-medium file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 cursor-pointer"
                          required
                        />
                      </div>

                      <button 
                        type="submit" 
                        className="mt-2 w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-medium text-xs transition shadow"
                      >
                        Commit to TrustVault
                      </button>
                    </form>
                  ) : (
                    <div className="p-5 rounded-xl border border-zinc-800/60 bg-zinc-900/20 text-center">
                      <Eye className="h-6 w-6 text-zinc-500 mx-auto mb-2" />
                      <div className="text-xs font-semibold text-zinc-300">Viewer Mode</div>
                      <div className="text-[11px] text-zinc-500 mt-1">
                        Viewers can read and download permitted files. Uploading requires Document Owner or Admin privileges.
                      </div>
                    </div>
                  )}

                  <div className="p-4 rounded-xl border border-zinc-800/60 bg-zinc-950/40 text-xs text-zinc-400 flex flex-col gap-2">
                    <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-emerald-400" /> Non-Negotiable Guarantees
                    </span>
                    <ul className="list-disc pl-4 space-y-1 text-[11px] text-zinc-400">
                      <li>Server verifies DB authority on every byte streamed.</li>
                      <li>Instant Revocation terminates access in 0ms.</li>
                      <li>Every event is cryptographically hashed with SHA-256.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="flex flex-col gap-4">
                {chainStatus && (
                  <div className={`p-4 rounded-xl border flex items-center justify-between ${chainStatus.status === 'valid' ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-200' : 'bg-red-950/20 border-red-500/40 text-red-200'}`}>
                    <div className="flex items-center gap-3">
                      {chainStatus.status === 'valid' ? (
                        <CheckCircle2 className="h-6 w-6 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="h-6 w-6 text-red-400 shrink-0" />
                      )}
                      <div>
                        <div className="font-semibold text-sm">
                          {chainStatus.status === 'valid' ? 'Audit Chain Intact & Verified' : 'Cryptographic Tampering Detected!'}
                        </div>
                        <div className="text-xs opacity-80">{chainStatus.message || chainStatus.reason}</div>
                      </div>
                    </div>

                    <button 
                      onClick={verifyChain} 
                      className="px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900/60 text-xs font-medium text-white hover:bg-zinc-800 transition"
                    >
                      Re-verify Chain
                    </button>
                  </div>
                )}

                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 overflow-hidden shadow-xl">
                  <div className="p-3.5 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/40">
                    <span className="text-xs font-semibold text-white">Chained Event Log ({auditLogs.length} events)</span>
                    <span className="text-[10px] text-zinc-400 font-mono">SHA-256 Hash Linked</span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-900/60 text-zinc-400 text-[11px] uppercase tracking-wider border-b border-zinc-800">
                        <tr>
                          <th className="py-2.5 px-4">#</th>
                          <th className="py-2.5 px-4">Action</th>
                          <th className="py-2.5 px-4">Timestamp (UTC)</th>
                          <th className="py-2.5 px-4">Metadata</th>
                          <th className="py-2.5 px-4">Previous Block Hash</th>
                          <th className="py-2.5 px-4">Signature Hash</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                        {auditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-zinc-900/30 font-mono text-[11px]">
                            <td className="py-2 px-4 text-zinc-500">{log.id}</td>
                            <td className="py-2 px-4 font-sans font-semibold">
                              <span className={`px-2 py-0.5 rounded text-[10px] ${log.action.includes('DENIED') ? 'bg-red-500/20 text-red-400' : log.action.includes('REVOKE') ? 'bg-amber-500/20 text-amber-400' : 'bg-purple-500/20 text-purple-300'}`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="py-2 px-4 text-zinc-400">{new Date(log.timestamp).toLocaleString()}</td>
                            <td className="py-2 px-4 text-zinc-400 max-w-xs truncate">{log.metadata_json}</td>
                            <td className="py-2 px-4 text-zinc-500 truncate max-w-[120px]" title={log.previous_hash}>{log.previous_hash.substring(0, 12)}...</td>
                            <td className="py-2 px-4 text-emerald-400 truncate max-w-[120px]" title={log.current_hash}>{log.current_hash.substring(0, 12)}...</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-800/80 bg-zinc-950/40 p-4 text-center text-xs text-zinc-500">
        TrustVault Platform • Snovasys Fresher Hiring Challenge 2026 • Verified Zero-Trust & Chained Audit
      </footer>
    </div>
  );
}
