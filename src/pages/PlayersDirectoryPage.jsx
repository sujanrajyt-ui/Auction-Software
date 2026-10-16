import React, { useState, useMemo, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  Users,
  Tv,
  ArrowUpDown,
  Upload,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Gavel,
  Shield,
  AlertCircle,
  Camera,
  Layers,
  Award,
  ChevronRight,
  X
} from 'lucide-react';
import { useAuctionSocket } from '../hooks/useAuctionSocket.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  VistaHeader,
  ItemImage,
  TeamLogo,
  OverseasPlane
} from '../components/Common.jsx';
import {
  formatCurrency,
  isOverseasPlayer,
  cleanPlayerKey,
  CRICKETER_VERIFIED_IMAGES,
  ROLES
} from '../../shared/constants.js';

export default function PlayersDirectoryPage() {
  const { auctionId } = useParams();
  const navigate = useNavigate();
  const { user, apiFetch } = useAuth();
  const { auction, connected, loading, error, fetchLatestState } = useAuctionSocket(auctionId);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPool, setSelectedPool] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [overseasFilter, setOverseasFilter] = useState('ALL'); // 'ALL' | 'OVERSEAS' | 'DOMESTIC'
  const [sortBy, setSortBy] = useState('QUEUE'); // 'QUEUE' | 'PRICE_DESC' | 'PRICE_ASC' | 'SOLD_DESC' | 'NAME'

  // Modals & Action States
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [uploadingItem, setUploadingItem] = useState(null);
  const [customImageUrl, setCustomImageUrl] = useState('');
  const [uploadPreview, setUploadPreview] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  const fileInputRef = useRef(null);

  const isAdmin =
    user?.role === ROLES.SUPER_ADMIN ||
    user?.auctionRole === ROLES.AUCTIONEER ||
    user?.auctionRole === ROLES.BID_OPERATOR ||
    user?.kind === 'ADMIN';

  // Extract all auction items and retentions
  const allItems = useMemo(() => {
    if (!auction?.items) return [];
    return auction.items;
  }, [auction]);

  // Extract distinct pools for filtering
  const poolOptions = useMemo(() => {
    const set = new Set();
    allItems.forEach(it => {
      if (it.poolName) set.add(it.poolName);
    });
    return Array.from(set);
  }, [allItems]);

  // Filter & Sort Pipeline
  const filteredPlayers = useMemo(() => {
    let list = [...allItems];

    // 1. Text Search (Name, Pool)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(it => {
        const nameMatch = it.name?.toLowerCase().includes(q);
        const poolMatch = it.poolName?.toLowerCase().includes(q);
        return nameMatch || poolMatch;
      });
    }

    // 2. Pool Filter
    if (selectedPool !== 'ALL') {
      list = list.filter(it => it.poolName === selectedPool);
    }

    // 3. Status Filter
    if (selectedStatus !== 'ALL') {
      list = list.filter(it => it.status === selectedStatus);
    }

    // 4. Overseas Filter
    if (overseasFilter === 'OVERSEAS') {
      list = list.filter(it => isOverseasPlayer(it));
    } else if (overseasFilter === 'DOMESTIC') {
      list = list.filter(it => !isOverseasPlayer(it));
    }

    // 5. Sorting
    list.sort((a, b) => {
      if (sortBy === 'QUEUE') {
        return (a.queueOrder || 0) - (b.queueOrder || 0);
      }
      if (sortBy === 'PRICE_DESC') {
        return (b.basePrice || 0) - (a.basePrice || 0);
      }
      if (sortBy === 'PRICE_ASC') {
        return (a.basePrice || 0) - (b.basePrice || 0);
      }
      if (sortBy === 'SOLD_DESC') {
        return (b.soldAmount || 0) - (a.soldAmount || 0);
      }
      if (sortBy === 'NAME') {
        return (a.name || '').localeCompare(b.name || '');
      }
      return 0;
    });

    return list;
  }, [allItems, searchQuery, selectedPool, selectedStatus, overseasFilter, sortBy, auction]);

  // Statistics Summary
  const statsSummary = useMemo(() => {
    const total = allItems.length;
    const queued = allItems.filter(i => i.status === 'QUEUED').length;
    const active = allItems.filter(i => i.status === 'ACTIVE').length;
    const sold = allItems.filter(i => i.status === 'SOLD');
    const unsold = allItems.filter(i => i.status === 'UNSOLD').length;
    const totalSpend = sold.reduce((acc, cur) => acc + (Number(cur.soldAmount) || 0), 0);

    return {
      total,
      queued,
      active,
      soldCount: sold.length,
      unsold,
      totalSpend
    };
  }, [allItems]);

  // Handle Manual Image Upload from File
  const handleFileSelect = e => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 12 * 1024 * 1024) {
      alert('File size exceeds 12MB. Please select a smaller image.');
      return;
    }

    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result;
      setUploadPreview(dataUrl);
      setCustomImageUrl(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveUploadedImage = async () => {
    if (!uploadingItem || !customImageUrl.trim()) return;
    setActionLoading(true);
    try {
      await apiFetch(`/api/auctions/${auctionId}/items/${uploadingItem.id}/upload-image`, {
        method: 'POST',
        body: JSON.stringify({ imageUrl: customImageUrl.trim() })
      });
      setFeedbackMsg({ type: 'success', text: `Image updated successfully for ${uploadingItem.name}!` });
      setUploadingItem(null);
      setUploadPreview(null);
      setCustomImageUrl('');
      await fetchLatestState(true);
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to update image.' });
    } finally {
      setActionLoading(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  // Handle Auto Deduplicate Trigger
  const handleAutoDeduplicate = async () => {
    if (!window.confirm('Automatically scan and delete any duplicate players in this auction? Sold/retained copies will be preserved.')) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/auctions/${auctionId}/items/deduplicate`, {
        method: 'POST'
      });
      if (res.removedCount > 0) {
        setFeedbackMsg({
          type: 'success',
          text: `Cleaned up ${res.removedCount} duplicate players (${res.removedNames.join(', ')})!`
        });
      } else {
        setFeedbackMsg({ type: 'success', text: 'No duplicates found! Your auction roster is 100% unique.' });
      }
      await fetchLatestState(true);
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Deduplication failed.' });
    } finally {
      setActionLoading(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  // Handle Refresh Image with Verified Online Portrait
  const handleRefreshImage = async item => {
    setActionLoading(true);
    try {
      await apiFetch(`/api/auctions/${auctionId}/items/${item.id}/refresh-image`, {
        method: 'POST'
      });
      setFeedbackMsg({ type: 'success', text: `Refreshed athlete portrait for ${item.name}!` });
      await fetchLatestState(true);
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to refresh image.' });
    } finally {
      setActionLoading(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  if (loading && !auction) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
          <p className="text-slate-400 font-medium">Loading Players Showcase...</p>
        </div>
      </div>
    );
  }

  if (error || !auction) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-xl font-bold text-white mb-2">Auction Not Found</h2>
          <p className="text-slate-400 text-sm mb-6">{error || 'Unable to load auction roster.'}</p>
          <Link
            to="/"
            className="inline-block px-5 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-bold hover:bg-amber-400"
          >
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500/30 selection:text-amber-200">
      {/* Universal Top Header */}
      <VistaHeader
        subtitle="Auction Players Showcase & Live Directory"
        auction={auction}
        connected={connected}
        rightActions={
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <Link
                to={`/admin/auction/${auction.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition"
              >
                <Gavel className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Admin Panel</span>
              </Link>
            ) : (
              <Link
                to={`/team/${auction.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold transition"
              >
                <Shield className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">Team Console</span>
              </Link>
            )}
          </div>
        }
      />

      {/* Toast Feedback */}
      {feedbackMsg && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div
            className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-2xl border text-sm font-bold ${
              feedbackMsg.type === 'error'
                ? 'bg-rose-950 border-rose-700 text-rose-200'
                : 'bg-emerald-950 border-emerald-700 text-emerald-200'
            }`}
          >
            {feedbackMsg.type === 'error' ? (
              <XCircle className="w-5 h-5 text-rose-400" />
            ) : (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Hero Banner & Live Quick Metrics */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800/90 p-5 sm:p-7 shadow-2xl">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-extrabold uppercase tracking-widest mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Verified Players Pool</span>
              </div>
              <h1 className="font-display font-black text-2xl sm:text-4xl text-white tracking-tight">
                {auction.name}
              </h1>
              <p className="text-slate-400 text-sm sm:text-base mt-1.5 max-w-2xl leading-relaxed">
                Live roster showcasing every athlete registered under the hammer. Search by player name,
                or filter by category and auction status.
              </p>
            </div>

            {/* Admin Quick Action Button */}
            {isAdmin && (
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleAutoDeduplicate}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600/25 hover:bg-indigo-600/40 text-indigo-200 border border-indigo-500/40 text-xs font-black uppercase tracking-wider transition shadow-lg cursor-pointer disabled:opacity-50"
                  title="Automatically scan and delete redundant duplicate players"
                >
                  <Trash2 className="w-4 h-4 text-indigo-400" />
                  <span>Auto-Delete Duplicates</span>
                </button>
              </div>
            )}
          </div>

          {/* Broadcast Roster Metrics Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-6 border-t border-slate-800/80">
            <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-3 text-center">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Total Pool</span>
              <div className="font-mono-num font-black text-xl sm:text-2xl text-white mt-0.5">{statsSummary.total}</div>
            </div>
            <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-3 text-center">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-400">Upcoming / Queued</span>
              <div className="font-mono-num font-black text-xl sm:text-2xl text-indigo-300 mt-0.5">{statsSummary.queued}</div>
            </div>
            <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-3 text-center">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400">Active / Sold</span>
              <div className="font-mono-num font-black text-xl sm:text-2xl text-emerald-300 mt-0.5">{statsSummary.soldCount}</div>
            </div>
            <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-3 text-center">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-rose-400">Unsold</span>
              <div className="font-mono-num font-black text-xl sm:text-2xl text-rose-300 mt-0.5">{statsSummary.unsold}</div>
            </div>
            <div className="rounded-2xl bg-slate-950/80 border border-slate-800 p-3 text-center col-span-2 sm:col-span-1 lg:col-span-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400">Total Hammer Spend</span>
              <div className="font-mono-num font-black text-xl sm:text-2xl text-amber-300 mt-0.5">
                {formatCurrency(statsSummary.totalSpend, auction.currency)}
              </div>
            </div>
          </div>
        </section>

        {/* Sticky Search, Filters & Sorters */}
        <div className="sticky top-16 z-30 space-y-3 bg-slate-950/95 backdrop-blur-md pt-2 pb-3 border-b border-slate-800/80">
          {/* Main Search Bar & Sort Dropdown */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search player by name or category..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-11 pr-10 py-3 bg-slate-900/90 border border-slate-700/80 rounded-2xl text-white placeholder-slate-400 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition shadow-inner"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Sorter Dropdown */}
            <div className="flex items-center gap-2">
              <div className="relative shrink-0">
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="appearance-none bg-slate-900 border border-slate-700/80 rounded-2xl pl-4 pr-9 py-3 text-xs font-bold text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer shadow"
                >
                  <option value="QUEUE">Sort: Queue Order (#)</option>
                  <option value="PRICE_DESC">Base Price: High to Low</option>
                  <option value="PRICE_ASC">Base Price: Low to High</option>
                  <option value="SOLD_DESC">Sold Price: High to Low</option>
                  <option value="NAME">Alphabetical (A - Z)</option>
                </select>
                <ArrowUpDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Category / Pool Filter Pills & Status Filter Pills */}
          <div className="flex flex-col gap-2">
            {/* Status Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-extrabold uppercase tracking-wider scrollbar-none">
              <span className="text-[10px] text-slate-500 mr-1 font-bold">STATUS:</span>
              {[
                { id: 'ALL', label: 'All Players' },
                { id: 'QUEUED', label: 'Available / Queued' },
                { id: 'ACTIVE', label: 'Under Hammer' },
                { id: 'SOLD', label: 'Sold' },
                { id: 'UNSOLD', label: 'Unsold' }
              ].map(st => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setSelectedStatus(st.id)}
                  className={`px-3 py-1 rounded-full border transition whitespace-nowrap cursor-pointer ${
                    selectedStatus === st.id
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-sm'
                      : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            {/* Pools / Roles Pills */}
            {poolOptions.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-extrabold uppercase tracking-wider scrollbar-none">
                <span className="text-[10px] text-slate-500 mr-1 font-bold">CATEGORY:</span>
                <button
                  type="button"
                  onClick={() => setSelectedPool('ALL')}
                  className={`px-3 py-1 rounded-full border transition whitespace-nowrap cursor-pointer ${
                    selectedPool === 'ALL'
                      ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                      : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                  }`}
                >
                  All Pools ({allItems.length})
                </button>
                {poolOptions.map(pName => {
                  const count = allItems.filter(i => i.poolName === pName).length;
                  return (
                    <button
                      key={pName}
                      type="button"
                      onClick={() => setSelectedPool(pName)}
                      className={`px-3 py-1 rounded-full border transition whitespace-nowrap cursor-pointer ${
                        selectedPool === pName
                          ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                          : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      {pName} ({count})
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Players Grid */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
              Showing {filteredPlayers.length} of {allItems.length} Athletes
            </span>
          </div>

          {filteredPlayers.length === 0 ? (
            <div className="rounded-3xl bg-slate-900/50 border border-slate-800/80 p-12 text-center">
              <Users className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-white mb-1">No Players Found</h3>
              <p className="text-slate-400 text-sm max-w-md mx-auto mb-5">
                No players match your search filter "{searchQuery}". Try clearing filters or searching another keyword.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedPool('ALL');
                  setSelectedStatus('ALL');
                  setOverseasFilter('ALL');
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-bold"
              >
                Clear All Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPlayers.map((item, idx) => {
                const isOverseas = isOverseasPlayer(item);
                const winningTeam = item.soldToTeamId
                  ? auction.teams?.find(t => t.id === item.soldToTeamId)
                  : null;

                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedPlayer(item)}
                    className={`group relative overflow-hidden rounded-3xl bg-gradient-to-b from-slate-900/90 to-slate-950 border transition-all duration-200 cursor-pointer p-4 sm:p-5 flex flex-col justify-between hover:shadow-2xl hover:border-slate-600 ${
                      item.status === 'ACTIVE'
                        ? 'border-emerald-500/70 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/50'
                        : item.status === 'SOLD'
                        ? 'border-amber-500/40'
                        : item.status === 'UNSOLD'
                        ? 'border-rose-900/40 opacity-90'
                        : 'border-slate-800/90'
                    }`}
                  >
                    {/* Top Row: Headshot + Player Basic Info + Status Badge */}
                    <div>
                      <div className="flex items-start gap-4">
                        <div className="relative shrink-0">
                          <ItemImage
                            item={item}
                            name={item.name}
                            poolName={item.poolName}
                            imageUrl={item.imageUrl}
                            className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover shadow-lg border border-slate-700 group-hover:scale-105 transition-transform"
                          />
                          {isOverseas && (
                            <span
                              title="Overseas Player"
                              className="absolute -top-1.5 -right-1.5 text-base bg-slate-900/90 border border-slate-700 rounded-full w-6 h-6 flex items-center justify-center shadow"
                            >
                              ✈️
                            </span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[10px] font-extrabold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-slate-800/90 text-slate-300 border border-slate-700 truncate max-w-[130px]">
                              {item.poolName}
                            </span>

                            {/* Status Pills */}
                            {item.status === 'ACTIVE' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/50 animate-pulse">
                                Under Hammer
                              </span>
                            )}
                            {item.status === 'SOLD' && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/50">
                                Sold
                              </span>
                            )}
                            {item.status === 'UNSOLD' && (
                              <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/50">
                                Unsold
                              </span>
                            )}
                            {item.status === 'QUEUED' && (
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-slate-800 text-slate-400">
                                #{item.queueOrder}
                              </span>
                            )}
                          </div>

                          <h3 className="font-display font-black text-lg text-white group-hover:text-amber-400 transition-colors truncate">
                            {item.name}
                          </h3>

                          {/* Base Price */}
                          <div className="mt-1 flex items-baseline gap-1.5">
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                              Base:
                            </span>
                            <span className="font-mono-num font-bold text-xs sm:text-sm text-slate-200">
                              {formatCurrency(item.basePrice, auction.currency)}
                            </span>
                          </div>

                          {/* Sold Details */}
                          {item.status === 'SOLD' && winningTeam && (
                            <div className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-500/15 via-emerald-500/10 to-transparent border border-amber-500/30">
                              <TeamLogo team={winningTeam} size="xs" />
                              <div className="truncate">
                                <div className="text-[9px] font-extrabold uppercase tracking-wider text-amber-300">
                                  Won by {winningTeam.shortName || winningTeam.name}
                                </div>
                                <div className="font-mono-num font-black text-xs text-white">
                                  {formatCurrency(item.soldAmount, auction.currency)}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Admin Quick Action Bar */}
                    {isAdmin && (
                      <div
                        className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-end gap-2"
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setUploadingItem(item);
                            setCustomImageUrl(item.imageUrl || '');
                            setUploadPreview(item.imageUrl || null);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                          title="Upload custom image for this player"
                        >
                          <Camera className="w-3.5 h-3.5 text-amber-400" />
                          <span>Upload Image</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRefreshImage(item)}
                          disabled={actionLoading}
                          className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition disabled:opacity-50"
                          title="Re-fetch verified online cricketer portrait"
                        >
                          <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Manual Upload Image Modal */}
      {uploadingItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-slate-900 border border-slate-700 rounded-3xl p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-amber-400" />
                <h3 className="font-display font-black text-lg text-white">
                  Upload Player Headshot
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUploadingItem(null);
                  setUploadPreview(null);
                }}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400 mb-4">
              Upload an authentic cricketer headshot for <strong className="text-white">{uploadingItem.name}</strong>.
              Supports local image files (JPG, PNG, WEBP) or entering an image URL.
            </p>

            {/* Preview Box */}
            <div className="flex flex-col items-center justify-center p-4 rounded-2xl bg-slate-950 border border-slate-800 mb-4">
              {uploadPreview ? (
                <img
                  src={uploadPreview}
                  alt="Preview"
                  className="w-32 h-32 rounded-2xl object-cover border-2 border-amber-500 shadow-xl"
                />
              ) : (
                <div className="w-32 h-32 rounded-2xl bg-slate-900 border border-slate-700 flex flex-col items-center justify-center text-slate-500">
                  <Upload className="w-8 h-8 mb-1" />
                  <span className="text-[10px] font-bold">No Image Selected</span>
                </div>
              )}
            </div>

            {/* Hidden File Input */}
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />

            <div className="space-y-3 mb-5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition"
              >
                <Upload className="w-4 h-4 text-amber-400" />
                <span>Choose Local Photo from Device</span>
              </button>

              <div className="relative">
                <span className="text-[10px] font-extrabold uppercase text-slate-500 block mb-1">
                  Or Paste Direct Image URL:
                </span>
                <input
                  type="url"
                  placeholder="https://upload.wikimedia.org/...jpg"
                  value={customImageUrl}
                  onChange={e => {
                    setCustomImageUrl(e.target.value);
                    setUploadPreview(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setUploadingItem(null);
                  setUploadPreview(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveUploadedImage}
                disabled={actionLoading || !customImageUrl.trim()}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition disabled:opacity-50"
              >
                {actionLoading ? 'Saving Image...' : 'Save & Broadcast'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded Player Detail Modal */}
      {selectedPlayer && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-7 shadow-2xl animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-4">
                <ItemImage
                  item={selectedPlayer}
                  name={selectedPlayer.name}
                  poolName={selectedPlayer.poolName}
                  imageUrl={selectedPlayer.imageUrl}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border border-slate-700 shadow-xl"
                />
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-black uppercase tracking-wider px-3 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      {selectedPlayer.poolName}
                    </span>
                    {isOverseasPlayer(selectedPlayer) && (
                      <span className="text-xs font-bold uppercase px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700">
                        ✈️ Overseas
                      </span>
                    )}
                  </div>
                  <h2 className="font-display font-black text-2xl sm:text-3xl text-white">
                    {selectedPlayer.name}
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlayer(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Status Breakdown Card */}
            <div className="rounded-2xl bg-slate-950 border border-slate-800 p-4 mb-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-extrabold uppercase tracking-widest text-slate-400">
                  Auction Status
                </span>
                <span
                  className={`text-xs font-black uppercase px-3 py-1 rounded-full ${
                    selectedPlayer.status === 'ACTIVE'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                      : selectedPlayer.status === 'SOLD'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                      : selectedPlayer.status === 'UNSOLD'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/50'
                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}
                >
                  {selectedPlayer.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
                  <span className="text-slate-400 font-semibold block mb-0.5">Base Price:</span>
                  <span className="font-mono-num font-black text-sm text-white">
                    {formatCurrency(selectedPlayer.basePrice, auction.currency)}
                  </span>
                </div>

                {selectedPlayer.status === 'SOLD' && (
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800/80">
                    <span className="text-slate-400 font-semibold block mb-0.5">Sold Amount:</span>
                    <span className="font-mono-num font-black text-sm text-amber-400">
                      {formatCurrency(selectedPlayer.soldAmount, auction.currency)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedPlayer(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
