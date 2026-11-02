import React, { useState, useEffect, useMemo } from 'react';
import { 
  Shield, Lock, FileText, Download, Trash2, 
  RefreshCw, CheckCircle2, AlertTriangle, Eye, Upload, 
  Users, Key, Search, Edit2, 
  Database, UserCheck, Activity, Check, X, User as UserIcon,
  ChevronLeft, ChevronRight, Copy, RotateCcw, SlidersHorizontal,
  Menu
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

interface User {
  id: string;
  email: string;
  username: string;
  role: 'admin' | 'owner' | 'viewer';
}

interface DocumentPermission {
  id: string;
  document_id: string;
  grantee_id: string;
  grantee_username: string;
  grantee_email: string;
  can_read: boolean;
  can_edit: boolean;
  is_active: boolean;
}

interface Document {
  id: string;
  title: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  file_hash_sha256: string;
  category: string;
  owner_id: string;
  owner_username?: string;
  created_at: string;
  permissions: DocumentPermission[];
}

interface AuditLog {
  id: number;
  uuid_str: string;
  timestamp: string;
  user_id: string | null;
  document_id: string | null;
  action: string;
  metadata_json: string;
  previous_hash: string;
  current_hash: string;
}

interface SystemMetrics {
  total_documents: number;
  total_users: number;
  active_permissions: number;
  total_audit_events: number;
  chain_status?: string;
  chain_integrity?: {
    status: string;
    total_records: number;
    message: string;
  };
}

export function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('tv_token'));
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Auth State
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginId, setLoginId] = useState('admin@trustvault.io');
  const [password, setPassword] = useState('AdminPass2026!');
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState<'admin' | 'owner' | 'viewer'>('viewer');
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);

  // Navigation & Layout
  const [activeTab, setActiveTab] = useState<'vault' | 'audit'>('vault');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Vault State
  const [docs, setDocs] = useState<Document[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [chainStatus, setChainStatus] = useState<any>(null);
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [isVerifyingChain, setIsVerifyingChain] = useState(false);

  // Toast Notifications
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterOwner, setFilterOwner] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Document Pagination State
  const [docPage, setDocPage] = useState(1);
  const [docPageSize, setDocPageSize] = useState(5);

  // Audit Filter & Pagination State
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');
  const [auditPage, setAuditPage] = useState(1);
  const auditPageSize = 10;

  // Upload Form State
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadCategory, setUploadCategory] = useState('Legal');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Modal States
  const [editingDoc, setEditingDoc] = useState<Document | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [deletingDoc, setDeletingDoc] = useState<Document | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [copiedId, setCopiedId] = useState(false);

  // In-line Grant Permission State
  const [grantEmail, setGrantEmail] = useState('');
  const [grantCanEdit, setGrantCanEdit] = useState(false);
  const [grantingDocId, setGrantingDocId] = useState<string | null>(null);
  const [isSavingGrant, setIsSavingGrant] = useState(false);
  const [revokingPermId, setRevokingPermId] = useState<string | null>(null);
  const [downloadingDocId, setDownloadingDocId] = useState<string | null>(null);

  // Initial token load
  useEffect(() => {
    if (token) {
      fetchCurrentUser();
    }
  }, [token]);

  // Document & metrics re-fetch trigger
  useEffect(() => {
    if (currentUser) {
      loadDocuments();
      if (currentUser.role === 'admin') {
        loadAuditLogs();
        verifyChain();
        loadMetrics();
      }
    }
  }, [currentUser, searchQuery, filterCategory, filterOwner, filterDateFrom, filterDateTo, sortBy]);

  // Reset pagination on filter change
  useEffect(() => {
    setDocPage(1);
  }, [searchQuery, filterCategory, filterOwner, filterDateFrom, filterDateTo, sortBy]);

  useEffect(() => {
    setAuditPage(1);
  }, [auditActionFilter]);

  // Keyboard accessibility: Escape key closes active modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingDoc) setEditingDoc(null);
        if (deletingDoc) setDeletingDoc(null);
        if (showProfileModal) setShowProfileModal(false);
        if (grantingDocId) setGrantingDocId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editingDoc, deletingDoc, showProfileModal, grantingDocId]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingAuth) return;
    setErrorMsg('');
    setIsSubmittingAuth(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username_or_email: loginId.trim(), password })
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Server returned non-JSON response (${res.status}): ${text.substring(0, 100)}`);
      }
      if (!res.ok) {
        throw new Error(data.detail || `Login failed (${res.status})`);
      }
      localStorage.setItem('tv_token', data.access_token);
      setToken(data.access_token);
      setCurrentUser(data.user);
      setSuccessMsg(`Authenticated as ${data.user.role.toUpperCase()}: ${data.user.username}`);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingAuth) return;
    if (!regUsername.trim() || !regEmail.trim() || !regPassword) {
      setErrorMsg('All fields are required for registration.');
      return;
    }
    setErrorMsg('');
    setIsSubmittingAuth(true);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: regUsername.trim(),
          email: regEmail.trim(),
          password: regPassword,
          role: regRole
        })
      });
      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(`Server returned non-JSON response (${res.status})`);
      }
      if (!res.ok) {
        throw new Error(data.detail || `Registration failed (${res.status})`);
      }
      setSuccessMsg(`Account created for ${data.username}! You can now sign in.`);
      setAuthMode('login');
      setLoginId(data.email);
      setPassword(regPassword);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const fetchCurrentUser = async () => {
    try {
      const activeToken = token || localStorage.getItem('tv_token');
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${activeToken}` }
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

  const logout = async () => {
    const activeToken = token || localStorage.getItem('tv_token');
    if (activeToken) {
      try {
        await fetch(`${API_BASE}/auth/logout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${activeToken}` }
        });
      } catch {
        // Network errors on logout tolerated
      }
    }
    localStorage.removeItem('tv_token');
    setToken(null);
    setCurrentUser(null);
    setDocs([]);
    setAuditLogs([]);
    setMetrics(null);
    setActiveTab('vault');
    setSuccessMsg('');
    setErrorMsg('');
    setShowProfileModal(false);
    setEditingDoc(null);
    setDeletingDoc(null);
    setMobileMenuOpen(false);
  };

  const loadDocuments = async () => {
    setIsLoadingDocs(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (filterCategory) params.append('category', filterCategory);
      if (filterOwner.trim()) params.append('owner', filterOwner.trim());
      if (filterDateFrom) params.append('date_from', filterDateFrom);
      if (filterDateTo) params.append('date_to', filterDateTo);
      if (sortBy) params.append('sort_by', sortBy);

      const url = params.toString() 
        ? `${API_BASE}/documents?${params.toString()}`
        : `${API_BASE}/documents`;

      const activeToken = token || localStorage.getItem('tv_token');
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDocs(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  const loadAuditLogs = async () => {
    setIsLoadingAudit(true);
    try {
      const activeToken = token || localStorage.getItem('tv_token');
      let url = `${API_BASE}/audit?limit=200`;
      if (auditActionFilter !== 'ALL') {
        url += `&action=${encodeURIComponent(auditActionFilter)}`;
      }
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const verifyChain = async () => {
    setIsVerifyingChain(true);
    try {
      const activeToken = token || localStorage.getItem('tv_token');
      const res = await fetch(`${API_BASE}/audit/verify`, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setChainStatus(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsVerifyingChain(false);
    }
  };

  const loadMetrics = async () => {
    try {
      const activeToken = token || localStorage.getItem('tv_token');
      const res = await fetch(`${API_BASE}/audit/metrics`, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploading) return;
    if (!uploadFile) {
      setErrorMsg('Please select a file to upload.');
      return;
    }
    setErrorMsg('');
    setIsUploading(true);

    const formData = new FormData();
    formData.append('title', uploadTitle);
    formData.append('category', uploadCategory);
    formData.append('file', uploadFile);

    try {
      const activeToken = token || localStorage.getItem('tv_token');
      const res = await fetch(`${API_BASE}/documents/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${activeToken}` },
        body: formData
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Upload failed');
      }
      setSuccessMsg(`Document '${data.title}' safely committed to vault.`);
      setUploadTitle('');
      setUploadFile(null);
      const fileInput = document.getElementById('upload-file-input') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      await loadDocuments();
      if (currentUser?.role === 'admin') {
        loadMetrics();
        loadAuditLogs();
        verifyChain();
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const resetUploadForm = () => {
    setUploadTitle('');
    setUploadCategory('Legal');
    setUploadFile(null);
    const fileInput = document.getElementById('upload-file-input') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const handleDownload = async (docId: string, filename: string) => {
    if (downloadingDocId) return;
    setErrorMsg('');
    setDownloadingDocId(docId);
    try {
      const activeToken = token || localStorage.getItem('tv_token');
      const res = await fetch(`${API_BASE}/documents/${docId}/download`, {
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Access denied: Server live-authorization check refused download.');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setSuccessMsg(`Streaming download authorized: ${filename}`);
      if (currentUser?.role === 'admin') {
        loadAuditLogs();
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setDownloadingDocId(null);
    }
  };

  const openEditModal = (doc: Document) => {
    setEditingDoc(doc);
    setEditTitle(doc.title);
    setEditCategory(doc.category);
  };

  const handleUpdateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDoc || isSavingEdit) return;
    if (!editTitle.trim()) {
      setErrorMsg('Document title cannot be empty.');
      return;
    }
    setErrorMsg('');
    setIsSavingEdit(true);
    try {
      const activeToken = token || localStorage.getItem('tv_token');
      const res = await fetch(`${API_BASE}/documents/${editingDoc.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          title: editTitle.trim(),
          category: editCategory
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to update document metadata');
      }
      setSuccessMsg(`Document metadata updated: '${data.title}'`);
      setEditingDoc(null);
      await loadDocuments();
      if (currentUser?.role === 'admin') {
        loadAuditLogs();
        verifyChain();
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const executeDeleteDocument = async (doc: Document) => {
    if (isDeleting) return;
    setErrorMsg('');
    setIsDeleting(true);
    try {
      const activeToken = token || localStorage.getItem('tv_token');
      const res = await fetch(`${API_BASE}/documents/${doc.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to delete document');
      }
      setSuccessMsg(`Document '${doc.title}' permanently deleted from vault.`);
      setDeletingDoc(null);
      await loadDocuments();
      if (currentUser?.role === 'admin') {
        loadMetrics();
        loadAuditLogs();
        verifyChain();
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleGrant = async (docId: string) => {
    if (isSavingGrant) return;
    if (!grantEmail.trim()) {
      setErrorMsg('Please specify a valid grantee username or email.');
      return;
    }
    setErrorMsg('');
    setIsSavingGrant(true);
    try {
      const activeToken = token || localStorage.getItem('tv_token');
      const res = await fetch(`${API_BASE}/documents/${docId}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          grantee_email: grantEmail.trim(),
          can_edit: grantCanEdit
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to grant permission');
      }
      setSuccessMsg(`Access granted to ${grantEmail} (${grantCanEdit ? 'Read & Edit' : 'Read-Only'})`);
      setGrantingDocId(null);
      setGrantEmail('');
      setGrantCanEdit(false);
      await loadDocuments();
      if (currentUser?.role === 'admin') {
        loadMetrics();
        loadAuditLogs();
        verifyChain();
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsSavingGrant(false);
    }
  };

  const handleRevoke = async (docId: string, granteeId: string) => {
    if (revokingPermId) return;
    setErrorMsg('');
    setRevokingPermId(granteeId);
    try {
      const activeToken = token || localStorage.getItem('tv_token');
      const res = await fetch(`${API_BASE}/documents/${docId}/permissions/${granteeId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${activeToken}` }
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Failed to revoke access');
      }
      setSuccessMsg('Access instantly revoked in 0ms.');
      await loadDocuments();
      if (currentUser?.role === 'admin') {
        loadMetrics();
        loadAuditLogs();
        verifyChain();
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setRevokingPermId(null);
    }
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setFilterCategory('');
    setFilterOwner('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSortBy('newest');
  };

  const quickSwitch = (id: string, pass: string) => {
    setLoginId(id);
    setPassword(pass);
    setAuthMode('login');
    setErrorMsg('');
  };

  const copyUserId = () => {
    if (currentUser?.id) {
      navigator.clipboard.writeText(currentUser.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    }
  };

  // Pagination computations
  const paginatedDocs = useMemo(() => {
    const start = (docPage - 1) * docPageSize;
    return docs.slice(start, start + docPageSize);
  }, [docs, docPage, docPageSize]);
  const totalDocPages = Math.max(1, Math.ceil(docs.length / docPageSize));

  const paginatedAuditLogs = useMemo(() => {
    const start = (auditPage - 1) * auditPageSize;
    return auditLogs.slice(start, start + auditPageSize);
  }, [auditLogs, auditPage, auditPageSize]);
  const totalAuditPages = Math.max(1, Math.ceil(auditLogs.length / auditPageSize));

  const activeFilterCount = (filterCategory ? 1 : 0) + (filterOwner ? 1 : 0) + (filterDateFrom ? 1 : 0) + (filterDateTo ? 1 : 0);

  return (
    <div className="min-h-screen bg-black text-zinc-100 flex flex-col font-sans selection:bg-purple-600 selection:text-white overflow-x-hidden">
      {/* Header */}
      <header className="border-b border-zinc-800/80 bg-zinc-950/70 backdrop-blur sticky top-0 z-30 px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 overflow-x-hidden">
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <div className="h-8 w-8 sm:h-9 sm:w-9 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.2)] shrink-0">
            <Shield className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span className="font-bold tracking-tight text-white text-sm sm:text-base">TrustVault</span>
              <span className="text-[9px] sm:text-[10px] font-mono px-1 sm:px-1.5 py-0.2 sm:py-0.5 rounded bg-zinc-800 border border-zinc-700 text-purple-300 font-semibold hidden xs:inline-block">
                ZERO-TRUST
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-medium hidden md:block">Cryptographically Verified Document Governance</p>
          </div>
        </div>

        {currentUser ? (
          <div className="flex items-center gap-3">
            {/* Desktop Profile trigger chip */}
            <button 
              id="header-profile-btn"
              onClick={() => setShowProfileModal(true)}
              className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800/80 hover:border-zinc-700 transition text-left cursor-pointer"
              title="View Profile & Session Details"
            >
              <div className="h-6 w-6 rounded-full bg-purple-600/30 border border-purple-500/30 flex items-center justify-center text-purple-300 text-xs font-semibold">
                {currentUser.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-xs font-medium text-white flex items-center gap-1.5">
                  {currentUser.username}
                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase ${currentUser.role === 'admin' ? 'bg-red-500/20 text-red-300 border border-red-500/30' : currentUser.role === 'owner' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'}`}>
                    {currentUser.role}
                  </span>
                </div>
                <div className="text-[10px] text-zinc-400 truncate max-w-[130px]">{currentUser.email}</div>
              </div>
            </button>

            {/* Logout button */}
            <button
              id="header-logout-btn"
              onClick={logout}
              className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-red-950/40 hover:border-red-900/50 hover:text-red-300 text-zinc-400 text-xs font-medium transition cursor-pointer"
            >
              Logout
            </button>

            {/* Mobile menu trigger */}
            <button
              id="mobile-menu-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white md:hidden cursor-pointer"
              title="Toggle Menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 sm:gap-2 text-xs shrink-0">
            <span className="text-zinc-500 mr-1 hidden sm:inline">Persona:</span>
            <button 
              id="quick-admin-btn"
              onClick={() => quickSwitch('admin@trustvault.io', 'AdminPass2026!')}
              className="px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700 text-[11px] sm:text-xs transition cursor-pointer"
            >
              Admin
            </button>
            <button 
              id="quick-owner-btn"
              onClick={() => quickSwitch('owner@trustvault.io', 'OwnerPass2026!')}
              className="px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700 text-[11px] sm:text-xs transition cursor-pointer"
            >
              Owner
            </button>
            <button 
              id="quick-viewer-btn"
              onClick={() => quickSwitch('viewer@trustvault.io', 'ViewerPass2026!')}
              className="px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:border-zinc-700 text-[11px] sm:text-xs transition cursor-pointer"
            >
              Viewer
            </button>
          </div>
        )}
      </header>

      {/* Mobile Drawer (Responsive Navigation) */}
      {currentUser && mobileMenuOpen && (
        <div className="md:hidden border-b border-zinc-800 bg-zinc-950 px-4 py-3 flex flex-col gap-3 animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-900">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-purple-600/30 flex items-center justify-center text-purple-300 text-xs font-semibold">
                {currentUser.username.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-medium text-white">{currentUser.username}</span>
              <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold uppercase ${currentUser.role === 'admin' ? 'bg-red-500/20 text-red-300' : currentUser.role === 'owner' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-blue-500/20 text-blue-300'}`}>
                {currentUser.role}
              </span>
            </div>
            <button 
              id="mobile-profile-btn"
              onClick={() => { setShowProfileModal(true); setMobileMenuOpen(false); }}
              className="text-xs text-purple-400 hover:underline cursor-pointer"
            >
              Profile
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            <button
              id="mobile-nav-vault"
              onClick={() => { setActiveTab('vault'); setMobileMenuOpen(false); }}
              className={`w-full py-2 px-3 rounded-lg text-left text-xs font-medium flex items-center justify-between ${activeTab === 'vault' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:bg-zinc-900'}`}
            >
              <span className="flex items-center gap-2"><FileText className="h-4 w-4" /> Vault Documents</span>
              <span className="text-[10px] px-1.5 py-0.2 bg-black/40 rounded-full">{docs.length}</span>
            </button>
            {currentUser.role === 'admin' && (
              <button
                id="mobile-nav-audit"
                onClick={() => { setActiveTab('audit'); loadAuditLogs(); verifyChain(); setMobileMenuOpen(false); }}
                className={`w-full py-2 px-3 rounded-lg text-left text-xs font-medium flex items-center justify-between ${activeTab === 'audit' ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:bg-zinc-900'}`}
              >
                <span className="flex items-center gap-2"><Shield className="h-4 w-4" /> Chained Audit Trail</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-black/40 rounded-full">{auditLogs.length}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Global Toast Banners */}
      <div className="px-4 sm:px-6 pt-3 flex flex-col gap-2 max-w-7xl mx-auto w-full">
        {errorMsg && (
          <div id="error-toast-banner" className="p-3 rounded-lg bg-red-950/40 border border-red-500/40 text-red-200 text-xs flex items-center justify-between shadow-lg animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button 
              id="dismiss-error-btn"
              onClick={() => setErrorMsg('')} 
              className="p-1 text-red-400 hover:text-red-200 transition cursor-pointer"
              title="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {successMsg && (
          <div id="success-toast-banner" className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs flex items-center justify-between shadow-lg animate-in fade-in">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
            <button 
              id="dismiss-success-btn"
              onClick={() => setSuccessMsg('')} 
              className="p-1 text-emerald-400 hover:text-emerald-200 transition cursor-pointer"
              title="Dismiss notification"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {!currentUser ? (
          <div className="max-w-md mx-auto mt-6 sm:mt-8 p-6 rounded-2xl border border-zinc-800/80 bg-zinc-950/60 backdrop-blur shadow-2xl">
            {/* Auth Tab Switcher */}
            <div className="flex rounded-lg bg-zinc-900/80 p-1 mb-6 border border-zinc-800">
              <button
                id="tab-login-btn"
                onClick={() => { setAuthMode('login'); setErrorMsg(''); }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${authMode === 'login' ? 'bg-purple-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
              >
                Sign In
              </button>
              <button
                id="tab-register-btn"
                onClick={() => { setAuthMode('register'); setErrorMsg(''); }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition cursor-pointer ${authMode === 'register' ? 'bg-purple-600 text-white shadow' : 'text-zinc-400 hover:text-white'}`}
              >
                Register Account
              </button>
            </div>

            {authMode === 'login' ? (
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Username or Email</label>
                  <input
                    id="login-id-input"
                    type="text"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="admin@trustvault.io"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-purple-500 transition"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Password</label>
                  <input
                    id="login-password-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-purple-500 transition"
                    required
                  />
                </div>

                <button
                  id="login-submit-btn"
                  type="submit"
                  disabled={isSubmittingAuth}
                  className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold text-xs tracking-wide shadow-lg shadow-purple-600/20 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSubmittingAuth ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Authenticating...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="h-3.5 w-3.5" />
                      <span>Authenticate & Enter Vault</span>
                    </>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Username</label>
                  <input
                    id="reg-username-input"
                    type="text"
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder="e.g. charlie_auditor"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-purple-500 transition"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Email Address</label>
                  <input
                    id="reg-email-input"
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="charlie@trustvault.io"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-purple-500 transition"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Password</label>
                  <input
                    id="reg-password-input"
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Min 8 characters"
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-purple-500 transition"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1.5">Account Role</label>
                  <select
                    id="reg-role-select"
                    value={regRole}
                    onChange={(e: any) => setRegRole(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-sm text-white focus:outline-none focus:border-purple-500 transition cursor-pointer"
                  >
                    <option value="viewer">Viewer (Read permitted documents)</option>
                    <option value="owner">Owner (Upload and govern documents)</option>
                    <option value="admin">Administrator (System supervisor & audit)</option>
                  </select>
                </div>

                <button
                  id="reg-submit-btn"
                  type="submit"
                  disabled={isSubmittingAuth}
                  className="w-full py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-semibold text-xs tracking-wide shadow-lg shadow-purple-600/20 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {isSubmittingAuth ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-3.5 w-3.5" />
                      <span>Create Account</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Top Stat Cards (Admin Only) */}
            {currentUser.role === 'admin' && metrics && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/60 shadow flex flex-col gap-1">
                  <div className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
                    <Database className="h-3.5 w-3.5 text-purple-400" /> Total Documents
                  </div>
                  <div className="text-xl font-bold text-white">{metrics.total_documents}</div>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/60 shadow flex flex-col gap-1">
                  <div className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-blue-400" /> Registered Users
                  </div>
                  <div className="text-xl font-bold text-white">{metrics.total_users}</div>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/60 shadow flex flex-col gap-1">
                  <div className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
                    <Key className="h-3.5 w-3.5 text-emerald-400" /> Active Grants
                  </div>
                  <div className="text-xl font-bold text-white">{metrics.active_permissions}</div>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/60 shadow flex flex-col gap-1">
                  <div className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-amber-400" /> Audit Events
                  </div>
                  <div className="text-xl font-bold text-white">{metrics.total_audit_events}</div>
                </div>

                <div className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/60 shadow flex flex-col gap-1 col-span-2 md:col-span-1">
                  <div className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
                    <Shield className="h-3.5 w-3.5 text-purple-400" /> Chain Integrity
                  </div>
                  <div className={`text-sm font-bold flex items-center gap-1.5 mt-1 ${(metrics.chain_integrity?.status || 'valid') === 'valid' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(metrics.chain_integrity?.status || 'valid') === 'valid' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    {(metrics.chain_integrity?.status || 'valid').toUpperCase()}
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Tabs Bar */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <button
                  id="nav-tab-vault"
                  onClick={() => setActiveTab('vault')}
                  className={`px-4 py-2 rounded-lg font-medium text-xs flex items-center gap-2 transition cursor-pointer ${activeTab === 'vault' ? 'bg-purple-600 text-white shadow' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'}`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Vault Documents</span>
                  <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 text-zinc-300">
                    {docs.length}
                  </span>
                </button>

                {currentUser.role === 'admin' && (
                  <button
                    id="nav-tab-audit"
                    onClick={() => { setActiveTab('audit'); loadAuditLogs(); verifyChain(); }}
                    className={`px-4 py-2 rounded-lg font-medium text-xs flex items-center gap-2 transition cursor-pointer ${activeTab === 'audit' ? 'bg-purple-600 text-white shadow' : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'}`}
                  >
                    <Shield className="h-3.5 w-3.5" />
                    <span>Chained Audit Trail</span>
                    <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 text-zinc-300">
                      {auditLogs.length}
                    </span>
                  </button>
                )}
              </div>

              {activeTab === 'audit' && (
                <button
                  id="back-to-vault-btn"
                  onClick={() => setActiveTab('vault')}
                  className="px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium flex items-center gap-1.5 transition cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Back to Documents</span>
                </button>
              )}
            </div>

            {/* Tab 1: Vault Documents */}
            {activeTab === 'vault' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* Left 2 Cols: Documents List & Filters */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                  {/* Toolbar & Search Bar */}
                  <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-950/60 shadow flex flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Search Input with inline clear */}
                      <div className="relative flex-1 min-w-[180px]">
                        <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-zinc-500" />
                        <input
                          id="search-input"
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search title or filename..."
                          className="w-full pl-8 pr-8 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 transition"
                        />
                        {searchQuery && (
                          <button
                            id="clear-search-btn"
                            onClick={() => setSearchQuery('')}
                            className="absolute right-2.5 top-2.5 text-zinc-500 hover:text-white transition cursor-pointer"
                            title="Clear search"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Category Filter */}
                      <select
                        id="filter-category-select"
                        value={filterCategory}
                        onChange={(e) => setFilterCategory(e.target.value)}
                        className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-purple-500 transition cursor-pointer"
                      >
                        <option value="">All Categories</option>
                        <option value="Legal">Legal</option>
                        <option value="Finance">Finance</option>
                        <option value="Technical">Technical</option>
                        <option value="General">General</option>
                      </select>

                      {/* Sort Dropdown */}
                      <select
                        id="sort-select"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-purple-500 transition cursor-pointer"
                      >
                        <option value="newest">Sort: Newest</option>
                        <option value="oldest">Sort: Oldest</option>
                        <option value="title_asc">Sort: Title (A-Z)</option>
                        <option value="title_desc">Sort: Title (Z-A)</option>
                        <option value="size_desc">Sort: Size (High)</option>
                        <option value="size_asc">Sort: Size (Low)</option>
                      </select>

                      {/* Advanced Filters Toggle */}
                      <button
                        id="toggle-advanced-filters-btn"
                        onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                        className={`p-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition cursor-pointer ${showAdvancedFilters || activeFilterCount > 0 ? 'bg-purple-600/20 border-purple-500/40 text-purple-300' : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'}`}
                        title="Toggle Advanced Filters"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        {activeFilterCount > 0 && (
                          <span className="h-4 w-4 rounded-full bg-purple-600 text-white text-[9px] font-bold flex items-center justify-center">
                            {activeFilterCount}
                          </span>
                        )}
                      </button>

                      {/* Refresh Button */}
                      <button
                        id="refresh-docs-btn"
                        onClick={loadDocuments}
                        disabled={isLoadingDocs}
                        className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-700 transition cursor-pointer disabled:opacity-50"
                        title="Refresh Documents"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${isLoadingDocs ? 'animate-spin text-purple-400' : ''}`} />
                      </button>
                    </div>

                    {/* Advanced Filter Drawer */}
                    {showAdvancedFilters && (
                      <div className="pt-3 border-t border-zinc-800/80 grid grid-cols-1 sm:grid-cols-3 gap-2.5 animate-in fade-in">
                        <div>
                          <label className="block text-[10px] text-zinc-400 mb-1">Owner Username / Email</label>
                          <input
                            id="filter-owner-input"
                            type="text"
                            value={filterOwner}
                            onChange={(e) => setFilterOwner(e.target.value)}
                            placeholder="e.g. alice_owner"
                            className="w-full px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-zinc-400 mb-1">Date From</label>
                          <input
                            id="filter-date-from-input"
                            type="date"
                            value={filterDateFrom}
                            onChange={(e) => setFilterDateFrom(e.target.value)}
                            className="w-full px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300 focus:outline-none focus:border-purple-500"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] text-zinc-400 mb-1">Date To</label>
                          <input
                            id="filter-date-to-input"
                            type="date"
                            value={filterDateTo}
                            onChange={(e) => setFilterDateTo(e.target.value)}
                            className="w-full px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300 focus:outline-none focus:border-purple-500"
                          />
                        </div>

                        <div className="sm:col-span-3 flex justify-end gap-2 pt-1">
                          <button
                            id="clear-all-filters-btn"
                            onClick={clearAllFilters}
                            className="px-2.5 py-1 rounded bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Clear All Filters</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Documents List */}
                  {docs.length === 0 ? (
                    <div className="p-12 text-center rounded-2xl border border-zinc-800/80 bg-zinc-950/40">
                      <FileText className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
                      <div className="text-sm font-semibold text-zinc-300">No documents found in vault</div>
                      <div className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
                        {searchQuery || filterCategory || filterOwner
                          ? 'No files match your search criteria. Try clearing filters.'
                          : 'Zero-trust governance requires explicit upload or permission grant.'}
                      </div>
                      {(searchQuery || filterCategory || filterOwner) && (
                        <button
                          id="reset-empty-search-btn"
                          onClick={clearAllFilters}
                          className="mt-4 px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 hover:text-white transition cursor-pointer"
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3.5">
                      {paginatedDocs.map((doc) => {
                        const isOwner = currentUser.id === doc.owner_id;
                        const isAdmin = currentUser.role === 'admin';
                        const myPerm = doc.permissions?.find((p) => p.grantee_id === currentUser.id && p.is_active);
                        const canEdit = isAdmin || isOwner || (myPerm && myPerm.can_edit);
                        const canDelete = isAdmin || isOwner;

                        return (
                          <div 
                            key={doc.id} 
                            id={`doc-card-${doc.id}`}
                            className="p-4 rounded-xl border border-zinc-800/80 bg-zinc-900/30 hover:border-zinc-700 transition flex flex-col gap-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-white text-sm">{doc.title}</span>
                                  <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-zinc-800 text-zinc-400">
                                    {doc.category}
                                  </span>
                                  {isOwner && (
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-950/40 border border-emerald-500/30 text-emerald-300">
                                      Owner
                                    </span>
                                  )}
                                  {!isOwner && !isAdmin && myPerm && (
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${myPerm.can_edit ? 'bg-indigo-950/40 border-indigo-500/30 text-indigo-300' : 'bg-blue-950/40 border-blue-500/30 text-blue-300'}`}>
                                      {myPerm.can_edit ? 'Can Read & Edit' : 'Read-Only'}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-zinc-400 mt-1 flex flex-wrap items-center gap-2.5">
                                  <span>File: {doc.original_filename}</span>
                                  <span>•</span>
                                  <span>{(doc.file_size / 1024).toFixed(1)} KB</span>
                                  <span>•</span>
                                  <span>Owner: {doc.owner_username || 'System'}</span>
                                  <span>•</span>
                                  <span className="font-mono text-[10px] text-zinc-500">SHA: {doc.file_hash_sha256.substring(0, 8)}...</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <button 
                                  id={`download-btn-${doc.id}`}
                                  onClick={() => handleDownload(doc.id, doc.original_filename)}
                                  disabled={downloadingDocId === doc.id}
                                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 transition shadow cursor-pointer"
                                  title="Download Document"
                                >
                                  <Download className={`h-3.5 w-3.5 ${downloadingDocId === doc.id ? 'animate-bounce' : ''}`} />
                                  <span>{downloadingDocId === doc.id ? 'Streaming...' : 'Download'}</span>
                                </button>

                                {canEdit && (
                                  <button 
                                    id={`edit-btn-${doc.id}`}
                                    onClick={() => openEditModal(doc)}
                                    className="p-1.5 rounded-lg border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white transition cursor-pointer"
                                    title="Edit Document Metadata"
                                  >
                                    <Edit2 className="h-3.5 w-3.5" />
                                  </button>
                                )}

                                {canDelete && (
                                  <button 
                                    id={`delete-btn-${doc.id}`}
                                    onClick={() => setDeletingDoc(doc)}
                                    className="p-1.5 rounded-lg border border-red-900/40 hover:bg-red-950/40 text-red-400 hover:text-red-300 transition cursor-pointer"
                                    title="Delete Document Permanently"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Active Permissions Section (Admin/Owner) */}
                            {(isAdmin || isOwner) && (
                              <div className="mt-2 pt-3 border-t border-zinc-800/60 flex flex-col gap-2">
                                <div className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1.5">
                                  <Users className="h-3.5 w-3.5 text-purple-400" /> Active Permissions:
                                </div>
                                
                                <div className="flex flex-wrap gap-2 items-center">
                                  {doc.permissions?.filter(p => p.is_active).length === 0 ? (
                                    <span className="text-[11px] text-zinc-500 italic">No external grants active.</span>
                                  ) : (
                                    doc.permissions?.filter(p => p.is_active).map(p => (
                                      <div 
                                        key={p.id} 
                                        id={`perm-chip-${p.id}`}
                                        className="text-xs px-2.5 py-1 rounded bg-zinc-800 text-zinc-200 border border-zinc-700 flex items-center gap-2"
                                      >
                                        <span>{p.grantee_username || p.grantee_email}</span>
                                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${p.can_edit ? 'bg-indigo-500/20 text-indigo-300' : 'bg-blue-500/20 text-blue-300'}`}>
                                          {p.can_edit ? 'Read & Edit' : 'Read'}
                                        </span>
                                        <button 
                                          id={`revoke-btn-${p.id}`}
                                          onClick={() => handleRevoke(doc.id, p.grantee_id || p.id)}
                                          disabled={revokingPermId === (p.grantee_id || p.id)}
                                          className="text-red-400 hover:text-red-200 hover:bg-red-950/60 p-0.5 rounded ml-1 transition cursor-pointer disabled:opacity-50"
                                          title="Instantly Revoke Access"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ))
                                  )}

                                  <div className="flex items-center gap-1.5 ml-auto">
                                    {grantingDocId === doc.id ? (
                                      <form 
                                        id={`grant-form-${doc.id}`}
                                        onSubmit={(e) => { e.preventDefault(); handleGrant(doc.id); }}
                                        className="flex flex-wrap items-center gap-1.5 bg-zinc-950 border border-zinc-800 rounded p-1 shadow"
                                      >
                                        <input 
                                          id="grantee-email-input"
                                          type="text" 
                                          placeholder="username or email..." 
                                          value={grantEmail}
                                          onChange={(e) => setGrantEmail(e.target.value)}
                                          className="px-2 py-0.5 bg-transparent text-xs text-white placeholder-zinc-600 w-36 sm:w-40 focus:outline-none"
                                          autoFocus
                                        />

                                        {/* Quick preset buttons for instant testing */}
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => setGrantEmail('viewer@trustvault.io')}
                                            className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 cursor-pointer"
                                            title="Fill with viewer@trustvault.io"
                                          >
                                            Viewer
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setGrantEmail('owner@trustvault.io')}
                                            className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 cursor-pointer"
                                            title="Fill with owner@trustvault.io"
                                          >
                                            Owner
                                          </button>
                                        </div>

                                        <label className="flex items-center gap-1 text-[10px] text-zinc-400 cursor-pointer pl-1">
                                          <input 
                                            id="grant-can-edit-checkbox"
                                            type="checkbox"
                                            checked={grantCanEdit}
                                            onChange={(e) => setGrantCanEdit(e.target.checked)}
                                            className="rounded bg-zinc-900 border-zinc-700 text-purple-600"
                                          />
                                          Can Edit
                                        </label>
                                        <button 
                                          id="save-grant-btn"
                                          type="submit"
                                          disabled={isSavingGrant}
                                          className="px-2.5 py-0.5 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-xs text-white font-medium transition cursor-pointer"
                                        >
                                          {isSavingGrant ? 'Saving...' : 'Save'}
                                        </button>
                                        <button 
                                          id="cancel-grant-btn"
                                          type="button"
                                          onClick={() => setGrantingDocId(null)}
                                          className="px-1.5 py-0.5 text-xs text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                      </form>
                                    ) : (
                                      <button 
                                        id={`open-grant-btn-${doc.id}`}
                                        onClick={() => { setGrantingDocId(doc.id); setGrantEmail('viewer@trustvault.io'); setGrantCanEdit(false); }}
                                        className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 font-medium transition cursor-pointer"
                                      >
                                        + Grant Access
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      {/* Document Pagination Controls */}
                      {docs.length > docPageSize && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 px-1 text-xs text-zinc-400">
                          <div>
                            Showing {((docPage - 1) * docPageSize) + 1} to {Math.min(docPage * docPageSize, docs.length)} of {docs.length} documents
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              id="doc-page-size-select"
                              value={docPageSize}
                              onChange={(e) => { setDocPageSize(Number(e.target.value)); setDocPage(1); }}
                              className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded text-xs text-zinc-300 focus:outline-none"
                            >
                              <option value={5}>5 per page</option>
                              <option value={10}>10 per page</option>
                              <option value={20}>20 per page</option>
                            </select>

                            <button
                              id="doc-prev-page-btn"
                              onClick={() => setDocPage((p) => Math.max(1, p - 1))}
                              disabled={docPage === 1}
                              className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40 transition cursor-pointer"
                              title="Previous page"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </button>

                            <span className="font-medium text-zinc-300 px-1">
                              Page {docPage} of {totalDocPages}
                            </span>

                            <button
                              id="doc-next-page-btn"
                              onClick={() => setDocPage((p) => Math.min(totalDocPages, p + 1))}
                              disabled={docPage >= totalDocPages}
                              className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40 transition cursor-pointer"
                              title="Next page"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Right Col: Upload & Guarantees */}
                <div className="flex flex-col gap-4">
                  {(currentUser.role === 'admin' || currentUser.role === 'owner') ? (
                    <form onSubmit={handleUpload} className="p-5 rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col gap-3 shadow-lg">
                      <div className="flex items-center justify-between font-semibold text-sm text-white">
                        <div className="flex items-center gap-2">
                          <Upload className="h-4 w-4 text-purple-400" />
                          <span>Upload to Vault</span>
                        </div>
                        <button
                          type="button"
                          id="reset-upload-btn"
                          onClick={resetUploadForm}
                          className="text-[11px] text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
                          title="Reset upload form"
                        >
                          Reset
                        </button>
                      </div>

                      <p className="text-xs text-zinc-400">
                        Files undergo strict magic-byte inspection (PDF, DOCX, PNG, JPG). 10MB limit strictly enforced.
                      </p>

                      <div>
                        <label className="block text-xs font-medium text-zinc-400 mb-1">Document Title</label>
                        <input 
                          id="upload-title-input"
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
                          id="upload-category-select"
                          value={uploadCategory}
                          onChange={(e) => setUploadCategory(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
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
                          id="upload-file-input"
                          type="file" 
                          onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                          className="w-full text-xs text-zinc-400 file:mr-2 file:py-1 file:px-2.5 file:rounded file:border-0 file:text-xs file:font-medium file:bg-zinc-800 file:text-zinc-200 hover:file:bg-zinc-700 cursor-pointer"
                          required
                        />
                      </div>

                      <button 
                        id="commit-upload-btn"
                        type="submit" 
                        disabled={isUploading}
                        className="mt-2 w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-medium text-xs transition shadow cursor-pointer flex items-center justify-center gap-2"
                      >
                        {isUploading ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            <span>Hashing & Uploading...</span>
                          </>
                        ) : (
                          <span>Commit to TrustVault</span>
                        )}
                      </button>
                    </form>
                  ) : (
                    <div className="p-5 rounded-xl border border-zinc-800/60 bg-zinc-900/20 text-center">
                      <Eye className="h-6 w-6 text-zinc-500 mx-auto mb-2" />
                      <div className="text-xs font-semibold text-zinc-300">Viewer Mode</div>
                      <div className="text-[11px] text-zinc-500 mt-1">
                        Viewers can read and download permitted files, and edit metadata if explicitly granted 'Can Edit'.
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
                      <li>Strict 10MB payload limit & file traversal rejection.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Chained Audit Trail (Admin Only) */}
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
                      id="reverify-chain-btn"
                      onClick={verifyChain} 
                      disabled={isVerifyingChain}
                      className="px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900/60 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 transition cursor-pointer flex items-center gap-1.5"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isVerifyingChain ? 'animate-spin text-purple-400' : ''}`} />
                      <span>{isVerifyingChain ? 'Verifying...' : 'Re-verify Chain'}</span>
                    </button>
                  </div>
                )}

                {/* Audit Toolbar */}
                <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950/60 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <label className="text-xs text-zinc-400 font-medium">Filter Action:</label>
                    <select
                      id="audit-action-select"
                      value={auditActionFilter}
                      onChange={(e) => setAuditActionFilter(e.target.value)}
                      className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-300 focus:outline-none focus:border-purple-500 cursor-pointer"
                    >
                      <option value="ALL">All Actions</option>
                      <option value="USER_LOGIN">USER_LOGIN</option>
                      <option value="USER_LOGOUT">USER_LOGOUT</option>
                      <option value="USER_REGISTER">USER_REGISTER</option>
                      <option value="DOC_UPLOAD">DOC_UPLOAD</option>
                      <option value="DOC_DOWNLOAD">DOC_DOWNLOAD</option>
                      <option value="DOC_UPDATE">DOC_UPDATE</option>
                      <option value="DOC_DELETE">DOC_DELETE</option>
                      <option value="PERM_GRANT">PERM_GRANT</option>
                      <option value="PERM_REVOKE">PERM_REVOKE</option>
                      <option value="ACCESS_DENIED">ACCESS_DENIED</option>
                    </select>

                    <button
                      id="refresh-audit-btn"
                      onClick={loadAuditLogs}
                      disabled={isLoadingAudit}
                      className="p-1.5 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white transition cursor-pointer disabled:opacity-50"
                      title="Refresh Audit Trail"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${isLoadingAudit ? 'animate-spin text-purple-400' : ''}`} />
                    </button>
                  </div>

                  {/* Audit Pagination Controls */}
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <span>
                      Showing {((auditPage - 1) * auditPageSize) + 1} to {Math.min(auditPage * auditPageSize, auditLogs.length)} of {auditLogs.length}
                    </span>
                    <button
                      id="audit-prev-page-btn"
                      onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                      disabled={auditPage === 1}
                      className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40 transition cursor-pointer"
                      title="Previous page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="font-medium text-zinc-300">Page {auditPage} of {totalAuditPages}</span>
                    <button
                      id="audit-next-page-btn"
                      onClick={() => setAuditPage((p) => Math.min(totalAuditPages, p + 1))}
                      disabled={auditPage >= totalAuditPages}
                      className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white disabled:opacity-40 transition cursor-pointer"
                      title="Next page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Audit Table */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 overflow-hidden shadow-xl">
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
                        {paginatedAuditLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-zinc-900/30 font-mono text-[11px]">
                            <td className="py-2 px-4 text-zinc-500">{log.id}</td>
                            <td className="py-2 px-4 font-sans font-semibold">
                              <span className={`px-2 py-0.5 rounded text-[10px] ${log.action.includes('DENIED') ? 'bg-red-500/20 text-red-400' : log.action.includes('REVOKE') ? 'bg-amber-500/20 text-amber-400' : 'bg-purple-500/20 text-purple-300'}`}>
                                {log.action}
                              </span>
                            </td>
                            <td className="py-2 px-4 text-zinc-400">{new Date(log.timestamp).toLocaleString()}</td>
                            <td className="py-2 px-4 text-zinc-400 max-w-xs truncate" title={log.metadata_json}>{log.metadata_json}</td>
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

      {/* MODAL 1: Edit Document Metadata Modal */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 max-w-md w-full shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 font-semibold text-sm text-white">
                <Edit2 className="h-4 w-4 text-purple-400" />
                <span>Edit Document Metadata</span>
              </div>
              <button 
                id="close-edit-modal-x-btn"
                onClick={() => setEditingDoc(null)} 
                className="text-zinc-500 hover:text-white p-1 rounded transition cursor-pointer"
                title="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateDocument} className="flex flex-col gap-3.5">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Document Title</label>
                <input 
                  id="edit-doc-title-input"
                  type="text" 
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Category</label>
                <select 
                  id="edit-doc-category-select"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-purple-500 cursor-pointer"
                >
                  <option value="Legal">Legal</option>
                  <option value="Finance">Finance</option>
                  <option value="Technical">Technical</option>
                  <option value="General">General</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button 
                  id="cancel-edit-modal-btn"
                  type="button"
                  onClick={() => setEditingDoc(null)}
                  className="px-3 py-1.5 rounded-lg border border-zinc-800 text-xs text-zinc-400 hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  id="save-edit-modal-btn"
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-xs font-medium text-white transition shadow cursor-pointer"
                >
                  {isSavingEdit ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Delete Document Confirmation Modal */}
      {deletingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-zinc-950 border border-red-900/50 rounded-xl p-5 max-w-md w-full shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 font-semibold text-sm text-red-400">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <span>Permanent Document Deletion</span>
              </div>
              <button 
                id="close-delete-modal-x-btn"
                onClick={() => setDeletingDoc(null)} 
                className="text-zinc-500 hover:text-white p-1 rounded transition cursor-pointer"
                title="Cancel and close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-xs text-zinc-300 space-y-2">
              <p>Are you certain you want to permanently delete this document?</p>
              <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 font-mono text-[11px] text-zinc-400 space-y-1">
                <div><span className="text-zinc-500">Title:</span> {deletingDoc.title}</div>
                <div><span className="text-zinc-500">File:</span> {deletingDoc.original_filename}</div>
                <div><span className="text-zinc-500">ID:</span> {deletingDoc.id}</div>
              </div>
              <p className="text-[11px] text-red-400 font-semibold">
                This action is irreversible and will be permanently linked into the SHA-256 cryptographic audit chain.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <button 
                id="cancel-delete-modal-btn"
                type="button"
                onClick={() => setDeletingDoc(null)}
                className="px-3 py-1.5 rounded-lg border border-zinc-800 text-xs text-zinc-400 hover:text-white transition cursor-pointer"
              >
                Cancel
              </button>
              <button 
                id="confirm-delete-modal-btn"
                type="button"
                onClick={() => executeDeleteDocument(deletingDoc)}
                disabled={isDeleting}
                className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-xs font-semibold text-white transition shadow cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>{isDeleting ? 'Deleting...' : 'Confirm Permanent Deletion'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Profile & Session Details Modal */}
      {showProfileModal && currentUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-5 max-w-md w-full shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2 font-semibold text-sm text-white">
                <UserIcon className="h-4 w-4 text-purple-400" />
                <span>User Profile & Session Security</span>
              </div>
              <button 
                id="close-profile-modal-x-btn"
                onClick={() => setShowProfileModal(false)} 
                className="text-zinc-500 hover:text-white p-1 rounded transition cursor-pointer"
                title="Close profile modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                <span className="text-zinc-400 font-medium">Username</span>
                <span className="font-semibold text-white">{currentUser.username}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                <span className="text-zinc-400 font-medium">Email</span>
                <span className="font-mono text-zinc-300">{currentUser.email}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900 border border-zinc-800">
                <span className="text-zinc-400 font-medium">System Role</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${currentUser.role === 'admin' ? 'bg-red-500/20 text-red-300 border border-red-500/30' : currentUser.role === 'owner' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'}`}>
                  {currentUser.role}
                </span>
              </div>

              <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400 font-medium">User ID (UUID)</span>
                  <button
                    id="copy-userid-btn"
                    onClick={copyUserId}
                    className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 transition cursor-pointer"
                    title="Copy User ID to clipboard"
                  >
                    {copiedId ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedId ? 'Copied!' : 'Copy ID'}</span>
                  </button>
                </div>
                <div className="font-mono text-[10px] text-zinc-400 break-all">{currentUser.id}</div>
              </div>

              <div className="p-3 rounded-lg bg-zinc-900 border border-zinc-800 space-y-1">
                <div className="text-zinc-400 font-medium">Zero-Trust Status</div>
                <div className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Server-side authorization enforced on every operation</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-zinc-800">
              <button 
                id="close-profile-modal-btn"
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs font-medium text-white transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-zinc-800/80 bg-zinc-950/40 p-4 text-center text-xs text-zinc-500">
        TrustVault Platform • Snovasys Fresher Hiring Challenge 2026 • Verified Zero-Trust & Chained Audit
      </footer>
    </div>
  );
}

export default App;
