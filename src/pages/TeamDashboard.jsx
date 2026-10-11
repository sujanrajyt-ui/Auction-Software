import React, { useState } from 'react';
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
  Layers
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useAuctionSocket } from '../hooks/useAuctionSocket.js';
import {
  VistaHeader,
  TeamLogo,
  ItemImage,
  StatusBadge,
  OverseasPlane,
  PlayerStatsBar
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

  const [subTab, setSubTab] = useState('SQUAD'); // 'SQUAD' | 'RETENTIONS' | 'ALL_TEAMS'

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
                  {isIpl && (
                    <span className="px-2.5 py-0.5 rounded-full bg-sky-500/15 border border-sky-500/35 text-sky-300 text-[10px] font-extrabold">
                      ✈️ {myOverseasCount}/8
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

              <PlayerStatsBar
                playerName={activeItem.name}
                poolName={activeItem.poolName}
                auction={auction}
                size="md"
              />
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

        {/* Navigation Pills for Squad, Retentions & All Teams Purse Standings */}
        <div className="flex items-center gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
          {[
            {
              id: 'SQUAD',
              label: `My Squad & Purchases (${myTeam.squadCount})`
            },
            {
              id: 'RETENTIONS',
              label: `Retentions Board (${auction.retentions?.length || 0})`
            },
            {
              id: 'ALL_TEAMS',
              label: `All Teams Overview (${auction.teams?.length || 0})`
            }
          ].map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider shrink-0 transition-all cursor-pointer ${
                subTab === t.id
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-900 text-slate-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
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

        {/* SUB-TAB 3: ALL TEAMS PURSE OVERVIEW */}
        {subTab === 'ALL_TEAMS' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {(auction.teams || []).map(t => (
              <div
                key={t.id}
                className={`p-4 rounded-2xl border flex items-center justify-between ${
                  t.id === myTeam.id
                    ? 'bg-slate-900 border-amber-500/60'
                    : 'bg-slate-900/80 border-slate-800'
                }`}
                style={{ borderLeftWidth: '4px', borderLeftColor: t.primaryColor }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TeamLogo team={t} size="sm" />
                  <div className="min-w-0">
                    <div className="font-display font-bold text-sm text-white truncate">
                      {t.name}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5 flex-wrap">
                      <span>Squad: {t.squadCount}</span>
                      <span>•</span>
                      <span>Spent: {formatCurrency(t.totalSpent, cur)}</span>
                      {t.rtmTotal > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-purple-300 font-semibold">
                            RTM {t.rtmRemaining}/{t.rtmTotal}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase text-slate-400">Purse</div>
                  <div className="font-mono-num text-sm font-extrabold text-amber-400">
                    {formatCurrency(t.remainingPurse, cur)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
