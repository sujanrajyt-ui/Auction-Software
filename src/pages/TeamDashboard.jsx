import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Trophy,
  Wallet,
  Users,
  Lock,
  Sparkles,
  CheckCircle2,
  X,
  Eye,
  TrendingUp,
  Layers,
  Search,
  ArrowRight,
  Shield,
  ChevronRight
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useAuctionSocket } from '../hooks/useAuctionSocket.js';
import {
  VistaHeader,
  TeamLogo,
  ItemImage,
  StatusBadge,
  OverseasPlane
} from '../components/Common.jsx';
import {
  formatCurrency,
  AUCTION_STATES,
  isIplAuction,
  getTeamOverseasCount
} from '../../shared/constants.js';

export default function TeamDashboard() {
  const { auctionId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    auction,
    connected,
    loading,
    error,
    teamWinNotification,
    dismissWinNotification
  } = useAuctionSocket(auctionId, user?.teamId);

  const [subTab, setSubTab] = useState('SQUAD'); // 'SQUAD' | 'ALL_TEAMS' | 'RETENTIONS'
  const [selectedOtherTeamId, setSelectedOtherTeamId] = useState(null);
  const [playerSearchQuery, setPlayerSearchQuery] = useState('');
  const [allTeamsViewMode, setAllTeamsViewMode] = useState('FOCUS'); // 'FOCUS' | 'GRID'

  if (loading && !auction) {
    return (
      <div className="min-h-screen bg-[#07090E] text-white flex items-center justify-center">
        <div className="text-sm font-bold text-amber-400 animate-pulse">
          Loading Team Panel...
        </div>
      </div>
    );
  }

  if (error || !auction) {
    return (
      <div className="min-h-screen bg-[#07090E] text-white flex flex-col items-center justify-center gap-4 p-6">
        <div className="text-rose-400 font-bold">{error || 'Auction not found'}</div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
        >
          Return to Login
        </button>
      </div>
    );
  }

  const cur = auction.currency;
  const myTeam =
    auction.teams?.find(t => t.id === user?.teamId || t.code === user?.code) ||
    auction.teams?.[0];

  if (!myTeam) {
    return (
      <div className="min-h-screen bg-[#07090E] text-white flex items-center justify-center p-6">
        Team profile not found in this auction.
      </div>
    );
  }

  const activeItem = auction.activeItem;
  const isMyTeamLeading = activeItem?.highestBidderTeamId === myTeam.id;
  const isIpl = isIplAuction(auction);
  const myOverseasCount = isIpl ? getTeamOverseasCount(myTeam, auction) : 0;

  const activeWinBanner =
    teamWinNotification ||
    (auction.projectorOverlay?.type === 'SOLD' &&
    auction.projectorOverlay?.teamId === myTeam.id &&
    auction.projectorOverlay?.expiresAt > Date.now()
      ? auction.projectorOverlay
      : null);

  return (
    <div className="min-h-screen bg-[#07090E] text-slate-100 flex flex-col">
      <VistaHeader
        auction={auction}
        connected={connected}
        rightActions={
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-700 text-[11px] font-bold text-slate-300">
            <Eye className="w-3.5 h-3.5 text-amber-400" />
            TEAM VIEW
          </span>
        }
      />

      {/* Winning Notification on every device logged into this team */}
      {activeWinBanner && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div
            className="w-full max-w-lg rounded-3xl p-8 text-center border-2 shadow-2xl animate-sold-pop relative overflow-hidden"
            style={{
              background: `linear-gradient(145deg, ${myTeam.primaryColor}35, #0B0F19 65%, ${myTeam.secondaryColor}25)`,
              borderColor: myTeam.primaryColor
            }}
          >
            <button
              type="button"
              onClick={dismissWinNotification}
              className="absolute top-4 right-4 p-2 rounded-full bg-slate-900/80 text-slate-300 hover:text-white cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center mx-auto mb-4">
              <Trophy className="w-9 h-9 text-amber-400" />
            </div>

            <div className="text-xs font-extrabold uppercase tracking-[0.25em] text-amber-400">
              {activeWinBanner.soldViaRtm
                ? `RTM MATCHED BY ${myTeam.name.toUpperCase()}!`
                : `CONGRATULATIONS ${myTeam.name.toUpperCase()}!`}
            </div>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-white mt-2">
              YOU SIGNED {activeWinBanner.itemName?.toUpperCase()}
              <OverseasPlane
                playerName={activeWinBanner.itemName}
                auction={auction}
                className="ml-2 text-2xl"
              />
            </h2>

            {activeWinBanner.itemImageUrl && (
              <ItemImage
                name={activeWinBanner.itemName}
                poolName={activeWinBanner.poolName}
                imageUrl={activeWinBanner.itemImageUrl}
                className="w-28 h-28 rounded-2xl object-cover mx-auto my-4 shadow-xl"
              />
            )}

            <div className="inline-block px-6 py-2.5 rounded-2xl bg-slate-950/90 border border-amber-500/40 font-mono-num text-2xl sm:text-3xl font-extrabold text-emerald-400 mt-1">
              {formatCurrency(activeWinBanner.amount, cur)}
            </div>

            <div className="mt-4 text-xs text-slate-300 font-mono-num">
              Remaining Purse:{' '}
              <strong className="text-amber-400">
                {formatCurrency(myTeam.remainingPurse, cur)}
              </strong>
            </div>

            <button
              type="button"
              onClick={dismissWinNotification}
              className="mt-6 w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider cursor-pointer"
            >
              Continue to Live Auction
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-5 space-y-5">
        {/* Team Hero Card */}
        <div
          className="rounded-3xl p-5 sm:p-7 border-2 shadow-2xl relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${myTeam.primaryColor}28 0%, #0B0F1A 60%, ${myTeam.secondaryColor}18 100%)`,
            borderColor: `${myTeam.primaryColor}99`
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            {/* Team Identity */}
            <div className="flex items-center gap-4">
              <TeamLogo team={myTeam} size="xl" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest text-white"
                    style={{ backgroundColor: myTeam.primaryColor }}
                  >
                    {myTeam.code}
                  </span>
                  <StatusBadge status={auction.status} />
                  {myTeam.rtmTotal > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[10px] font-extrabold uppercase tracking-wider">
                      RTM Cards: {myTeam.rtmRemaining} / {myTeam.rtmTotal}
                    </span>
                  )}
                </div>
                <h1 className="font-display text-2xl sm:text-4xl font-extrabold text-white tracking-tight mt-1">
                  {myTeam.name.toUpperCase()}
                </h1>
                <div className="text-xs text-slate-300 mt-1 flex items-center gap-3 flex-wrap">
                  <span>
                    Starting Purse:{' '}
                    <strong className="font-mono-num text-white">
                      {formatCurrency(myTeam.startingPurse, cur, { preferBillions: true })}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Total Spent:{' '}
                    <strong className="font-mono-num text-rose-300">
                      {formatCurrency(myTeam.totalSpent, cur)}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Dominant Remaining Purse Display */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/90 border border-slate-800 text-left sm:text-right shrink-0">
              <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                REMAINING PURSE
              </div>
              <div className="font-mono-num text-3xl sm:text-4xl font-extrabold text-amber-400 mt-0.5">
                {formatCurrency(myTeam.remainingPurse, cur)}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Squad Size: <strong className="text-white">{myTeam.squadCount}</strong> (
                {myTeam.retentionsCount} Retained • {myTeam.purchasesCount} Purchased)
              </div>
            </div>
          </div>

          {/* Quick-action bar to check other teams squads */}
          <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <Users className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Want to analyze rival team rosters & remaining purses?
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setSubTab('ALL_TEAMS');
                const firstOther = (auction.teams || []).find(t => t.id !== myTeam.id);
                if (firstOther && !selectedOtherTeamId) {
                  setSelectedOtherTeamId(firstOther.id);
                }
              }}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-all active:scale-95"
            >
              <Users className="w-3.5 h-3.5" />
              Check Other Teams Squads
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Live Item & Current Bid Card */}
        <div className="rounded-3xl bg-slate-900/95 border border-slate-800 p-5 sm:p-6 shadow-xl">
          {auction.status === AUCTION_STATES.PAUSED && (
            <div className="mb-4 p-3 rounded-2xl bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-extrabold uppercase tracking-widest text-center">
              ⏸ AUCTION PAUSED — Current item and bid state remain intact
            </div>
          )}

          {activeItem ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-5 items-center">
                <div className="md:col-span-6 flex items-center gap-3.5 sm:gap-4">
                  <ItemImage
                    item={activeItem}
                    className="w-20 h-24 sm:w-28 sm:h-32 rounded-2xl object-cover shrink-0 shadow-lg border border-slate-700"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-widest text-amber-400">
                      CURRENT ITEM • {activeItem.poolName}
                    </div>
                    <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white mt-0.5 leading-tight break-words">
                      {activeItem.name.toUpperCase()}
                      <OverseasPlane
                        playerName={activeItem.name}
                        auction={auction}
                        className="ml-1.5 sm:ml-2 text-lg sm:text-xl"
                      />
                    </h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-400">
                      <span>
                        Base Price:{' '}
                        <strong className="font-mono-num text-white">
                          {formatCurrency(activeItem.basePrice, cur)}
                        </strong>
                      </span>
                      <span>•</span>
                      <span>
                        Increment:{' '}
                        <strong className="font-mono-num text-amber-400">
                          +{formatCurrency(activeItem.currentIncrement, cur)}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="md:col-span-6 grid grid-cols-2 gap-3">
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                      CURRENT BID
                    </div>
                    <div className="font-mono-num text-2xl sm:text-3xl font-extrabold text-amber-400 mt-1">
                      {activeItem.currentBid > 0
                        ? formatCurrency(activeItem.currentBid, cur)
                        : formatCurrency(activeItem.basePrice, cur)}
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-slate-400 mt-1">
                      {activeItem.currentBid > 0
                        ? `Next: ${formatCurrency(activeItem.nextBidAmount, cur)}`
                        : 'Awaiting Opening Bid'}
                    </div>
                  </div>

                  <div
                    className={`p-3.5 sm:p-4 rounded-2xl border flex flex-col justify-between ${
                      isMyTeamLeading
                        ? 'bg-emerald-950/50 border-emerald-400'
                        : 'bg-slate-950 border-slate-800'
                    }`}
                  >
                    <div className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                      HIGHEST BIDDER
                    </div>
                    {activeItem.highestBidderTeam ? (
                      <div className="flex items-center gap-2 sm:gap-2.5 mt-1.5">
                        <TeamLogo team={activeItem.highestBidderTeam} size="sm" />
                        <div className="min-w-0">
                          <div className="font-display font-extrabold text-sm sm:text-base text-white truncate">
                            {activeItem.highestBidderTeam.name}
                          </div>
                          {isMyTeamLeading && (
                            <span className="text-[10px] font-extrabold uppercase text-emerald-400">
                              ★ YOUR TEAM LEADS
                            </span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs font-bold text-slate-500 mt-2">No Bidder Yet</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center">
              <div className="text-xs font-extrabold uppercase tracking-widest text-amber-400">
                {auction.status}
              </div>
              <div className="font-display text-xl font-bold text-white mt-1">
                {auction.status === AUCTION_STATES.READY
                  ? 'Auction Ready — Waiting for First Item'
                  : auction.status === AUCTION_STATES.COMPLETED
                  ? 'Auction Completed'
                  : 'Waiting for Next Item'}
              </div>
            </div>
          )}
        </div>

        {/* Navigation Pills for Squad, Retentions & All Teams Squads */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
          {[
            {
              id: 'SQUAD',
              label: `My Squad (${myTeam.squadCount})`,
              icon: Users
            },
            {
              id: 'ALL_TEAMS',
              label: `Check All Teams Squads (${auction.teams?.length || 0})`,
              icon: Shield
            },
            {
              id: 'RETENTIONS',
              label: `Retentions Board (${auction.retentions?.length || 0})`,
              icon: Lock
            }
          ].map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setSubTab(t.id);
                  if (t.id === 'ALL_TEAMS') {
                    const firstOther = (auction.teams || []).find(tm => tm.id !== myTeam.id);
                    if (firstOther && !selectedOtherTeamId) {
                      setSelectedOtherTeamId(firstOther.id);
                    }
                  }
                }}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider shrink-0 transition-all cursor-pointer flex items-center gap-1.5 ${
                  subTab === t.id
                    ? 'bg-amber-500 text-slate-950 shadow-md'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {t.label}
              </button>
            );
          })}
        </div>

        {/* SUB-TAB 1: MY COMBINED SQUAD (RETENTIONS + PURCHASED ITEMS) */}
        {subTab === 'SQUAD' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Retained Players/Items */}
            <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-extrabold uppercase tracking-wider text-amber-400">
                  Retained Players ({myTeam.retentions?.length || 0})
                </h3>
                <span className="font-mono-num text-xs font-bold text-slate-300">
                  Spend: {formatCurrency(myTeam.retentionSpend, cur)}
                </span>
              </div>

              <div className="space-y-2">
                {(myTeam.retentions || []).map(ret => (
                  <div
                    key={ret.id}
                    className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ItemImage
                        name={ret.playerName}
                        poolName="RETENTION"
                        imageUrl={ret.imageUrl}
                        className="w-11 h-11 rounded-xl object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">
                          {ret.playerName}
                          <OverseasPlane playerName={ret.playerName} auction={auction} />
                        </div>
                        <span className="inline-block text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 mt-0.5">
                          RETENTION
                        </span>
                      </div>
                    </div>
                    <div className="font-mono-num text-sm font-extrabold text-amber-400 shrink-0">
                      {formatCurrency(ret.amount, cur)}
                    </div>
                  </div>
                ))}
                {(!myTeam.retentions || myTeam.retentions.length === 0) && (
                  <div className="py-6 text-center text-xs text-slate-500">
                    {auction.retentionsPublished || auction.status === AUCTION_STATES.LIVE
                      ? 'No retentions recorded for your team.'
                      : 'Retentions will appear here once published.'}
                  </div>
                )}
              </div>
            </div>

            {/* Purchased Players/Items */}
            <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-extrabold uppercase tracking-wider text-emerald-400">
                  Purchased Players ({myTeam.purchases?.length || 0})
                </h3>
                <span className="font-mono-num text-xs font-bold text-slate-300">
                  Spend: {formatCurrency(myTeam.purchaseSpend, cur)}
                </span>
              </div>

              <div className="space-y-2">
                {(myTeam.purchases || []).map(p => (
                  <div
                    key={p.id}
                    className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ItemImage
                        item={p}
                        className="w-11 h-11 rounded-xl object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-bold text-white truncate">{p.name}</span>
                          <OverseasPlane playerName={p.name} auction={auction} />
                          {p.soldViaRtm && (
                            <span className="px-1.5 py-0.5 rounded bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[9px] font-extrabold uppercase">
                              RTM
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-400">{p.poolName}</div>
                      </div>
                    </div>
                    <div className="font-mono-num text-sm font-extrabold text-emerald-400 shrink-0">
                      {formatCurrency(p.amount, cur)}
                    </div>
                  </div>
                ))}
                {(!myTeam.purchases || myTeam.purchases.length === 0) && (
                  <div className="py-6 text-center text-xs text-slate-500">
                    No auction purchases won yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SUB-TAB 2: LEAGUE RETENTIONS BOARD */}
        {subTab === 'RETENTIONS' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(auction.teams || []).map(t => (
              <div
                key={t.id}
                className="rounded-2xl bg-slate-900/90 border border-slate-800 p-4 space-y-3"
                style={{ borderTopWidth: '3px', borderTopColor: t.primaryColor }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <TeamLogo team={t} size="sm" />
                    <div className="font-display font-bold text-sm text-white">{t.name}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.rtmTotal > 0 && (
                      <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">
                        RTM: {t.rtmRemaining}/{t.rtmTotal}
                      </span>
                    )}
                    <span className="font-mono-num text-xs text-amber-400 font-bold">
                      Retained: {formatCurrency(t.retentionSpend, cur)}
                    </span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {(t.retentions || []).map(r => (
                    <div
                      key={r.id}
                      className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <span className="text-white font-semibold">
                        {r.playerName}
                        <OverseasPlane playerName={r.playerName} auction={auction} />
                      </span>
                      <span className="font-mono-num text-amber-400 font-bold">
                        {formatCurrency(r.amount, cur)}
                      </span>
                    </div>
                  ))}
                  {(!t.retentions || t.retentions.length === 0) && (
                    <div className="text-xs text-slate-500 py-2">No published retentions</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SUB-TAB 2: ALL TEAMS SQUADS EXPLORER */}
        {subTab === 'ALL_TEAMS' && (() => {
          const allTeams = auction.teams || [];
          const otherTeams = allTeams.filter(t => t.id !== myTeam.id);
          const effectiveSelectedId =
            selectedOtherTeamId || (otherTeams.length > 0 ? otherTeams[0].id : myTeam.id);
          const activeTeam =
            allTeams.find(t => t.id === effectiveSelectedId) || otherTeams[0] || myTeam;

          const q = playerSearchQuery.trim().toLowerCase();
          const searchResults = q
            ? allTeams.flatMap(team => {
                const retMatches = (team.retentions || [])
                  .filter(r => (r.playerName || '').toLowerCase().includes(q))
                  .map(r => ({
                    id: r.id,
                    name: r.playerName,
                    imageUrl: r.imageUrl,
                    type: 'RETENTION',
                    amount: r.amount,
                    team
                  }));
                const purMatches = (team.purchases || [])
                  .filter(
                    p =>
                      (p.name || '').toLowerCase().includes(q) ||
                      (p.poolName || '').toLowerCase().includes(q)
                  )
                  .map(p => ({
                    id: p.id,
                    name: p.name,
                    imageUrl: p.imageUrl,
                    poolName: p.poolName,
                    soldViaRtm: p.soldViaRtm,
                    type: 'PURCHASE',
                    amount: p.amount,
                    team
                  }));
                return [...retMatches, ...purMatches];
              })
            : [];

          return (
            <div className="space-y-5">
              {/* Controls Header: Search Bar + Mode Toggle */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={playerSearchQuery}
                    onChange={e => setPlayerSearchQuery(e.target.value)}
                    placeholder="Search any player across all teams (e.g. Shami, Chahal, Klaasen)..."
                    className="w-full pl-10 pr-10 py-2.5 rounded-2xl bg-slate-900 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                  {playerSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setPlayerSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-white px-1.5 py-0.5 rounded-full bg-slate-800 cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setPlayerSearchQuery('');
                      setAllTeamsViewMode('FOCUS');
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider cursor-pointer transition-all ${
                      allTeamsViewMode === 'FOCUS' && !playerSearchQuery
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    🎯 Single Team Focus
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPlayerSearchQuery('');
                      setAllTeamsViewMode('GRID');
                    }}
                    className={`px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider cursor-pointer transition-all ${
                      allTeamsViewMode === 'GRID' && !playerSearchQuery
                        ? 'bg-amber-500 text-slate-950 shadow-md'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    📋 All Squads Grid
                  </button>
                </div>
              </div>

              {/* SEARCH RESULTS VIEW */}
              {q ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>
                      Found <strong className="text-amber-400 font-mono-num">{searchResults.length}</strong> player(s) matching "{playerSearchQuery}"
                    </span>
                    <button
                      type="button"
                      onClick={() => setPlayerSearchQuery('')}
                      className="text-amber-400 hover:underline font-bold cursor-pointer"
                    >
                      Clear search
                    </button>
                  </div>

                  {searchResults.length === 0 ? (
                    <div className="py-12 text-center rounded-3xl bg-slate-900/60 border border-slate-800 text-slate-400 text-sm">
                      No player found matching "{playerSearchQuery}" across any team squad.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                      {searchResults.map(p => (
                        <div
                          key={`${p.team.id}-${p.type}-${p.id}`}
                          className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-3 shadow-md"
                          style={{ borderLeftWidth: '4px', borderLeftColor: p.team.primaryColor }}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <ItemImage
                              name={p.name}
                              poolName={p.poolName || p.type}
                              imageUrl={p.imageUrl}
                              className="w-12 h-12 rounded-xl object-cover shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="font-display font-bold text-sm text-white truncate flex items-center gap-1.5">
                                <span>{p.name}</span>
                                <OverseasPlane playerName={p.name} auction={auction} />
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <TeamLogo team={p.team} size="xs" />
                                <span className="text-xs font-bold text-slate-300 truncate">
                                  {p.team.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1">
                                {p.type === 'RETENTION' ? (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-extrabold uppercase">
                                    RETENTION
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-extrabold uppercase">
                                    PURCHASE
                                  </span>
                                )}
                                {p.soldViaRtm && (
                                  <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[9px] font-extrabold uppercase">
                                    RTM
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono-num text-sm font-extrabold text-amber-400">
                              {formatCurrency(p.amount, cur)}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOtherTeamId(p.team.id);
                                setPlayerSearchQuery('');
                                setAllTeamsViewMode('FOCUS');
                              }}
                              className="mt-1 text-[10px] font-extrabold text-slate-400 hover:text-white uppercase tracking-wider block cursor-pointer"
                            >
                              View Squad →
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : allTeamsViewMode === 'FOCUS' ? (
                /* SINGLE TEAM FOCUS VIEW */
                <div className="space-y-5">
                  {/* Team Selector Horizontal Strip */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-2">
                    {allTeams.map(t => {
                      const isSelected = t.id === activeTeam.id;
                      const isMine = t.id === myTeam.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedOtherTeamId(t.id)}
                          className={`px-3 py-2 rounded-2xl flex items-center gap-2.5 shrink-0 transition-all cursor-pointer border ${
                            isSelected
                              ? 'bg-slate-900 shadow-lg scale-102'
                              : 'bg-slate-950/70 hover:bg-slate-900/60 border-slate-800/80 opacity-80 hover:opacity-100'
                          }`}
                          style={{
                            borderColor: isSelected ? t.primaryColor : undefined,
                            boxShadow: isSelected ? `0 0 15px ${t.primaryColor}35` : undefined
                          }}
                        >
                          <TeamLogo team={t} size="xs" />
                          <div className="text-left">
                            <div className="flex items-center gap-1.5">
                              <span className="font-display font-extrabold text-xs text-white">
                                {t.code}
                              </span>
                              {isMine && (
                                <span className="text-[9px] font-black uppercase px-1 py-0.2 rounded bg-amber-500 text-slate-950">
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] font-mono-num text-amber-400 font-bold">
                              {formatCurrency(t.remainingPurse, cur, { preferBillions: true })}
                            </div>
                          </div>
                          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-800 text-[10px] font-bold text-slate-300">
                            {t.squadCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Selected Team Banner */}
                  <div
                    className="rounded-3xl p-5 sm:p-6 border-2 shadow-2xl relative overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${activeTeam.primaryColor}30 0%, #0B0F1A 65%, ${activeTeam.secondaryColor}20 100%)`,
                      borderColor: `${activeTeam.primaryColor}99`
                    }}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                      <div className="flex items-center gap-4">
                        <TeamLogo team={activeTeam} size="lg" />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest text-white"
                              style={{ backgroundColor: activeTeam.primaryColor }}
                            >
                              {activeTeam.code}
                            </span>
                            {activeTeam.id === myTeam.id && (
                              <span className="px-2.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-wider">
                                ★ Your Team
                              </span>
                            )}
                            {activeTeam.rtmTotal > 0 && (
                              <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[10px] font-extrabold">
                                RTM: {activeTeam.rtmRemaining} / {activeTeam.rtmTotal}
                              </span>
                            )}
                          </div>
                          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white mt-1">
                            {activeTeam.name.toUpperCase()}
                          </h2>
                          <div className="text-xs text-slate-300 mt-1 flex items-center gap-3 flex-wrap">
                            <span>
                              Starting Purse:{' '}
                              <strong className="font-mono-num text-white">
                                {formatCurrency(activeTeam.startingPurse, cur, { preferBillions: true })}
                              </strong>
                            </span>
                            <span>•</span>
                            <span>
                              Total Spent:{' '}
                              <strong className="font-mono-num text-rose-300">
                                {formatCurrency(activeTeam.totalSpent, cur)}
                              </strong>
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800 text-left sm:text-right shrink-0">
                        <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                          REMAINING PURSE
                        </div>
                        <div className="font-mono-num text-2xl sm:text-3xl font-extrabold text-amber-400 mt-0.5">
                          {formatCurrency(activeTeam.remainingPurse, cur)}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          Squad Size: <strong className="text-white">{activeTeam.squadCount}</strong> (
                          {activeTeam.retentionsCount} Retained • {activeTeam.purchasesCount} Purchased)
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Active Selected Team Squad Roster */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {/* Retained Players Column */}
                    <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-sm font-extrabold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                          <Lock className="w-4 h-4" />
                          Retained Players ({activeTeam.retentions?.length || 0})
                        </h3>
                        <span className="font-mono-num text-xs font-bold text-slate-300">
                          Spend: {formatCurrency(activeTeam.retentionSpend, cur)}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {(activeTeam.retentions || []).map(ret => (
                          <div
                            key={ret.id}
                            className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <ItemImage
                                name={ret.playerName}
                                poolName="RETENTION"
                                imageUrl={ret.imageUrl}
                                className="w-11 h-11 rounded-xl object-cover shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                                  <span>{ret.playerName}</span>
                                  <OverseasPlane playerName={ret.playerName} auction={auction} />
                                </div>
                                <span className="inline-block text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 mt-0.5">
                                  RETENTION
                                </span>
                              </div>
                            </div>
                            <div className="font-mono-num text-sm font-extrabold text-amber-400 shrink-0">
                              {formatCurrency(ret.amount, cur)}
                            </div>
                          </div>
                        ))}
                        {(!activeTeam.retentions || activeTeam.retentions.length === 0) && (
                          <div className="py-8 text-center text-xs text-slate-500">
                            No retentions recorded for {activeTeam.name}.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Purchased Players Column */}
                    <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-display text-sm font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                          <Trophy className="w-4 h-4" />
                          Auction Purchases ({activeTeam.purchases?.length || 0})
                        </h3>
                        <span className="font-mono-num text-xs font-bold text-slate-300">
                          Spend: {formatCurrency(activeTeam.purchaseSpend, cur)}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {(activeTeam.purchases || []).map(p => (
                          <div
                            key={p.id}
                            className="p-3 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <ItemImage
                                item={p}
                                className="w-11 h-11 rounded-xl object-cover shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-sm font-bold text-white truncate">{p.name}</span>
                                  <OverseasPlane playerName={p.name} auction={auction} />
                                  {p.soldViaRtm && (
                                    <span className="px-1.5 py-0.5 rounded bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[9px] font-extrabold uppercase">
                                      RTM
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-400">{p.poolName}</div>
                              </div>
                            </div>
                            <div className="font-mono-num text-sm font-extrabold text-emerald-400 shrink-0">
                              {formatCurrency(p.amount, cur)}
                            </div>
                          </div>
                        ))}
                        {(!activeTeam.purchases || activeTeam.purchases.length === 0) && (
                          <div className="py-8 text-center text-xs text-slate-500">
                            No auction purchases won yet by {activeTeam.name}.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ALL SQUADS GRID VIEW */
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {allTeams.map(t => {
                    const isMine = t.id === myTeam.id;
                    const allPlayers = [
                      ...(t.retentions || []).map(r => ({ ...r, name: r.playerName, isRetention: true })),
                      ...(t.purchases || []).map(p => ({ ...p, isRetention: false }))
                    ];

                    return (
                      <div
                        key={t.id}
                        className={`rounded-2xl bg-slate-900/90 border p-4 space-y-3.5 shadow-lg ${
                          isMine ? 'border-amber-400/80 bg-slate-900' : 'border-slate-800'
                        }`}
                        style={{ borderTopWidth: '4px', borderTopColor: t.primaryColor }}
                      >
                        {/* Team Card Header */}
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <TeamLogo team={t} size="md" />
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-display font-bold text-base text-white truncate">
                                  {t.name}
                                </span>
                                {isMine && (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[9px] font-black uppercase">
                                    YOU
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-2 flex-wrap mt-0.5">
                                <span>Squad: <strong className="text-white">{t.squadCount}</strong></span>
                                <span>•</span>
                                <span>Spent: <strong className="text-rose-300 font-mono-num">{formatCurrency(t.totalSpent, cur)}</strong></span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div className="text-[10px] uppercase tracking-wider text-slate-400">Purse</div>
                            <div className="font-mono-num text-sm sm:text-base font-extrabold text-amber-400">
                              {formatCurrency(t.remainingPurse, cur)}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedOtherTeamId(t.id);
                                setAllTeamsViewMode('FOCUS');
                              }}
                              className="mt-1 text-[10px] font-extrabold text-amber-400 hover:underline cursor-pointer"
                            >
                              Focus Squad →
                            </button>
                          </div>
                        </div>

                        {/* Players Compact List */}
                        <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                          {allPlayers.map((player, idx) => (
                            <div
                              key={`${player.id}-${idx}`}
                              className={`px-3 py-1.5 rounded-xl border flex items-center justify-between text-xs ${
                                player.isRetention
                                  ? 'bg-amber-500/10 border-amber-500/30'
                                  : 'bg-slate-950 border-slate-800/80'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <ItemImage
                                  name={player.name}
                                  poolName={player.poolName || (player.isRetention ? 'RETENTION' : 'AUCTION')}
                                  imageUrl={player.imageUrl}
                                  className="w-6 h-6 rounded-md object-cover shrink-0"
                                />
                                <span className="text-white font-medium truncate flex items-center gap-1">
                                  {player.name}
                                  <OverseasPlane playerName={player.name} auction={auction} />
                                </span>
                                {player.isRetention && (
                                  <span className="text-[9px] font-extrabold text-amber-400 shrink-0">
                                    [RET]
                                  </span>
                                )}
                                {player.soldViaRtm && (
                                  <span className="text-[9px] font-extrabold text-purple-300 shrink-0">
                                    [RTM]
                                  </span>
                                )}
                              </div>
                              <span
                                className={`font-mono-num font-bold shrink-0 ml-2 ${
                                  player.isRetention ? 'text-amber-400' : 'text-emerald-400'
                                }`}
                              >
                                {formatCurrency(player.amount, cur)}
                              </span>
                            </div>
                          ))}
                          {allPlayers.length === 0 && (
                            <div className="py-4 text-center text-xs text-slate-500">
                              No players acquired yet.
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
      </main>
    </div>
  );
}
