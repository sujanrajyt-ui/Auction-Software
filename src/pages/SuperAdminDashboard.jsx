import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  Plus,
  Trash2,
  Gavel,
  Tv,
  Users,
  Shield,
  Coins,
  Image as ImageIcon,
  History,
  RotateCcw,
  RefreshCw,
  Check,
  X,
  UserPlus,
  Layers
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { VistaHeader, StatusBadge, TeamLogo } from '../components/Common.jsx';
import {
  AUCTION_TEMPLATES,
  PREDEFINED_CURRENCIES,
  ROLES,
  formatCurrency,
  parseCurrencyInput
} from '../../shared/constants.js';

export default function SuperAdminDashboard() {
  const { user, apiFetch } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState('AUCTIONS'); // 'AUCTIONS' | 'ADMINS' | 'LOGOS' | 'CURRENCIES' | 'AUDIT'
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  // Create Auction Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [templateId, setTemplateId] = useState('FOOTBALL_DEFAULT');
  const [newAuctionName, setNewAuctionName] = useState(AUCTION_TEMPLATES.FOOTBALL_DEFAULT.name);
  const [newCommitteeName, setNewCommitteeName] = useState(AUCTION_TEMPLATES.FOOTBALL_DEFAULT.committeeName);
  const [newCurrency, setNewCurrency] = useState('EUR');
  const [newPurseInput, setNewPurseInput] = useState('1B');
  const [newMaxRetentions, setNewMaxRetentions] = useState(3);
  const [newMaxRtmPerTeam, setNewMaxRtmPerTeam] = useState(0);

  // Create Admin Form State
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('vista2027');
  const [adminRole, setAdminRole] = useState(ROLES.AUCTIONEER);
  const [adminAuctionIds, setAdminAuctionIds] = useState([]);

  // Assign Admin State
  const [assignAuctionId, setAssignAuctionId] = useState('');
  const [assignUserId, setAssignUserId] = useState('');
  const [assignRole, setAssignRole] = useState(ROLES.AUCTIONEER);

  // Add Custom Logo to Library State
  const [logoName, setLogoName] = useState('');
  const [logoShort, setLogoShort] = useState('');
  const [logoCategory, setLogoCategory] = useState('Football Club');
  const [logoPrimary, setLogoPrimary] = useState('#3B82F6');
  const [logoSecondary, setLogoSecondary] = useState('#F59E0B');
  const [logoUrl, setLogoUrl] = useState('');

  // Restart Auction Confirmation Modal State
  const [restartModalAuction, setRestartModalAuction] = useState(null);
  const [restartConfirmInput, setRestartConfirmInput] = useState('');

  const notify = (msg, type = 'success') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  const fetchOverview = useCallback(async () => {
    try {
      const data = await apiFetch('/api/platform/overview');
      setOverview(data);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (user && user.role !== ROLES.SUPER_ADMIN) {
      navigate('/admin');
      return;
    }
    fetchOverview();
    const socket = io(window.location.origin);
    socket.on('platform:updated', fetchOverview);
    return () => socket.disconnect();
  }, [user, navigate, fetchOverview]);

  const handleSelectTemplate = tplKey => {
    setTemplateId(tplKey);
    const tpl = AUCTION_TEMPLATES[tplKey] || AUCTION_TEMPLATES.CUSTOM_BLANK;
    setNewAuctionName(tpl.name);
    setNewCommitteeName(tpl.committeeName);
    setNewCurrency(tpl.currency);
    setNewPurseInput(formatCurrency(tpl.startingPurse, tpl.currency, { preferBillions: true }));
    setNewMaxRetentions(tpl.maxRetentionsPerTeam);
    setNewMaxRtmPerTeam(tpl.maxRtmPerTeam ?? (tplKey === 'IPL_2027' ? 2 : 0));
  };

  const handleCreateAuction = async e => {
    e.preventDefault();
    try {
      const parsedPurse = parseCurrencyInput(newPurseInput, newCurrency);
      const res = await apiFetch('/api/auctions', {
        method: 'POST',
        body: JSON.stringify({
          templateId,
          name: newAuctionName,
          committeeName: newCommitteeName,
          currency: newCurrency,
          startingPurse: parsedPurse > 0 ? parsedPurse : undefined,
          maxRetentionsPerTeam: Number(newMaxRetentions),
          maxRtmPerTeam: Number(newMaxRtmPerTeam)
        })
      });
      setShowCreateModal(false);
      notify(`Created auction "${res.auction.name}"`);
      fetchOverview();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleDeleteAuction = async (auctionId, name) => {
    try {
      await apiFetch(`/api/auctions/${auctionId}`, { method: 'DELETE' });
      notify(`Deleted auction "${name}"`);
      fetchOverview();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleResetAuction = async e => {
    if (e) e.preventDefault();
    if (!restartModalAuction) return;
    if (restartConfirmInput.trim().toLowerCase() !== 'i confirm') {
      notify('You must type "I confirm" to restart the auction.', 'error');
      return;
    }
    try {
      await apiFetch(`/api/auctions/${restartModalAuction.id}/reset`, {
        method: 'POST',
        body: JSON.stringify({ confirmationText: restartConfirmInput })
      });
      setRestartModalAuction(null);
      setRestartConfirmInput('');
      notify('Auction restarted to READY state and purses restored.');
      fetchOverview();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleReopenAuction = async auctionId => {
    try {
      await apiFetch(`/api/auctions/${auctionId}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ targetStatus: 'LIVE' })
      });
      notify('Auction reopened to LIVE state.');
      fetchOverview();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleCreateAdmin = async e => {
    e.preventDefault();
    try {
      await apiFetch('/api/platform/admins', {
        method: 'POST',
        body: JSON.stringify({
          name: adminName,
          email: adminEmail,
          password: adminPassword,
          role: adminRole,
          auctionIds: adminAuctionIds
        })
      });
      setAdminName('');
      setAdminEmail('');
      setAdminAuctionIds([]);
      notify('Committee Admin account created.');
      fetchOverview();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleAssignAdmin = async e => {
    e.preventDefault();
    if (!assignAuctionId || !assignUserId) return;
    try {
      await apiFetch(`/api/platform/auctions/${assignAuctionId}/assign-admin`, {
        method: 'POST',
        body: JSON.stringify({ userId: assignUserId, role: assignRole })
      });
      notify('Administrator assigned to auction.');
      fetchOverview();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleUnassignAdmin = async (auctionId, userId) => {
    try {
      await apiFetch(`/api/platform/auctions/${auctionId}/assign-admin/${userId}`, {
        method: 'DELETE'
      });
      notify('Administrator unassigned from auction.');
      fetchOverview();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleDeleteAdmin = async userId => {
    try {
      await apiFetch(`/api/platform/admins/${userId}`, { method: 'DELETE' });
      notify('Administrator removed.');
      fetchOverview();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleToggleCurrency = async code => {
    const currentEnabled = (overview?.settings?.currencies || [])
      .filter(c => c.enabled)
      .map(c => c.code);
    const nextEnabled = currentEnabled.includes(code)
      ? currentEnabled.filter(c => c !== code)
      : [...currentEnabled, code];
    try {
      await apiFetch('/api/platform/settings/currencies', {
        method: 'POST',
        body: JSON.stringify({ enabledCurrencies: nextEnabled })
      });
      notify('Supported predefined currencies updated.');
      fetchOverview();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  const handleAddLogo = async e => {
    e.preventDefault();
    try {
      await apiFetch('/api/platform/settings/logos', {
        method: 'POST',
        body: JSON.stringify({
          name: logoName,
          shortName: logoShort,
          category: logoCategory,
          primaryColor: logoPrimary,
          secondaryColor: logoSecondary,
          logoUrl
        })
      });
      setLogoName('');
      setLogoShort('');
      setLogoUrl('');
      notify('Logo added to built-in platform library.');
      fetchOverview();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  if (loading && !overview) {
    return (
      <div className="min-h-screen bg-[#07090E] text-white flex items-center justify-center">
        <div className="text-sm font-bold text-amber-400 animate-pulse">
          Loading Super Admin Platform Console...
        </div>
      </div>
    );
  }

  const auctions = overview?.auctions || [];
  const admins = overview?.admins || [];
  const settings = overview?.settings || {};
  const auditLogs = overview?.auditLogs || [];

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col">
      <VistaHeader
        subtitle="Super Admin Platform Command • Multi-Committee Governance"
        rightActions={
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Committee Auction
          </button>
        }
      />

      {feedback && (
        <div className="max-w-[1600px] w-full mx-auto px-4 lg:px-6 pt-4">
          <div
            className={`px-4 py-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
              feedback.type === 'error'
                ? 'bg-rose-950/80 border-rose-500/60 text-rose-200'
                : 'bg-emerald-950/80 border-emerald-500/60 text-emerald-200'
            }`}
          >
            <span>{feedback.msg}</span>
            <button type="button" onClick={() => setFeedback(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-[1600px] w-full mx-auto px-4 lg:px-6 py-6 space-y-6 flex-1">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-800">
          {[
            { id: 'AUCTIONS', label: `All Auctions (${auctions.length})`, icon: Layers },
            { id: 'ADMINS', label: `Committee Admins (${admins.length})`, icon: Users },
            { id: 'LOGOS', label: `Built-In Logo Library (${settings.logoLibrary?.length || 0})`, icon: ImageIcon },
            { id: 'CURRENCIES', label: 'Predefined Currencies', icon: Coins },
            { id: 'AUDIT', label: 'Platform Audit Log', icon: History }
          ].map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-extrabold uppercase tracking-wider transition-all shrink-0 cursor-pointer border-b-2 ${
                  tab === t.id
                    ? 'bg-slate-900 text-amber-400 border-amber-400'
                    : 'text-slate-400 hover:text-white border-transparent'
                }`}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: AUCTIONS */}
        {tab === 'AUCTIONS' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {auctions.map(auc => (
              <div
                key={auc.id}
                className="rounded-3xl bg-slate-900/85 border border-slate-800 p-6 flex flex-col justify-between gap-5 shadow-xl"
              >
                <div>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={auc.status} />
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                        {auc.committeeName}
                      </span>
                    </div>
                    <span className="text-xs font-mono-num px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                      {auc.currency} • Starting Purse:{' '}
                      {formatCurrency(auc.startingPurse, auc.currency, { preferBillions: true })}
                    </span>
                  </div>

                  <h3 className="font-display text-2xl font-extrabold text-white mt-3">
                    {auc.name}
                  </h3>

                  {/* Key metrics */}
                  <div className="grid grid-cols-4 gap-2.5 mt-4">
                    <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80">
                      <div className="text-[10px] font-bold uppercase text-slate-400">Teams</div>
                      <div className="text-lg font-mono-num font-extrabold text-white">
                        {auc.teams?.length || 0}
                      </div>
                    </div>
                    <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80">
                      <div className="text-[10px] font-bold uppercase text-slate-400">Queued</div>
                      <div className="text-lg font-mono-num font-extrabold text-indigo-400">
                        {auc.stats?.queuedCount || 0}
                      </div>
                    </div>
                    <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80">
                      <div className="text-[10px] font-bold uppercase text-slate-400">Sold</div>
                      <div className="text-lg font-mono-num font-extrabold text-emerald-400">
                        {auc.stats?.soldCount || 0}
                      </div>
                    </div>
                    <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80">
                      <div className="text-[10px] font-bold uppercase text-slate-400">Total Spend</div>
                      <div className="text-sm font-mono-num font-extrabold text-amber-400 truncate">
                        {formatCurrency(auc.stats?.totalAuctionSpend || 0, auc.currency)}
                      </div>
                    </div>
                  </div>

                  {/* Assigned Committee Admins */}
                  <div className="mt-4 pt-4 border-t border-slate-800/80">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                      Assigned Committee Admins ({auc.assignedAdmins?.length || 0})
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(auc.assignedAdmins || []).map(aa => (
                        <span
                          key={aa.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs"
                        >
                          <span className="font-bold text-white">{aa.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold">
                            {aa.role}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUnassignAdmin(auc.id, aa.userId)}
                            className="text-slate-500 hover:text-rose-400 ml-1 cursor-pointer"
                            title="Unassign"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                      {(!auc.assignedAdmins || auc.assignedAdmins.length === 0) && (
                        <span className="text-xs text-slate-500">
                          No specific admins assigned yet (Super Admin has full access).
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Action Bar */}
                <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      to={`/admin/auction/${auc.id}`}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs transition-all"
                    >
                      <Gavel className="w-4 h-4" />
                      Enter Admin Control Panel
                    </Link>
                    <Link
                      to={`/projector/${auc.id}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-300 border border-indigo-500/40 font-bold text-xs transition-all"
                    >
                      <Tv className="w-4 h-4" />
                      Live Projector
                    </Link>
                  </div>

                  <div className="flex items-center gap-2">
                    {auc.status === 'COMPLETED' && (
                      <button
                        type="button"
                        onClick={() => handleReopenAuction(auc.id)}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Reopen
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setRestartModalAuction(auc);
                        setRestartConfirmInput('');
                      }}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                      title="Restart auction (requires typing 'I confirm')"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restart
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteAuction(auc.id, auc.name)}
                      className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 border border-rose-500/30 cursor-pointer"
                      title="Delete Auction"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: COMMITTEE ADMINS */}
        {tab === 'ADMINS' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 space-y-6">
              {/* Create Admin Form */}
              <form
                onSubmit={handleCreateAdmin}
                className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 space-y-4"
              >
                <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-amber-400" />
                  Create Committee Admin
                </h3>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={adminName}
                    onChange={e => setAdminName(e.target.value)}
                    placeholder="e.g. Rohan Shetty (Auctioneer)"
                    required
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={e => setAdminEmail(e.target.value)}
                    placeholder="rohan@vista.nmamit.in"
                    required
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                      Password
                    </label>
                    <input
                      type="text"
                      value={adminPassword}
                      onChange={e => setAdminPassword(e.target.value)}
                      required
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white font-mono-num"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                      Role
                    </label>
                    <select
                      value={adminRole}
                      onChange={e => setAdminRole(e.target.value)}
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                    >
                      <option value={ROLES.AUCTIONEER}>AUCTIONEER</option>
                      <option value={ROLES.BID_OPERATOR}>BID_OPERATOR</option>
                      <option value={ROLES.SUPER_ADMIN}>SUPER_ADMIN</option>
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider cursor-pointer"
                >
                  Create Admin Account
                </button>
              </form>

              {/* Assign Existing Admin to Auction */}
              <form
                onSubmit={handleAssignAdmin}
                className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 space-y-4"
              >
                <h3 className="font-display text-lg font-bold text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-indigo-400" />
                  Assign Admin to Committee Auction
                </h3>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Select Auction
                  </label>
                  <select
                    value={assignAuctionId}
                    onChange={e => setAssignAuctionId(e.target.value)}
                    required
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white"
                  >
                    <option value="">-- Choose Auction --</option>
                    {auctions.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                      Select Admin
                    </label>
                    <select
                      value={assignUserId}
                      onChange={e => setAssignUserId(e.target.value)}
                      required
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                    >
                      <option value="">-- Choose Admin --</option>
                      {admins
                        .filter(u => u.role !== ROLES.SUPER_ADMIN)
                        .map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role})
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                      Auction Role
                    </label>
                    <select
                      value={assignRole}
                      onChange={e => setAssignRole(e.target.value)}
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-white"
                    >
                      <option value={ROLES.AUCTIONEER}>AUCTIONEER</option>
                      <option value={ROLES.BID_OPERATOR}>BID_OPERATOR</option>
                    </select>
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-extrabold text-xs uppercase tracking-wider cursor-pointer"
                >
                  Assign Admin to Auction
                </button>
              </form>
            </div>

            {/* Admins List */}
            <div className="lg:col-span-7 rounded-3xl bg-slate-900/90 border border-slate-800 p-6">
              <h3 className="font-display text-lg font-bold text-white mb-4">
                Platform Administrators ({admins.length})
              </h3>
              <div className="space-y-3">
                {admins.map(adm => (
                  <div
                    key={adm.id}
                    className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{adm.name}</span>
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          {adm.role}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{adm.email}</div>
                      {adm.assignments?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {adm.assignments.map(asg => (
                            <span
                              key={`${asg.auctionId}-${asg.role}`}
                              className="text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300"
                            >
                              {asg.auctionName} ({asg.role})
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {adm.id !== user.id && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAdmin(adm.id)}
                        className="p-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 self-end sm:self-center cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: BUILT-IN LOGO LIBRARY */}
        {tab === 'LOGOS' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <form
              onSubmit={handleAddLogo}
              className="lg:col-span-4 rounded-3xl bg-slate-900/90 border border-slate-800 p-6 space-y-4 self-start"
            >
              <h3 className="font-display text-lg font-bold text-white">
                Add Club / Brand to Built-in Library
              </h3>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Club / Organization Name
                </label>
                <input
                  type="text"
                  value={logoName}
                  onChange={e => setLogoName(e.target.value)}
                  placeholder="e.g. Bayer Leverkusen"
                  required
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Short Code
                  </label>
                  <input
                    type="text"
                    value={logoShort}
                    onChange={e => setLogoShort(e.target.value.toUpperCase())}
                    placeholder="B04"
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={logoCategory}
                    onChange={e => setLogoCategory(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Primary Colour
                  </label>
                  <input
                    type="color"
                    value={logoPrimary}
                    onChange={e => setLogoPrimary(e.target.value)}
                    className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 p-1 cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                    Secondary Colour
                  </label>
                  <input
                    type="color"
                    value={logoSecondary}
                    onChange={e => setLogoSecondary(e.target.value)}
                    className="w-full h-10 rounded-xl bg-slate-950 border border-slate-800 p-1 cursor-pointer"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Logo URL
                </label>
                <input
                  type="url"
                  value={logoUrl}
                  onChange={e => setLogoUrl(e.target.value)}
                  placeholder="https://..."
                  required
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-white"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider cursor-pointer"
              >
                Save to Built-in Library
              </button>
            </form>

            <div className="lg:col-span-8 rounded-3xl bg-slate-900/90 border border-slate-800 p-6">
              <h3 className="font-display text-lg font-bold text-white mb-4">
                Built-In Club, Franchise & Syndicate Logo Library
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {(settings.logoLibrary || []).map(logo => (
                  <div
                    key={logo.id}
                    className="p-3.5 rounded-2xl bg-slate-950/90 border border-slate-800 flex items-center gap-3"
                  >
                    <TeamLogo
                      name={logo.name}
                      shortName={logo.shortName}
                      logoUrl={logo.logoUrl}
                      primaryColor={logo.primaryColor}
                      secondaryColor={logo.secondaryColor}
                      size="md"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-white truncate">{logo.name}</div>
                      <div className="text-[10px] text-slate-400">{logo.category}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className="w-3 h-3 rounded-full border border-white/20"
                          style={{ backgroundColor: logo.primaryColor }}
                        />
                        <span
                          className="w-3 h-3 rounded-full border border-white/20"
                          style={{ backgroundColor: logo.secondaryColor }}
                        />
                        <span className="text-[10px] font-mono-num text-slate-400">
                          {logo.shortName}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: PREDEFINED CURRENCIES */}
        {tab === 'CURRENCIES' && (
          <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 max-w-3xl">
            <h3 className="font-display text-lg font-bold text-white">
              Supported Currencies
            </h3>
            <p className="text-xs text-slate-400 mt-1 mb-5">
              Enable or disable currencies available for auctions.
            </p>
            <div className="space-y-3">
              {(settings.currencies || []).map(cur => (
                <div
                  key={cur.code}
                  className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center font-mono-num font-extrabold text-amber-400">
                      {cur.symbol.trim()}
                    </div>
                    <div>
                      <div className="font-bold text-white text-sm">
                        {cur.name} ({cur.code})
                      </div>
                      <div className="text-xs text-slate-400">
                        Unit Format: {cur.unitLabel} • Display Mode: {cur.displayMode}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleCurrency(cur.code)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer ${
                      cur.enabled
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {cur.enabled ? 'ENABLED' : 'DISABLED'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 5: PLATFORM AUDIT LOG */}
        {tab === 'AUDIT' && (
          <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6">
            <h3 className="font-display text-lg font-bold text-white mb-4">
              Platform Audit Log ({auditLogs.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 uppercase">
                    <th className="py-3 px-3">Timestamp</th>
                    <th className="py-3 px-3">Admin</th>
                    <th className="py-3 px-3">Role</th>
                    <th className="py-3 px-3">Action</th>
                    <th className="py-3 px-3">Entity</th>
                    <th className="py-3 px-3">Previous → New State</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {auditLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-950/60">
                      <td className="py-2.5 px-3 font-mono-num text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-white">{log.userName}</td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold text-[10px]">
                          {log.userRole}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-emerald-400">{log.action}</td>
                      <td className="py-2.5 px-3 text-slate-300">
                        {log.entityType}: {log.entityName || log.entityId}
                      </td>
                      <td className="py-2.5 px-3 font-mono-num text-[11px] text-slate-400 max-w-md truncate">
                        {log.newValue ? JSON.stringify(log.newValue) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create Auction Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateAuction}
            className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-700 p-6 sm:p-8 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl font-extrabold text-white">
                Create New Committee Auction
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-2">
                Choose Template
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {Object.values(AUCTION_TEMPLATES).map(tpl => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => handleSelectTemplate(tpl.id)}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      templateId === tpl.id
                        ? 'bg-amber-500/15 border-amber-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-extrabold">{tpl.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">
                      {tpl.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Auction Name
                </label>
                <input
                  type="text"
                  value={newAuctionName}
                  onChange={e => setNewAuctionName(e.target.value)}
                  required
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Committee Name
                </label>
                <input
                  type="text"
                  value={newCommitteeName}
                  onChange={e => setNewCommitteeName(e.target.value)}
                  required
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Currency
                </label>
                <select
                  value={newCurrency}
                  onChange={e => setNewCurrency(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-2.5 text-sm text-white"
                >
                  {(settings.currencies || Object.values(PREDEFINED_CURRENCIES))
                    .filter(c => c.enabled !== false)
                    .map(c => (
                      <option key={c.code} value={c.code}>
                        {c.code} ({c.symbol.trim()})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Starting Purse
                </label>
                <input
                  type="text"
                  value={newPurseInput}
                  onChange={e => setNewPurseInput(e.target.value)}
                  placeholder="e.g. 1B or 120Cr"
                  required
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm font-mono-num text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Max Retentions
                </label>
                <input
                  type="number"
                  min="0"
                  max="25"
                  value={newMaxRetentions}
                  onChange={e => setNewMaxRetentions(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm font-mono-num text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-purple-300 mb-1">
                  RTM / Team
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={newMaxRtmPerTeam}
                  onChange={e => setNewMaxRtmPerTeam(e.target.value)}
                  className="w-full rounded-xl bg-slate-950 border border-purple-500/40 px-3.5 py-2.5 text-sm font-mono-num text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider cursor-pointer"
              >
                Create Committee Auction
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Restart Auction Confirmation Modal (Requires typing "I confirm") */}
      {restartModalAuction && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleResetAuction}
            className="w-full max-w-md rounded-3xl bg-slate-900 border border-rose-500/40 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold text-white">
                Restart Auction: {restartModalAuction.name}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setRestartModalAuction(null);
                  setRestartConfirmInput('');
                }}
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <p className="text-xs text-slate-300">
              Restarting this auction clears all bids, sales, and purse adjustments, restores team purses, and returns all items to the queue in <strong>READY</strong> state. Type <code className="px-1.5 py-0.5 rounded bg-slate-950 text-amber-300 font-mono-num font-bold">I confirm</code> below to proceed:
            </p>
            <input
              type="text"
              value={restartConfirmInput}
              onChange={e => setRestartConfirmInput(e.target.value)}
              placeholder='Type "I confirm" to enable restart'
              required
              className="w-full rounded-xl bg-slate-950 border border-rose-500/40 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-rose-400"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setRestartModalAuction(null);
                  setRestartConfirmInput('');
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 text-xs font-bold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={restartConfirmInput.trim().toLowerCase() !== 'i confirm'}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-35 disabled:cursor-not-allowed text-white font-extrabold text-xs uppercase cursor-pointer"
              >
                Restart Auction
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
