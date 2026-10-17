import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Maximize2, Minimize2, Gavel, Trophy, PauseCircle, Wifi, WifiOff } from 'lucide-react';
import { useAuctionSocket } from '../hooks/useAuctionSocket.js';
import {
  TeamLogo,
  ItemImage,
  SoundControl,
  StatusBadge,
  OverseasPlane
} from '../components/Common.jsx';
import Day1SummaryView from '../components/Day1SummaryView.jsx';
import { AUCTION_STATES, formatCurrency } from '../../shared/constants.js';

export default function ProjectorView() {
  const { auctionId } = useParams();
  const { auction, connected, loading } = useAuctionSocket(auctionId);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => {});
      setIsFullscreen(false);
    }
  };

  if (loading && !auction) {
    return (
      <div className="min-h-screen bg-[#05070B] text-white flex items-center justify-center">
        <div className="text-xl font-display font-extrabold text-amber-400 animate-pulse tracking-widest uppercase">
          VISTA PRESENTS THE VERDICT • LOADING PROJECTOR...
        </div>
      </div>
    );
  }

  if (!auction) {
    return (
      <div className="min-h-screen bg-[#05070B] text-white flex items-center justify-center">
        <div className="text-xl font-bold text-rose-400">Auction Display Not Found</div>
      </div>
    );
  }

  const cur = auction.currency;
  const activeItem = auction.activeItem;
  const highestTeam = activeItem?.highestBidderTeam;

  // Check if 3-second SOLD or UNSOLD dramatic screen is active OR Day 1 Summary is active
  const overlay =
    auction.projectorOverlay &&
    (auction.projectorOverlay.type === 'DAY_1_SUMMARY' ||
      (auction.projectorOverlay.expiresAt && auction.projectorOverlay.expiresAt > nowTick))
      ? auction.projectorOverlay
      : null;

  // Show RETENTION BOARD automatically in READY state (or before first item begins)
  const showRetentionBoard =
    !overlay &&
    (auction.status === AUCTION_STATES.READY ||
      (auction.status === AUCTION_STATES.DRAFT && auction.retentionsPublished));

  return (
    <div className="min-h-screen w-screen bg-[#05070B] text-white flex flex-col justify-between overflow-hidden select-none relative">
      {/* Ambient Dynamic Team Colour Spotlight Background */}
      <div
        className="pointer-events-none fixed inset-0 transition-all duration-700 opacity-30"
        style={{
          background:
            overlay?.type === 'SOLD' && overlay.teamPrimaryColor
              ? `radial-gradient(circle at 50% 35%, ${overlay.teamPrimaryColor}88 0%, transparent 70%)`
              : highestTeam && highestTeam.primaryColor
              ? `radial-gradient(circle at 68% 38%, ${highestTeam.primaryColor}66 0%, transparent 65%)`
              : 'radial-gradient(circle at 50% 25%, rgba(245, 158, 11, 0.22) 0%, transparent 65%)'
        }}
      />

      {/* Top Event Hall Header Bar */}
      <header className="relative z-20 px-4 sm:px-6 lg:px-8 py-3 sm:py-3.5 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="h-10 sm:h-12 px-2.5 sm:px-3 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-center shadow-lg">
            <img
              src="/vista-logo.png"
              alt="VISTA"
              className="h-6 sm:h-8 w-auto object-contain drop-shadow"
            />
          </div>
          <div>
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="font-display font-extrabold text-base sm:text-xl tracking-wider text-white">
                PRESENTS <span className="text-amber-400">THE VERDICT</span>
              </span>
              <span className="hidden sm:inline-block px-2.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-extrabold tracking-widest">
                NMAMIT
              </span>
            </div>
            <div className="text-xs sm:text-sm font-semibold text-slate-400 truncate max-w-[210px] sm:max-w-none">
              {auction.name} • <span className="text-amber-400/90">{auction.committeeName}</span>
            </div>
          </div>
        </div>

        {/* OFFICIAL EVENT SPONSORS BAR (ALWAYS VISIBLE ON PROJECTOR) */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-5">
          {/* Title Sponsor: Side Quest (Larger Hero Badge) */}
          <div className="flex items-center gap-2.5 sm:gap-4 px-3 sm:px-5 py-1.5 sm:py-2 rounded-2xl bg-gradient-to-r from-purple-950/95 via-purple-900/60 to-slate-900 border-2 border-purple-400/70 shadow-2xl ring-2 ring-purple-500/25">
            <img
              src="/sponsors/sidequest-title-sponsor.jpg"
              alt="Side Quest - Title Sponsor"
              className="h-11 w-11 sm:h-16 sm:w-16 rounded-xl sm:rounded-2xl object-cover border-2 border-amber-400/80 shadow-xl shrink-0"
            />
            <div className="leading-tight">
              <div className="text-[9px] sm:text-[11px] font-extrabold uppercase tracking-[0.2em] text-amber-300">
                ★ Title Sponsor
              </div>
              <div className="font-display font-extrabold text-sm sm:text-xl lg:text-2xl text-white tracking-wide uppercase drop-shadow">
                Side Quest
              </div>
            </div>
          </div>

          {/* Beverage Sponsor: Blinker */}
          <div className="flex items-center gap-2 sm:gap-3 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-2xl bg-gradient-to-r from-emerald-950/70 via-slate-900/95 to-slate-900 border border-emerald-500/40 shadow-lg">
            <div className="h-8 sm:h-11 px-2 sm:px-2.5 rounded-xl bg-white flex items-center justify-center border border-emerald-400/50 shadow-md shrink-0">
              <img
                src="/sponsors/blinker-beverage-sponsor.jpg"
                alt="Blinker - Beverage Sponsor"
                className="h-6 sm:h-8 w-auto object-contain"
              />
            </div>
            <div className="leading-tight">
              <div className="text-[8px] sm:text-[9px] font-extrabold uppercase tracking-[0.18em] text-emerald-300">
                Beverage Sponsor
              </div>
              <div className="font-display font-extrabold text-xs sm:text-sm lg:text-base text-white tracking-wide uppercase">
                Blinker
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <StatusBadge status={auction.status} size="lg" />
          <span
            className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
              connected
                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-700/50'
                : 'bg-rose-950/60 text-rose-400 border-rose-700/50'
            }`}
          >
            {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {connected ? 'LIVE ARENA FEED' : 'RECONNECTING...'}
          </span>
          <SoundControl />
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 sm:p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* PAUSED OVERLAY BANNER (Hidden when Day 1 Summary is active) */}
      {auction.status === AUCTION_STATES.PAUSED && overlay?.type !== 'DAY_1_SUMMARY' && (
        <div className="relative z-30 bg-amber-500 text-slate-950 py-2.5 sm:py-3 px-4 sm:px-8 flex items-center justify-center gap-2 sm:gap-3 font-display font-extrabold text-sm sm:text-2xl tracking-[0.15em] sm:tracking-[0.2em] uppercase shadow-2xl text-center">
          <PauseCircle className="w-5 h-5 sm:w-7 sm:h-7 stroke-[2.5] shrink-0" />
          AUCTION PAUSED — CURRENT BID & ITEM STATE LOCKED
        </div>
      )}

      {/* MAIN STAGE AREA */}
      <main className="relative z-10 flex-1 flex flex-col justify-center px-4 sm:px-8 py-4 sm:py-6 max-w-[1850px] w-full mx-auto">
        {/* 0. END OF DAY 1 SUMMARY SHOWCASE */}
        {overlay?.type === 'DAY_1_SUMMARY' ? (
          <Day1SummaryView auction={auction} />
        ) : overlay?.type === 'SOLD' ? (
          <div
            className="rounded-3xl sm:rounded-[2.5rem] border-4 p-5 sm:p-10 lg:p-14 text-center shadow-2xl animate-sold-pop flex flex-col items-center justify-center space-y-5 sm:space-y-6"
            style={{
              background: `linear-gradient(135deg, ${overlay.teamPrimaryColor}45 0%, #090D16 55%, ${overlay.teamSecondaryColor || '#F59E0B'}35 100%)`,
              borderColor: overlay.teamPrimaryColor || '#10B981'
            }}
          >
            <div className="inline-flex items-center gap-3 px-6 sm:px-8 py-2 sm:py-2.5 rounded-full bg-amber-500 text-slate-950 font-display font-extrabold text-xl sm:text-3xl lg:text-4xl tracking-[0.18em] uppercase shadow-xl">
              {overlay.soldViaRtm ? '⚡ SOLD VIA RTM!' : '🏆 SOLD!'}
            </div>

            <div className="flex flex-col lg:flex-row items-center justify-center gap-6 sm:gap-10 mt-2 w-full">
              <ItemImage
                name={overlay.itemName}
                poolName={overlay.poolName}
                imageUrl={overlay.itemImageUrl}
                className="w-36 h-44 sm:w-48 sm:h-56 lg:w-60 lg:h-68 rounded-3xl object-cover border-4 border-amber-400 shadow-2xl"
              />

              <div className="text-center lg:text-left space-y-4 w-full max-w-2xl">
                <div className="text-xs sm:text-base font-extrabold uppercase tracking-[0.25em] text-amber-300">
                  {overlay.poolName}
                </div>
                <h1 className="font-display text-3xl sm:text-5xl lg:text-7xl font-extrabold text-white tracking-tight uppercase break-words">
                  {overlay.itemName}
                  <OverseasPlane
                    playerName={overlay.itemName}
                    auction={auction}
                    className="ml-2 sm:ml-3 text-2xl sm:text-4xl lg:text-5xl"
                  />
                </h1>

                <div className="flex items-center justify-center lg:justify-start gap-4 sm:gap-5 pt-2">
                  <TeamLogo
                    name={overlay.teamName}
                    shortName={overlay.teamShortName}
                    logoUrl={overlay.teamLogoUrl}
                    primaryColor={overlay.teamPrimaryColor}
                    size="xl"
                  />
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-300 font-bold">
                      {overlay.soldViaRtm ? 'MATCHED VIA RTM BY' : 'ACQUIRED BY'}
                    </div>
                    <div className="font-display text-2xl sm:text-4xl lg:text-5xl font-extrabold text-white uppercase">
                      {overlay.teamName}
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-baseline justify-center lg:justify-start gap-4 sm:gap-8">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-slate-400 font-bold">
                      WINNING BID
                    </div>
                    <div className="font-mono-num text-3xl sm:text-5xl lg:text-7xl font-extrabold text-emerald-400">
                      {formatCurrency(overlay.amount, cur)}
                    </div>
                  </div>
                  <div className="px-5 py-2.5 sm:px-6 sm:py-3 rounded-2xl bg-slate-950/90 border border-slate-700">
                    <div className="text-xs uppercase tracking-widest text-slate-400 font-bold">
                      Remaining Purse
                    </div>
                    <div className="font-mono-num text-2xl sm:text-3xl lg:text-4xl font-extrabold text-amber-400">
                      {formatCurrency(overlay.remainingPurse, cur)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : overlay?.type === 'UNSOLD' ? (
          /* 2. DRAMATIC 3-SECOND UNSOLD OVERLAY */
          <div className="rounded-3xl sm:rounded-[2.5rem] bg-gradient-to-br from-rose-950/80 via-slate-950 to-slate-900 border-4 border-rose-500 p-6 sm:p-12 lg:p-16 text-center shadow-2xl animate-sold-pop flex flex-col items-center justify-center space-y-5 sm:space-y-6">
            <div className="inline-block px-6 sm:px-10 py-2 sm:py-3 rounded-full bg-rose-600 text-white font-display font-extrabold text-2xl sm:text-4xl lg:text-5xl tracking-[0.2em] uppercase shadow-xl">
              UNSOLD
            </div>
            <ItemImage
              name={overlay.itemName}
              poolName={overlay.poolName}
              imageUrl={overlay.itemImageUrl}
              className="w-36 h-44 sm:w-44 sm:h-52 rounded-3xl object-cover border-2 border-rose-400/60 opacity-90"
            />
            <div className="text-xs sm:text-sm font-extrabold uppercase tracking-[0.25em] text-rose-300">
              {overlay.poolName}
            </div>
            <h1 className="font-display text-3xl sm:text-5xl lg:text-7xl font-extrabold text-white uppercase tracking-tight break-words">
              {overlay.itemName}
              <OverseasPlane
                playerName={overlay.itemName}
                auction={auction}
                className="ml-2 sm:ml-3 text-2xl sm:text-4xl lg:text-5xl"
              />
            </h1>
          </div>
        ) : showRetentionBoard ? (
          /* 3. RETENTION BOARD */
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <div className="text-xs font-extrabold uppercase tracking-[0.25em] text-amber-400">
                  PRE-AUCTION RETENTIONS
                </div>
                <h1 className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white uppercase tracking-wide">
                  RETENTION BOARD — {auction.name}
                </h1>
              </div>
              <div className="text-left sm:text-right">
                <div className="text-xs uppercase text-slate-400 font-bold">Starting Purse</div>
                <div className="font-mono-num text-xl sm:text-2xl font-extrabold text-amber-400">
                  {formatCurrency(auction.startingPurse, cur, { preferBillions: true })}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {(auction.teams || []).map(team => (
                <div
                  key={team.id}
                  className="rounded-3xl bg-slate-900/90 border border-slate-800 p-4 flex flex-col justify-between gap-3 shadow-xl"
                  style={{ borderTopWidth: '5px', borderTopColor: team.primaryColor }}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <TeamLogo team={team} size="md" />
                        <div className="min-w-0">
                          <div className="font-display font-extrabold text-base text-white truncate">
                            {team.name}
                          </div>
                          <div className="text-xs font-mono-num text-amber-400 font-bold">
                            Purse: {formatCurrency(team.remainingPurse, cur)}
                          </div>
                        </div>
                      </div>
                      {team.rtmTotal > 0 && (
                        <span className="px-2 py-0.5 rounded-lg bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[10px] font-extrabold shrink-0">
                          RTM: {team.rtmRemaining}/{team.rtmTotal}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 space-y-1.5">
                      {(team.retentions || []).map(ret => (
                        <div
                          key={ret.id}
                          className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800/90 flex items-center justify-between text-xs"
                        >
                          <span className="font-bold text-white truncate pr-2">
                            {ret.playerName}
                            <OverseasPlane
                              playerName={ret.playerName}
                              auction={auction}
                              className="ml-1 text-xs"
                            />
                          </span>
                          <span className="font-mono-num font-extrabold text-amber-400 shrink-0">
                            {formatCurrency(ret.amount, cur)}
                          </span>
                        </div>
                      ))}
                      {(!team.retentions || team.retentions.length === 0) && (
                        <div className="py-4 text-center text-xs text-slate-500 italic">
                          No retentions
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Retention Spend:</span>
                    <span className="font-mono-num font-bold text-rose-300">
                      {formatCurrency(team.retentionSpend, cur)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : activeItem ? (
          /* 4. LIVE ACTIVE ITEM STAGE */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-center">
            {/* Left 5 Cols: Large Player / Item Portrait & Base Price */}
            <div className="lg:col-span-5 flex flex-col items-center lg:items-start text-center lg:text-left">
              <div className="relative">
                <ItemImage
                  item={activeItem}
                  accentColor={highestTeam?.primaryColor || '#F59E0B'}
                  className="w-52 h-60 sm:w-64 sm:h-76 lg:w-88 lg:h-[410px] rounded-[2rem] object-cover border-4 shadow-2xl"
                />
                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 px-5 sm:px-6 py-1.5 sm:py-2 rounded-full bg-slate-950 border-2 border-amber-500/60 shadow-xl whitespace-nowrap">
                  <span className="text-[11px] sm:text-xs font-extrabold uppercase tracking-[0.2em] text-amber-400">
                    {activeItem.poolName}
                  </span>
                </div>
              </div>
            </div>

            {/* Right 7 Cols: Dominant Name, Stats, Current Bid & Highest Bidder */}
            <div className="lg:col-span-7 space-y-4 sm:space-y-5">
              <div className="text-center lg:text-left">
                <div className="text-xs sm:text-sm font-extrabold uppercase tracking-[0.2em] sm:tracking-[0.25em] text-slate-400">
                  ON THE AUCTION BLOCK • BASE PRICE:{' '}
                  <span className="text-white font-mono-num">
                    {formatCurrency(activeItem.basePrice, cur)}
                  </span>
                </div>
                <h1 className="font-display text-3xl sm:text-6xl lg:text-7xl font-extrabold text-white tracking-tight uppercase mt-1.5 sm:mt-2 leading-[1.05] break-words">
                  {activeItem.name}
                  <OverseasPlane
                    playerName={activeItem.name}
                    auction={auction}
                    className="ml-2 sm:ml-3 text-2xl sm:text-4xl lg:text-5xl"
                  />
                </h1>
              </div>

              {/* Dominant CURRENT BID & HIGHEST BIDDER Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                {/* CURRENT BID */}
                <div className="rounded-3xl bg-slate-900/95 border-2 border-amber-500/60 p-5 sm:p-7 shadow-2xl animate-pulse-glow">
                  <div className="text-xs sm:text-sm font-extrabold uppercase tracking-[0.2em] text-amber-300">
                    CURRENT BID
                  </div>
                  <div className="font-mono-num text-4xl sm:text-5xl lg:text-7xl font-extrabold text-amber-400 mt-1.5 sm:mt-2">
                    {activeItem.currentBid > 0
                      ? formatCurrency(activeItem.currentBid, cur)
                      : formatCurrency(activeItem.basePrice, cur)}
                  </div>
                  <div className="mt-2 sm:mt-3 text-xs sm:text-sm font-mono-num text-slate-400">
                    {activeItem.currentBid > 0
                      ? `Next Bid: ${formatCurrency(activeItem.nextBidAmount, cur)} (+${formatCurrency(activeItem.currentIncrement, cur)})`
                      : 'Opening Bid at Base Price'}
                  </div>
                </div>

                {/* HIGHEST BIDDER */}
                <div
                  className="rounded-3xl bg-slate-900/95 border-2 p-5 sm:p-7 shadow-2xl flex flex-col justify-between"
                  style={{
                    borderColor: highestTeam?.primaryColor || '#334155',
                    background: highestTeam?.primaryColor
                      ? `linear-gradient(135deg, ${highestTeam.primaryColor}30 0%, #0F172A 100%)`
                      : undefined
                  }}
                >
                  <div className="text-xs sm:text-sm font-extrabold uppercase tracking-[0.2em] text-slate-300">
                    HIGHEST BIDDER
                  </div>
                  {highestTeam ? (
                    <div className="flex items-center gap-4 sm:gap-5 my-2">
                      <TeamLogo team={highestTeam} size="xl" />
                      <div className="min-w-0">
                        <div className="font-display text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white uppercase leading-tight break-words">
                          {highestTeam.name}
                        </div>
                        <div className="mt-1 sm:mt-1.5 text-xs sm:text-sm font-mono-num text-amber-300 font-bold">
                          Remaining Purse: {formatCurrency(highestTeam.remainingPurse, cur)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="my-auto font-display text-2xl sm:text-3xl font-extrabold text-slate-500 uppercase py-2">
                      AWAITING OPENING BID
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : auction.status === AUCTION_STATES.COMPLETED ? (
          /* 5. COMPLETED AUCTION FINAL SHOWCASE */
          <div className="space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-5 py-1.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs sm:text-sm font-extrabold uppercase tracking-widest">
                <Trophy className="w-4 h-4" /> AUCTION COMPLETED
              </div>
              <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white uppercase mt-2">
                {auction.name} — Final Team Summary
              </h1>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
              {(auction.teams || []).map(t => (
                <div
                  key={t.id}
                  className="rounded-3xl bg-slate-900/90 border border-slate-800 p-4 space-y-3"
                  style={{ borderTopWidth: '5px', borderTopColor: t.primaryColor }}
                >
                  <div className="flex items-center gap-3">
                    <TeamLogo team={t} size="md" />
                    <div className="min-w-0">
                      <div className="font-display font-extrabold text-base text-white truncate">
                        {t.name}
                      </div>
                      <div className="text-xs text-slate-400">Squad: {t.squadCount}</div>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Spent:</span>
                    <span className="font-mono-num font-bold text-emerald-400">
                      {formatCurrency(t.totalSpent, cur)}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400">Final Purse:</span>
                    <span className="font-mono-num font-bold text-amber-400">
                      {formatCurrency(t.remainingPurse, cur)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* 6. STANDBY BETWEEN ITEMS */
          <div className="text-center space-y-5 sm:space-y-6">
            <img
              src="/vista-logo.png"
              alt="VISTA"
              className="h-14 sm:h-20 w-auto object-contain mx-auto drop-shadow-2xl"
            />
            <h1 className="font-display text-3xl sm:text-5xl lg:text-6xl font-extrabold text-white uppercase tracking-tight">
              {auction.name}
            </h1>
            <p className="text-sm sm:text-lg text-slate-400 font-semibold uppercase tracking-widest">
              Standby for Next Item
            </p>

            {/* Large Sponsor Showcase on Standby Screen */}
            <div className="pt-2 sm:pt-4 flex flex-wrap items-center justify-center gap-5 sm:gap-8">
              <div className="rounded-3xl bg-gradient-to-br from-purple-950/95 via-purple-900/50 to-slate-950 border-2 border-purple-400/80 ring-4 ring-purple-500/20 p-5 sm:p-8 flex items-center gap-4 sm:gap-6 shadow-2xl sm:scale-105">
                <img
                  src="/sponsors/sidequest-title-sponsor.jpg"
                  alt="Side Quest - Title Sponsor"
                  className="h-20 w-20 sm:h-32 sm:w-32 rounded-2xl sm:rounded-3xl object-cover border-2 border-amber-400/80 shadow-2xl"
                />
                <div className="text-left">
                  <div className="text-xs sm:text-sm font-extrabold uppercase tracking-[0.22em] text-amber-300">
                    ★ Title Sponsor
                  </div>
                  <div className="font-display text-2xl sm:text-4xl lg:text-6xl font-extrabold text-white uppercase mt-1 drop-shadow">
                    Side Quest
                  </div>
                </div>
              </div>

              <div className="rounded-3xl bg-gradient-to-br from-emerald-950/80 via-slate-900 to-slate-950 border-2 border-emerald-500/50 p-4 sm:p-5 flex items-center gap-4 sm:gap-5 shadow-2xl">
                <div className="h-14 sm:h-20 px-3 sm:px-4 rounded-2xl bg-white flex items-center justify-center border-2 border-emerald-400/60 shadow-xl">
                  <img
                    src="/sponsors/blinker-beverage-sponsor.jpg"
                    alt="Blinker - Beverage Sponsor"
                    className="h-10 sm:h-14 w-auto object-contain"
                  />
                </div>
                <div className="text-left">
                  <div className="text-[10px] sm:text-xs font-extrabold uppercase tracking-[0.22em] text-emerald-300">
                    Beverage Sponsor
                  </div>
                  <div className="font-display text-xl sm:text-2xl lg:text-3xl font-extrabold text-white uppercase mt-1">
                    Blinker
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* BOTTOM ALL-TEAMS LIVE PURSE BAR */}
      <footer className="relative z-20 bg-slate-950/95 border-t border-slate-800/90 px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-[1850px] mx-auto grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2.5">
          {(auction.teams || []).map(team => {
            const isLeading = activeItem?.highestBidderTeamId === team.id;
            return (
              <div
                key={team.id}
                className={`rounded-2xl p-2.5 border transition-all flex items-center gap-2.5 ${
                  isLeading
                    ? 'bg-slate-900 ring-2 ring-amber-400 scale-[1.03]'
                    : 'bg-slate-900/75 border-slate-800'
                }`}
                style={{
                  borderBottomWidth: '4px',
                  borderBottomColor: team.primaryColor
                }}
              >
                <TeamLogo team={team} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="font-display font-bold text-xs text-white truncate">
                      {team.shortName || team.name}
                    </div>
                    {team.rtmTotal > 0 && (
                      <span className="text-[9px] font-mono-num font-bold text-purple-300 bg-purple-500/15 px-1 rounded">
                        RTM {team.rtmRemaining}
                      </span>
                    )}
                  </div>
                  <div className="font-mono-num text-sm font-extrabold text-amber-400 truncate">
                    {formatCurrency(team.remainingPurse, cur)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </footer>
    </div>
  );
}
