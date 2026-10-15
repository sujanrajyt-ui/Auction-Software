import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Gavel,
  ShieldCheck,
  Users,
  Tv,
  ArrowRight,
  Lock,
  Mail,
  KeyRound,
  Sparkles,
  Layers,
  CheckCircle2,
  Search,
  Filter,
  ArrowUpDown,
  XCircle,
  Clock,
  X,
  ChevronRight,
  Flame,
  Globe,
  Award
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  VistaHeader,
  StatusBadge,
  TeamLogo,
  ItemImage,
  OverseasPlane
} from '../components/Common.jsx';
import {
  formatCurrency,
  BUILTIN_LOGOS,
  isOverseasPlayer,
  cleanPlayerKey
} from '../../shared/constants.js';

export default function LandingLoginPage({ mode = 'TEAM' }) {
  const { user, loginAdmin, loginTeam, apiFetch } = useAuth();
  const navigate = useNavigate();
  const isAdminPortal = mode === 'ADMIN';

  const [auctions, setAuctions] = useState([]);

  // Admin Login Form
  const [email, setEmail] = useState('superadmin@vista.nmamit.in');
  const [password, setPassword] = useState('vista2027');

  // Team Login Form
  const [selectedAuctionId, setSelectedAuctionId] = useState('');
  const [teamCode, setTeamCode] = useState('');
  const [teamPin, setTeamPin] = useState('');

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Spectator Player Showcase State (Public, zero admin controls)
  const [showcaseAuctionId, setShowcaseAuctionId] = useState('');
  const [showcaseAuction, setShowcaseAuction] = useState(null);
  const [showcaseLoading, setShowcaseLoading] = useState(false);
  const [selectedPlayerModal, setSelectedPlayerModal] = useState(null);

  // Showcase filters & sorting
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPool, setSelectedPool] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [overseasFilter, setOverseasFilter] = useState('ALL'); // 'ALL' | 'OVERSEAS' | 'DOMESTIC'
  const [sortBy, setSortBy] = useState('QUEUE'); // 'QUEUE' | 'PRICE_DESC' | 'PRICE_ASC' | 'SOLD_DESC' | 'NAME'

  useEffect(() => {
    apiFetch('/api/public/auctions')
      .then(data => {
        const list = data.auctions || [];
        setAuctions(list);
        if (list.length > 0) {
          if (!selectedAuctionId) setSelectedAuctionId(list[0].id);
          if (!showcaseAuctionId) setShowcaseAuctionId(list[0].id);
        }
      })
      .catch(() => {});
  }, [apiFetch]);

  // Load hydrated auction data for public spectator showcase
  useEffect(() => {
    if (!showcaseAuctionId) return;
    setShowcaseLoading(true);
    apiFetch(`/api/auctions/${showcaseAuctionId}`)
      .then(data => {
        if (data?.auction) {
          setShowcaseAuction(data.auction);
        }
      })
      .catch(() => {})
      .finally(() => setShowcaseLoading(false));

    // Real-time live polling for spectator showcase
    const interval = setInterval(() => {
      apiFetch(`/api/auctions/${showcaseAuctionId}`)
        .then(data => {
          if (data?.auction) {
            setShowcaseAuction(data.auction);
          }
        })
        .catch(() => {});
    }, 6000);
    return () => clearInterval(interval);
  }, [showcaseAuctionId, apiFetch]);

  // Teams map for winning bidder resolution
  const teamsMap = useMemo(() => {
    return new Map((showcaseAuction?.teams || []).map(t => [t.id, t]));
  }, [showcaseAuction]);

  // All items in selected auction
  const allShowcaseItems = useMemo(() => {
    return showcaseAuction?.items || [];
  }, [showcaseAuction]);

  // Pool options for category filtering
  const poolOptions = useMemo(() => {
    const set = new Set();
    allShowcaseItems.forEach(it => {
      if (it.poolName) set.add(it.poolName);
    });
    return Array.from(set);
  }, [allShowcaseItems]);

  // Spectator Summary KPI numbers
  const showcaseSummary = useMemo(() => {
    const total = allShowcaseItems.length;
    const queued = allShowcaseItems.filter(i => i.status === 'QUEUED').length;
    const active = allShowcaseItems.filter(i => i.status === 'ACTIVE').length;
    const sold = allShowcaseItems.filter(i => i.status === 'SOLD');
    const unsold = allShowcaseItems.filter(i => i.status === 'UNSOLD').length;
    const overseasCount = allShowcaseItems.filter(i => isOverseasPlayer(i)).length;
    const totalSpend = sold.reduce((acc, cur) => acc + (Number(cur.soldAmount) || 0), 0);

    return {
      total,
      queued,
      active,
      soldCount: sold.length,
      unsold,
      overseasCount,
      totalSpend
    };
  }, [allShowcaseItems]);

  // Real-time filtered & sorted spectator player list
  const filteredShowcasePlayers = useMemo(() => {
    let list = [...allShowcaseItems];

    // Text search (Name, Pool)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(it => {
        const nameMatch = it.name?.toLowerCase().includes(q);
        const poolMatch = it.poolName?.toLowerCase().includes(q);
        return nameMatch || poolMatch;
      });
    }

    // Pool filter
    if (selectedPool !== 'ALL') {
      list = list.filter(it => it.poolName === selectedPool);
    }

    // Status filter
    if (selectedStatus !== 'ALL') {
      list = list.filter(it => it.status === selectedStatus);
    }

    // Overseas filter
    if (overseasFilter === 'OVERSEAS') {
      list = list.filter(it => isOverseasPlayer(it));
    } else if (overseasFilter === 'DOMESTIC') {
      list = list.filter(it => !isOverseasPlayer(it));
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'QUEUE') return (a.queueOrder || 0) - (b.queueOrder || 0);
      if (sortBy === 'PRICE_DESC') return (b.basePrice || 0) - (a.basePrice || 0);
      if (sortBy === 'PRICE_ASC') return (a.basePrice || 0) - (b.basePrice || 0);
      if (sortBy === 'SOLD_DESC') return (b.soldAmount || 0) - (a.soldAmount || 0);
      if (sortBy === 'NAME') return (a.name || '').localeCompare(b.name || '');
      return 0;
    });

    return list;
  }, [allShowcaseItems, searchQuery, selectedPool, selectedStatus, overseasFilter, sortBy, showcaseAuction]);

  const handleAdminSubmit = async e => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const loggedIn = await loginAdmin(email, password);
      if (loggedIn.role === 'SUPER_ADMIN') {
        navigate('/super-admin');
      } else if (loggedIn.assignments?.length > 0) {
        navigate(`/admin/auction/${loggedIn.assignments[0].auctionId}`);
      } else if (auctions.length > 0) {
        navigate(`/admin/auction/${auctions[0].id}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTeamSubmit = async e => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const loggedIn = await loginTeam({
        auctionId: selectedAuctionId || undefined,
        code: teamCode,
        pin: teamPin
      });
      navigate(`/team/${loggedIn.auctionId}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col">
      <VistaHeader
        subtitle={
          isAdminPortal
            ? 'Admin & Operator Console'
            : 'Live Auction & Team Portal'
        }
      />

      <main className="flex-1 max-w-[1500px] w-full mx-auto px-4 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Live Committees & Public Projector Launchers */}
        <div className="lg:col-span-7 space-y-6">
          <div className="relative rounded-3xl bg-gradient-to-br from-slate-900/95 via-[#0B0F1A] to-amber-950/20 border border-slate-800/90 p-6 sm:p-8 overflow-hidden shadow-2xl">
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <img
                src="/vista-logo.png"
                alt="VISTA"
                className="h-10 sm:h-12 w-auto object-contain drop-shadow-lg"
              />
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-bold uppercase tracking-widest">
                {isAdminPortal ? 'Admin Portal' : 'NMAMIT • The Verdict'}
              </div>
            </div>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white tracking-tight leading-[1.1]">
              {isAdminPortal ? 'Committee ' : 'Live '}
              <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 bg-clip-text text-transparent">
                {isAdminPortal ? 'Admin Console' : 'Auction Portal'}
              </span>
            </h1>
            <p className="mt-2 text-slate-400 text-sm max-w-xl">
              {isAdminPortal
                ? 'Manage auctions, pools, retentions, RTM cards, and live bidding.'
                : 'Select your auction and enter your Team Code and PIN.'}
            </p>

            {/* Quick Active Session Banner if already logged in */}
            {user && (!isAdminPortal ? user.kind === 'TEAM' : user.kind === 'ADMIN') && (
              <div className="mt-6 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs uppercase font-bold tracking-wider text-emerald-400">
                    Active Session Detected
                  </div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    Signed in as {user.name} ({user.role})
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {user.kind === 'TEAM' ? (
                    <Link
                      to={`/team/${user.auctionId}`}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all"
                    >
                      Open Team Panel <ArrowRight className="w-4 h-4" />
                    </Link>
                  ) : user.role === 'SUPER_ADMIN' ? (
                    <Link
                      to="/super-admin"
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all"
                    >
                      Open Super Admin Console <ArrowRight className="w-4 h-4" />
                    </Link>
                  ) : (
                    auctions[0] && (
                      <Link
                        to={`/admin/auction/${user.assignments?.[0]?.auctionId || auctions[0].id}`}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all"
                      >
                        Open Auction Control Desk <ArrowRight className="w-4 h-4" />
                      </Link>
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Committee Auction Instances Directory */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-400" />
                Active Committee Auction Instances ({auctions.length})
              </h2>
              {isAdminPortal && user?.role === 'SUPER_ADMIN' && (
                <Link
                  to="/super-admin"
                  className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1"
                >
                  + Create / Manage Committees <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4">
              {auctions.map(auc => (
                <div
                  key={auc.id}
                  className="rounded-2xl bg-slate-900/80 border border-slate-800/90 hover:border-amber-500/40 p-5 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <StatusBadge status={auc.status} />
                      <span className="text-xs font-semibold text-amber-400/90 uppercase tracking-wider">
                        {auc.committeeName}
                      </span>
                      <span className="text-xs font-mono-num px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        Purse: {formatCurrency(auc.startingPurse, auc.currency, { preferBillions: true })}
                      </span>
                    </div>
                    <h3 className="font-display text-xl font-bold text-white">{auc.name}</h3>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span>{auc.teamsCount} Teams</span>
                      <span>•</span>
                      <span>{auc.itemsCount} Items/Players</span>
                      <span>•</span>
                      <span className="text-emerald-400 font-semibold">{auc.soldCount} Sold</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 flex-wrap shrink-0">
                    <Link
                      to={`/projector/${auc.id}`}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 text-xs font-bold transition-all"
                    >
                      <Tv className="w-4 h-4" />
                      Projector View
                    </Link>

                    {isAdminPortal &&
                      user?.kind === 'ADMIN' &&
                      (user.role === 'SUPER_ADMIN' || auc.isAssigned) && (
                        <Link
                          to={`/admin/auction/${auc.id}`}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-extrabold transition-all"
                        >
                          <Gavel className="w-4 h-4" />
                          Control Desk
                        </Link>
                      )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Strictly Separated Login Portal (/ = Team Login ONLY, /admin = Admin Login ONLY) */}
        <div className="lg:col-span-5">
          <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 sm:p-7 shadow-2xl">
            <div className="flex items-center gap-2.5 pb-4 mb-5 border-b border-slate-800">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
                {isAdminPortal ? <ShieldCheck className="w-5 h-5" /> : <Users className="w-5 h-5" />}
              </div>
              <div>
                <div className="text-xs font-extrabold uppercase tracking-wider text-amber-400">
                  {isAdminPortal ? 'Restricted Administrator Portal' : 'Team / Participant Portal'}
                </div>
                <div className="text-sm font-bold text-white">
                  {isAdminPortal ? 'Admin & Operator Sign In' : 'Live Team Panel Sign In'}
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-5 p-3.5 rounded-xl bg-rose-950/70 border border-rose-500/50 text-rose-200 text-xs font-medium">
                {error}
              </div>
            )}

            {!isAdminPortal ? (
              <form onSubmit={handleTeamSubmit} className="space-y-4">
                <div>
                  <p className="text-xs text-slate-400">
                    Enter your Team Code & PIN. Multiple devices can log into the same team simultaneously with live synchronization.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Select Committee Auction
                  </label>
                  <select
                    value={selectedAuctionId}
                    onChange={e => setSelectedAuctionId(e.target.value)}
                    className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    {auctions.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.committeeName})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                      Team Code
                    </label>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                      <input
                        type="text"
                        value={teamCode}
                        onChange={e => setTeamCode(e.target.value.toUpperCase())}
                        placeholder="e.g. CHE"
                        required
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 pl-10 pr-3.5 py-2.5 text-sm font-mono-num uppercase text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                      Team PIN
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                      <input
                        type="password"
                        value={teamPin}
                        onChange={e => setTeamPin(e.target.value)}
                        placeholder="****"
                        required
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 pl-10 pr-3.5 py-2.5 text-sm font-mono-num text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-sm tracking-wide shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                >
                  {submitting ? 'Synchronizing Team Panel...' : 'Enter Live Team Panel'}
                </button>

                {selectedAuctionId && (
                  <div className="pt-2">
                    <Link
                      to={`/players/${selectedAuctionId}`}
                      className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-800 hover:border-amber-500/40 font-bold text-xs flex items-center justify-center gap-2 transition"
                    >
                      <Users className="w-4 h-4 text-amber-400" />
                      <span>Browse Players Pool & Career Stats</span>
                    </Link>
                  </div>
                )}

                <div className="pt-3 border-t border-slate-800/80 text-center">
                  <p className="text-[11px] text-slate-400">
                    Team Codes and PINs are privately issued by the Committee Admin.
                  </p>
                </div>
              </form>
            ) : (
              <form onSubmit={handleAdminSubmit} className="space-y-4">
                <div>
                  <p className="text-xs text-slate-400">
                    Authorized access for Super Admins, Auctioneers, and Bid Operators.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Admin Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      required
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 pl-10 pr-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                    <input
                      type="password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      className="w-full rounded-xl bg-slate-950 border border-slate-800 pl-10 pr-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold text-sm tracking-wide shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
                >
                  {submitting ? 'Authenticating...' : 'Sign In to Control Console'}
                </button>

                {/* Quick Fill Role Credentials */}
                <div className="pt-4 border-t border-slate-800/80 space-y-2">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Quick-Fill Role Accounts (Password: vista2027)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEmail('superadmin@vista.nmamit.in');
                        setPassword('vista2027');
                      }}
                      className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-amber-500/50 text-left transition-all cursor-pointer"
                    >
                      <div className="text-xs font-bold text-amber-400">Super Admin</div>
                      <div className="text-[10px] text-slate-400 truncate">superadmin@vista.nmamit.in</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail('auctioneer@vista.nmamit.in');
                        setPassword('vista2027');
                      }}
                      className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-emerald-500/50 text-left transition-all cursor-pointer"
                    >
                      <div className="text-xs font-bold text-emerald-400">Auctioneer</div>
                      <div className="text-[10px] text-slate-400 truncate">auctioneer@vista.nmamit.in</div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmail('operator@vista.nmamit.in');
                        setPassword('vista2027');
                      }}
                      className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-indigo-500/50 text-left transition-all cursor-pointer"
                    >
                      <div className="text-xs font-bold text-indigo-400">Bid Operator</div>
                      <div className="text-[10px] text-slate-400 truncate">operator@vista.nmamit.in</div>
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      </main>

      {/* ========================================================================= */}
      {/* PUBLIC SPECTATOR PLAYERS SHOWCASE & LIVE SEARCH POOL (ZERO ADMIN CONTROLS) */}
      {/* ========================================================================= */}
      <section className="w-full max-w-[1500px] mx-auto px-4 lg:px-8 pb-20 space-y-6">
        {/* Showcase Header & Auction Switcher */}
        <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-[#0C101D] to-slate-900 border border-slate-800/90 p-6 sm:p-8 shadow-2xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
                  <Flame className="w-5 h-5 text-amber-400 animate-pulse" />
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-black uppercase tracking-widest">
                  Public Spectator Pool
                </div>
                {showcaseAuction && (
                  <StatusBadge status={showcaseAuction.status} />
                )}
              </div>

              <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight">
                Live Players Showcase{' '}
                <span className="bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 bg-clip-text text-transparent">
                  &amp; Auction Registry
                </span>
              </h2>
              <p className="text-slate-400 text-xs sm:text-sm max-w-2xl">
                Browse official auction players, categories, base prices, and live bidding status in real-time.
              </p>
            </div>

            {/* Auction Selector Pills (Instant Tab Switching between Tournaments) */}
            {auctions.length > 1 && (
              <div className="flex flex-col gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                  Select Committee Auction:
                </span>
                <div className="flex flex-wrap gap-2">
                  {auctions.map(auc => {
                    const isSelected = auc.id === showcaseAuctionId;
                    return (
                      <button
                        key={auc.id}
                        type="button"
                        onClick={() => {
                          setShowcaseAuctionId(auc.id);
                          setSelectedAuctionId(auc.id);
                          setSelectedPool('ALL');
                          setSelectedStatus('ALL');
                        }}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-2 ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20 font-black'
                            : 'bg-slate-950/80 hover:bg-slate-800 text-slate-300 border-slate-800'
                        }`}
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>{auc.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${isSelected ? 'bg-amber-600 text-white font-extrabold' : 'bg-slate-800 text-slate-400'}`}>
                          {auc.itemsCount}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Spectator Tournament KPI Ribbon */}
          <div className="mt-6 pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/90 text-center">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total Players</div>
              <div className="font-mono-num font-black text-xl sm:text-2xl text-white mt-1">
                {showcaseSummary.total}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 text-center">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">Sold Players</div>
              <div className="font-mono-num font-black text-xl sm:text-2xl text-emerald-300 mt-1">
                {showcaseSummary.soldCount}
              </div>
              <div className="text-[10px] font-mono-num text-emerald-400/80 mt-0.5">
                {formatCurrency(showcaseSummary.totalSpend, showcaseAuction?.currency || 'INR', { preferBillions: true })}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-950/30 border border-amber-500/30 text-center">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">In Auction Now</div>
              <div className="font-mono-num font-black text-xl sm:text-2xl text-amber-300 mt-1 flex items-center justify-center gap-1.5">
                {showcaseSummary.active > 0 && <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />}
                {showcaseSummary.active}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800/90 text-center">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Upcoming In Queue</div>
              <div className="font-mono-num font-black text-xl sm:text-2xl text-slate-200 mt-1">
                {showcaseSummary.queued}
              </div>
            </div>

            <div className="col-span-2 sm:col-span-1 p-3.5 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 text-center">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-300">Overseas Stars</div>
              <div className="font-mono-num font-black text-xl sm:text-2xl text-indigo-200 mt-1">
                {showcaseSummary.overseasCount}
              </div>
            </div>
          </div>
        </div>

        {/* Filter & Live Search Toolbar */}
        <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 sm:p-5 shadow-xl space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Search Bar with Clear Button */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search by player name or category..."
                className="w-full rounded-xl bg-slate-950 border border-slate-800 pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-3 text-slate-400 hover:text-white transition cursor-pointer"
                  title="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Sorting Dropdown */}
            <div className="flex items-center gap-2 shrink-0">
              <ArrowUpDown className="w-4 h-4 text-slate-400" />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:border-amber-500"
              >
                <option value="QUEUE">Auction Queue Order</option>
                <option value="PRICE_DESC">Base Price: High to Low</option>
                <option value="PRICE_ASC">Base Price: Low to High</option>
                <option value="SOLD_DESC">Sold Price: High to Low</option>
                <option value="NAME">Player Name (A–Z)</option>
              </select>
            </div>
          </div>

          {/* Filter Pills Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
            {/* Category / Pool Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mr-1 flex items-center gap-1">
                <Filter className="w-3 h-3 text-amber-400" /> Category:
              </span>
              <button
                type="button"
                onClick={() => setSelectedPool('ALL')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  selectedPool === 'ALL'
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800'
                }`}
              >
                All Pools ({allShowcaseItems.length})
              </button>
              {poolOptions.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelectedPool(p)}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    selectedPool === p
                      ? 'bg-amber-500 text-slate-950 font-black'
                      : 'bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Status Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mr-1">
                Status:
              </span>
              {[
                { key: 'ALL', label: 'All' },
                { key: 'ACTIVE', label: '⚡ Live' },
                { key: 'SOLD', label: '✅ Sold' },
                { key: 'UNSOLD', label: '❌ Unsold' },
                { key: 'QUEUED', label: '⏳ Queued' }
              ].map(st => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setSelectedStatus(st.key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    selectedStatus === st.key
                      ? 'bg-amber-500 text-slate-950 font-black'
                      : 'bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800'
                  }`}
                >
                  {st.label}
                </button>
              ))}

              {/* Overseas Toggle */}
              <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />
              <button
                type="button"
                onClick={() => setOverseasFilter(overseasFilter === 'OVERSEAS' ? 'ALL' : 'OVERSEAS')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                  overseasFilter === 'OVERSEAS'
                    ? 'bg-indigo-500 text-white font-black'
                    : 'bg-slate-950 hover:bg-slate-800 text-slate-400 border border-slate-800'
                }`}
              >
                <span>✈️ Overseas Only</span>
              </button>
            </div>
          </div>
        </div>

        {/* Results Counter Header */}
        <div className="flex items-center justify-between px-1">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Showing <span className="text-amber-400 font-extrabold">{filteredShowcasePlayers.length}</span> of {allShowcaseItems.length} players
          </div>
          {searchQuery && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedPool('ALL');
                setSelectedStatus('ALL');
                setOverseasFilter('ALL');
              }}
              className="text-xs text-amber-400 hover:text-amber-300 font-bold transition cursor-pointer"
            >
              Reset all filters
            </button>
          )}
        </div>

        {/* Players Showcase Grid (Spectator Safe — Zero Admin Controls) */}
        {showcaseLoading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-10 h-10 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase">
              Loading Player Showcase...
            </p>
          </div>
        ) : filteredShowcasePlayers.length === 0 ? (
          <div className="rounded-3xl bg-slate-900/40 border border-dashed border-slate-800 p-12 text-center space-y-3">
            <Users className="w-12 h-12 text-slate-600 mx-auto" />
            <h3 className="font-display text-lg font-bold text-white">No Players Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No players match your search filter "{searchQuery}". Try clearing search or choosing "All Pools".
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedPool('ALL');
                setSelectedStatus('ALL');
                setOverseasFilter('ALL');
              }}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition cursor-pointer"
            >
              Reset Search
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
            {filteredShowcasePlayers.map(player => {
              const winningTeam = player.soldToTeamId ? teamsMap.get(player.soldToTeamId) : null;
              const isSold = player.status === 'SOLD';
              const isActive = player.status === 'ACTIVE';
              const isUnsold = player.status === 'UNSOLD';
              const isOverseas = isOverseasPlayer(player);

              return (
                <div
                  key={player.id}
                  onClick={() => setSelectedPlayerModal(player)}
                  className={`group relative rounded-3xl p-4 sm:p-5 transition-all duration-300 flex flex-col justify-between cursor-pointer border ${
                    isActive
                      ? 'bg-gradient-to-b from-rose-950/40 via-slate-900/95 to-slate-950 border-rose-500/70 shadow-2xl shadow-rose-950/50 ring-2 ring-rose-500/30'
                      : isSold
                      ? 'bg-gradient-to-b from-emerald-950/20 via-slate-900/90 to-slate-950 border-emerald-500/30 hover:border-emerald-500/60 shadow-lg'
                      : isUnsold
                      ? 'bg-slate-900/60 border-slate-800/80 hover:border-rose-500/40 opacity-85'
                      : 'bg-slate-900/80 border-slate-800/90 hover:border-amber-500/50 shadow-lg'
                  }`}
                >
                  {/* Top Status & Pool Ribbon */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700/80">
                      {player.poolName || 'General Pool'}
                    </span>

                    {isActive && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/25 text-rose-300 border border-rose-500/50 text-[10px] font-black uppercase tracking-wider animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                        LIVE IN AUCTION
                      </span>
                    )}

                    {isSold && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-extrabold uppercase tracking-wider">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        SOLD {winningTeam ? `• ${winningTeam.shortName || winningTeam.name}` : ''}
                      </span>
                    )}

                    {isUnsold && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-950/60 text-rose-300 border border-rose-800/60 text-[10px] font-bold uppercase tracking-wider">
                        <XCircle className="w-3 h-3 text-rose-400" />
                        UNSOLD
                      </span>
                    )}

                    {!isActive && !isSold && !isUnsold && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/60 text-[10px] font-mono-num font-semibold">
                        <Clock className="w-3 h-3" />
                        #{player.queueOrder !== undefined ? player.queueOrder + 1 : '—'}
                      </span>
                    )}
                  </div>

                  {/* Player Identity: Headshot + Info */}
                  <div className="flex items-start gap-3.5 mb-3">
                    <div className="relative shrink-0">
                      <ItemImage
                        item={player}
                        name={player.name}
                        poolName={player.poolName}
                        imageUrl={player.imageUrl}
                        className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl object-cover border border-slate-700/80 group-hover:scale-105 transition-transform duration-300 shadow-md"
                      />
                      {isOverseas && (
                        <div
                          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-indigo-600 border border-indigo-400 flex items-center justify-center text-xs shadow-md"
                          title="Overseas Player"
                        >
                          ✈️
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-extrabold text-base sm:text-lg text-white group-hover:text-amber-300 transition-colors truncate">
                        {player.name}
                      </h3>

                      {/* Category Pill */}
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          {player.poolName || 'Auction Player'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Pricing / Sale Strip */}
                  <div className="pt-2.5 border-t border-slate-800/80 mb-3">
                    {isSold ? (
                      <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/40">
                        <div className="flex items-center gap-2 min-w-0">
                          {winningTeam && (
                            <TeamLogo
                              team={winningTeam}
                              size="xs"
                              className="w-6 h-6 shrink-0"
                            />
                          )}
                          <div className="min-w-0">
                            <div className="text-[9px] font-extrabold uppercase tracking-wider text-emerald-400">
                              Winning Franchise
                            </div>
                            <div className="text-xs font-bold text-white truncate">
                              {winningTeam?.name || 'Franchise'}
                            </div>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">
                            Sold Price
                          </div>
                          <div className="font-mono-num font-black text-sm text-emerald-300">
                            {formatCurrency(player.soldAmount, showcaseAuction?.currency || 'INR', { preferBillions: true })}
                          </div>
                        </div>
                      </div>
                    ) : isActive ? (
                      <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-rose-950/40 border border-rose-500/40 animate-pulse">
                        <div>
                          <div className="text-[9px] font-extrabold uppercase tracking-wider text-rose-400">
                            Current Active Bid
                          </div>
                          <div className="font-mono-num font-black text-base text-white">
                            {formatCurrency(player.currentBid || player.basePrice, showcaseAuction?.currency || 'INR', { preferBillions: true })}
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider">
                          Bidding Live
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400 font-semibold">Base Price</span>
                        <span className="font-mono-num font-bold text-slate-200">
                          {formatCurrency(player.basePrice, showcaseAuction?.currency || 'INR', { preferBillions: true })}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Read-Only Inspect Button */}
                  <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-amber-400 group-hover:text-amber-300 font-bold transition">
                    <span>Inspect Career Profile</span>
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* SPECTATOR PLAYER PROFILE MODAL (READ-ONLY, ZERO ADMIN CONTROLS)           */}
      {/* ========================================================================= */}
      {selectedPlayerModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setSelectedPlayerModal(null)}
        >
          <div
            className="relative w-full max-w-xl rounded-3xl bg-gradient-to-br from-slate-900 via-[#0B0F1A] to-slate-900 border border-slate-800 p-6 sm:p-8 shadow-2xl space-y-6"
            onClick={e => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setSelectedPlayerModal(null)}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header Strip: Photo & Basic Details */}
            <div className="flex items-start gap-4 sm:gap-5">
              <div className="relative shrink-0">
                <ItemImage
                  item={selectedPlayerModal}
                  name={selectedPlayerModal.name}
                  poolName={selectedPlayerModal.poolName}
                  imageUrl={selectedPlayerModal.imageUrl}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-2 border-amber-500/40 shadow-xl"
                />
                {isOverseasPlayer(selectedPlayerModal) && (
                  <div
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-indigo-600 border-2 border-slate-900 flex items-center justify-center text-sm shadow-md"
                    title="Overseas Player"
                  >
                    ✈️
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0 pr-6">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                    {selectedPlayerModal.poolName || 'General Pool'}
                  </span>
                  <StatusBadge status={selectedPlayerModal.status} />
                </div>

                <h3 className="font-display font-extrabold text-2xl text-white">
                  {selectedPlayerModal.name}
                </h3>

                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    {selectedPlayerModal.poolName || 'Auction Player'}
                  </span>
                </div>
              </div>
            </div>

            {/* Auction Status & Financial Details */}
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/90 grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Base Price
                </div>
                <div className="font-mono-num font-black text-lg text-white mt-0.5">
                  {formatCurrency(selectedPlayerModal.basePrice, showcaseAuction?.currency || 'INR', { preferBillions: true })}
                </div>
              </div>

              {selectedPlayerModal.status === 'SOLD' ? (
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">
                    Sold Winning Bid
                  </div>
                  <div className="font-mono-num font-black text-lg text-emerald-300 mt-0.5">
                    {formatCurrency(selectedPlayerModal.soldAmount, showcaseAuction?.currency || 'INR', { preferBillions: true })}
                  </div>
                  {selectedPlayerModal.soldViaRtm && (
                    <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">
                      ★ Acquired via RTM Card
                    </span>
                  )}
                </div>
              ) : selectedPlayerModal.status === 'ACTIVE' ? (
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-400">
                    Live Active Bid
                  </div>
                  <div className="font-mono-num font-black text-lg text-rose-300 mt-0.5">
                    {formatCurrency(selectedPlayerModal.currentBid || selectedPlayerModal.basePrice, showcaseAuction?.currency || 'INR', { preferBillions: true })}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    Auction Queue
                  </div>
                  <div className="font-mono-num font-bold text-base text-slate-300 mt-0.5">
                    Order #{selectedPlayerModal.queueOrder !== undefined ? selectedPlayerModal.queueOrder + 1 : '—'}
                  </div>
                </div>
              )}
            </div>

            {/* Sold To Team Card (if sold) */}
            {selectedPlayerModal.status === 'SOLD' && selectedPlayerModal.soldToTeamId && (
              (() => {
                const team = teamsMap.get(selectedPlayerModal.soldToTeamId);
                return (
                  <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {team && <TeamLogo team={team} size="md" />}
                      <div>
                        <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">
                          Winning Franchise
                        </div>
                        <div className="text-sm font-bold text-white">
                          {team?.name || 'Franchise'} ({team?.code || ''})
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-extrabold uppercase tracking-wider">
                        Confirmed Sale
                      </span>
                    </div>
                  </div>
                );
              })()
            )}

            {/* Modal Footer (Read-Only) */}
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedPlayerModal(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition cursor-pointer"
              >
                Close Profile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
