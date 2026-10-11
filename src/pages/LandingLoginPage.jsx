import React, { useState, useEffect } from 'react';
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
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { VistaHeader, StatusBadge, TeamLogo } from '../components/Common.jsx';
import { formatCurrency, BUILTIN_LOGOS } from '../../shared/constants.js';

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

  useEffect(() => {
    apiFetch('/api/public/auctions')
      .then(data => {
        const list = data.auctions || [];
        setAuctions(list);
        if (list.length > 0 && !selectedAuctionId) {
          setSelectedAuctionId(list[0].id);
        }
      })
      .catch(() => {});
  }, [apiFetch]);

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
    </div>
  );
}
