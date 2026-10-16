import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Crown,
  DollarSign,
  Users,
  Award,
  Sparkles,
  Play,
  Pause,
  Layers,
  ChevronRight,
  TrendingUp,
  Shield
} from 'lucide-react';
import { TeamLogo, ItemImage, OverseasPlane } from './Common.jsx';
import { formatCurrency } from '../../shared/constants.js';

export default function Day1SummaryView({ auction }) {
  const [viewMode, setViewMode] = useState('SPLIT'); // 'SPLIT' | 'SQUADS' | 'LEADERBOARD'
  const [selectedTeamIndex, setSelectedTeamIndex] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);

  const cur = auction?.currency || 'INR';
  const teams = auction?.teams || [];
  const soldItems = [...(auction?.soldItems || [])];
  const retentions = auction?.retentions || [];

  // Top 3 most expensive buys overall
  const top3 = [...soldItems]
    .sort((a, b) => (b.soldAmount || 0) - (a.soldAmount || 0))
    .slice(0, 3);

  // Financial calculations
  const totalDay1Spent = soldItems.reduce((acc, s) => acc + (s.soldAmount || 0), 0);
  const totalRemainingPurse = teams.reduce((acc, t) => acc + (t.remainingPurse || 0), 0);
  const sortedTeamsByPurse = [...teams].sort((a, b) => b.remainingPurse - a.remainingPurse);

  // Auto-rotate selected team every 7 seconds
  useEffect(() => {
    if (!autoRotate || teams.length === 0) return;
    const interval = setInterval(() => {
      setSelectedTeamIndex(prev => (prev + 1) % teams.length);
    }, 7000);
    return () => clearInterval(interval);
  }, [autoRotate, teams.length]);

  const selectedTeam = teams[selectedTeamIndex] || teams[0];
  const selectedTeamBuys = selectedTeam
    ? soldItems.filter(s => s.soldToTeamId === selectedTeam.id)
    : [];
  const selectedTeamRetentions = selectedTeam
    ? retentions.filter(r => r.teamId === selectedTeam.id)
    : [];
  const selectedTeamSpentToday = selectedTeamBuys.reduce(
    (acc, s) => acc + (s.soldAmount || 0),
    0
  );

  return (
    <div className="w-full flex-1 flex flex-col justify-between py-2 sm:py-3 space-y-4 sm:space-y-6">
      {/* 1. TOP BROADCAST HEADER & QUICK STATS BAR */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-gradient-to-r from-indigo-950/80 via-slate-900/90 to-amber-950/70 border border-amber-500/30 rounded-3xl p-3.5 sm:p-5 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-3 sm:gap-4 text-center md:text-left">
          <div className="p-3 sm:p-3.5 rounded-2xl bg-amber-500 text-slate-950 shadow-xl shadow-amber-500/25 shrink-0">
            <Trophy className="w-6 h-6 sm:w-8 sm:h-8 stroke-[2.5]" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] sm:text-xs font-extrabold uppercase tracking-widest">
              <Sparkles className="w-3 h-3 text-amber-400 animate-spin" /> OFFICIAL DAY 1 REPORT
            </div>
            <h1 className="font-display text-xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-wide uppercase drop-shadow mt-0.5">
              {auction.name} — <span className="text-amber-400">END OF DAY 1</span>
            </h1>
          </div>
        </div>

        {/* Aggregate Stats Cards */}
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          <div className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl bg-slate-950/90 border border-slate-800 text-center">
            <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
              Day 1 Spending
            </div>
            <div className="font-mono-num text-sm sm:text-lg lg:text-xl font-extrabold text-emerald-400">
              {formatCurrency(totalDay1Spent, cur)}
            </div>
          </div>
          <div className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl bg-slate-950/90 border border-slate-800 text-center">
            <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
              Players Bought
            </div>
            <div className="font-mono-num text-sm sm:text-lg lg:text-xl font-extrabold text-amber-400">
              {soldItems.length} Sold
            </div>
          </div>
          <div className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl bg-slate-950/90 border border-slate-800 text-center">
            <div className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">
              Purse Remaining
            </div>
            <div className="font-mono-num text-sm sm:text-lg lg:text-xl font-extrabold text-amber-300">
              {formatCurrency(totalRemainingPurse, cur)}
            </div>
          </div>

          {/* View Mode Toggle Controls */}
          <div className="flex items-center gap-1 bg-slate-950/95 p-1 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('SPLIT')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                viewMode === 'SPLIT'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Split View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('SQUADS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                viewMode === 'SQUADS'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All Squads
            </button>
            <button
              type="button"
              onClick={() => setViewMode('LEADERBOARD')}
              className={`px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
                viewMode === 'LEADERBOARD'
                  ? 'bg-amber-500 text-slate-950 shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Purse Leaderboard
            </button>
            <button
              type="button"
              onClick={() => setAutoRotate(!autoRotate)}
              className={`p-1.5 rounded-xl transition-all cursor-pointer ${
                autoRotate
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-800 text-slate-500 hover:text-slate-300'
              }`}
              title={autoRotate ? 'Auto-cycling teams (Active)' : 'Auto-cycling paused'}
            >
              {autoRotate ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
            </button>
          </div>
        </div>
      </div>

      {/* 2. TOP 3 MOST EXPENSIVE PICKS OVERALL (HERO PODIUM) */}
      {top3.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400" />
              <span className="font-display font-extrabold text-sm sm:text-base text-amber-300 tracking-wider uppercase">
                DAY 1 TOP 3 MOST EXPENSIVE BUYS OVERALL
              </span>
            </div>
            <span className="text-xs text-slate-400 font-semibold hidden sm:inline">
              Highest bids recorded on Day 1
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 items-stretch">
            {/* Rank #2 Podium Card (Silver) */}
            {top3[1] && (
              <div
                className="rounded-3xl p-4 sm:p-5 border-2 border-slate-400/60 bg-gradient-to-b from-slate-900/95 via-slate-900/80 to-slate-950 shadow-xl flex flex-col justify-between transition-all hover:scale-[1.01]"
                style={{
                  borderTopWidth: '6px',
                  borderTopColor: top3[1].soldToTeam?.primaryColor || '#94A3B8'
                }}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-700/60 text-slate-200 border border-slate-500 text-xs font-extrabold uppercase tracking-wider">
                      🥈 #2 HIGHEST PICK
                    </span>
                    <span className="text-[11px] font-bold text-slate-400 uppercase truncate">
                      {top3[1].poolName}
                    </span>
                  </div>

                  <div className="flex items-center gap-3.5 sm:gap-4">
                    <ItemImage
                      name={top3[1].name}
                      poolName={top3[1].poolName}
                      imageUrl={top3[1].imageUrl}
                      className="w-16 h-20 sm:w-20 sm:h-24 rounded-2xl object-cover border-2 border-slate-400/70 shadow-lg shrink-0"
                    />
                    <div className="min-w-0">
                      <h3 className="font-display text-lg sm:text-2xl font-extrabold text-white uppercase leading-tight truncate">
                        {top3[1].name}
                        <OverseasPlane playerName={top3[1].name} auction={auction} className="ml-1.5 text-base sm:text-lg" />
                      </h3>
                      <div className="mt-1 font-mono-num text-2xl sm:text-3xl font-extrabold text-emerald-400">
                        {formatCurrency(top3[1].soldAmount, cur)}
                      </div>
                      {top3[1].soldViaRtm && (
                        <span className="inline-block mt-1 px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[10px] font-extrabold uppercase">
                          MATCHED VIA RTM
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <TeamLogo team={top3[1].soldToTeam} size="sm" />
                    <span className="font-display font-extrabold text-xs sm:text-sm text-white truncate">
                      {top3[1].soldToTeam?.name || top3[1].soldToTeamName || 'Acquired'}
                    </span>
                  </div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                    BOUGHT
                  </span>
                </div>
              </div>
            )}

            {/* Rank #1 Podium Card (Gold — Crown Centerpiece) */}
            {top3[0] && (
              <div
                className="rounded-3xl p-4 sm:p-5 border-2 border-amber-400 bg-gradient-to-b from-amber-950/40 via-slate-900/90 to-slate-950 shadow-2xl ring-2 ring-amber-500/30 flex flex-col justify-between transition-all md:-translate-y-1 hover:scale-[1.01]"
                style={{
                  borderTopWidth: '6px',
                  borderTopColor: top3[0].soldToTeam?.primaryColor || '#F59E0B'
                }}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 text-xs font-black uppercase tracking-wider shadow-lg">
                      <Crown className="w-3.5 h-3.5 fill-current" /> #1 HIGHEST BUY OF DAY 1
                    </span>
                    <span className="text-[11px] font-extrabold text-amber-300 uppercase truncate">
                      {top3[0].poolName}
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    <ItemImage
                      name={top3[0].name}
                      poolName={top3[0].poolName}
                      imageUrl={top3[0].imageUrl}
                      className="w-20 h-24 sm:w-24 sm:h-28 rounded-2xl object-cover border-2 border-amber-400 shadow-2xl shrink-0"
                    />
                    <div className="min-w-0">
                      <h3 className="font-display text-xl sm:text-3xl font-extrabold text-white uppercase leading-tight truncate">
                        {top3[0].name}
                        <OverseasPlane playerName={top3[0].name} auction={auction} className="ml-2 text-lg sm:text-2xl" />
                      </h3>
                      <div className="mt-1 font-mono-num text-3xl sm:text-4xl font-extrabold text-amber-400 drop-shadow-md">
                        {formatCurrency(top3[0].soldAmount, cur)}
                      </div>
                      {top3[0].soldViaRtm && (
                        <span className="inline-block mt-1 px-2.5 py-0.5 rounded bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[10px] font-extrabold uppercase">
                          ⚡ MATCHED VIA RTM
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-amber-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <TeamLogo team={top3[0].soldToTeam} size="md" />
                    <span className="font-display font-extrabold text-sm sm:text-base text-amber-300 truncate">
                      {top3[0].soldToTeam?.name || top3[0].soldToTeamName || 'Acquired'}
                    </span>
                  </div>
                  <span className="text-xs font-black text-amber-400 uppercase tracking-widest">
                    ★ TOP PICK
                  </span>
                </div>
              </div>
            )}

            {/* Rank #3 Podium Card (Bronze) */}
            {top3[2] && (
              <div
                className="rounded-3xl p-4 sm:p-5 border-2 border-amber-700/60 bg-gradient-to-b from-slate-900/95 via-slate-900/80 to-slate-950 shadow-xl flex flex-col justify-between transition-all hover:scale-[1.01]"
                style={{
                  borderTopWidth: '6px',
                  borderTopColor: top3[2].soldToTeam?.primaryColor || '#B45309'
                }}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-900/60 text-amber-300 border border-amber-700/80 text-xs font-extrabold uppercase tracking-wider">
                      🥉 #3 HIGHEST PICK
                    </span>
                    <span className="text-[11px] font-bold text-slate-400 uppercase truncate">
                      {top3[2].poolName}
                    </span>
                  </div>

                  <div className="flex items-center gap-3.5 sm:gap-4">
                    <ItemImage
                      name={top3[2].name}
                      poolName={top3[2].poolName}
                      imageUrl={top3[2].imageUrl}
                      className="w-16 h-20 sm:w-20 sm:h-24 rounded-2xl object-cover border-2 border-amber-700/70 shadow-lg shrink-0"
                    />
                    <div className="min-w-0">
                      <h3 className="font-display text-lg sm:text-2xl font-extrabold text-white uppercase leading-tight truncate">
                        {top3[2].name}
                        <OverseasPlane playerName={top3[2].name} auction={auction} className="ml-1.5 text-base sm:text-lg" />
                      </h3>
                      <div className="mt-1 font-mono-num text-2xl sm:text-3xl font-extrabold text-emerald-400">
                        {formatCurrency(top3[2].soldAmount, cur)}
                      </div>
                      {top3[2].soldViaRtm && (
                        <span className="inline-block mt-1 px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[10px] font-extrabold uppercase">
                          MATCHED VIA RTM
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <TeamLogo team={top3[2].soldToTeam} size="sm" />
                    <span className="font-display font-extrabold text-xs sm:text-sm text-white truncate">
                      {top3[2].soldToTeam?.name || top3[2].soldToTeamName || 'Acquired'}
                    </span>
                  </div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                    BOUGHT
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 3. MAIN CONTENT AREA BASED ON VIEW MODE */}

      {/* VIEW MODE A: SPLIT VIEW (LEADERBOARD ON LEFT + TEAM SQUAD ON RIGHT) */}
      {viewMode === 'SPLIT' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 flex-1 items-start">
          {/* Left 5 Cols: Purse Remaining Leaderboard */}
          <div className="lg:col-span-5 rounded-3xl bg-slate-900/90 border border-slate-800 p-4 sm:p-5 shadow-2xl flex flex-col justify-between space-y-3.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-amber-400" />
                <span className="font-display font-extrabold text-sm sm:text-base text-white tracking-wide uppercase">
                  OVERALL PURSE REMAINING
                </span>
              </div>
              <span className="text-xs font-bold text-slate-400">
                {teams.length} Teams
              </span>
            </div>

            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {sortedTeamsByPurse.map((team, idx) => {
                const isSelected = selectedTeam?.id === team.id;
                const boughtCount = soldItems.filter(s => s.soldToTeamId === team.id).length;
                return (
                  <div
                    key={team.id}
                    onClick={() => {
                      setSelectedTeamIndex(teams.findIndex(t => t.id === team.id));
                      setAutoRotate(false);
                    }}
                    className={`rounded-2xl p-2.5 sm:p-3 border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                      isSelected
                        ? 'bg-slate-950 border-amber-400 shadow-lg ring-1 ring-amber-400/50 scale-[1.01]'
                        : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                    }`}
                    style={{ borderLeftWidth: '5px', borderLeftColor: team.primaryColor }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono-num text-xs font-bold text-slate-400 w-4 text-center shrink-0">
                        #{idx + 1}
                      </span>
                      <TeamLogo team={team} size="sm" />
                      <div className="min-w-0">
                        <div className="font-display font-extrabold text-xs sm:text-sm text-white truncate">
                          {team.name}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                          <span>Squad: {team.squadCount}</span>
                          <span>•</span>
                          <span className="text-emerald-400 font-bold">{boughtCount} bought today</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono-num text-sm sm:text-base font-extrabold text-amber-400">
                        {formatCurrency(team.remainingPurse, cur)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono-num">
                        Spent: {formatCurrency(team.totalSpent, cur)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right 7 Cols: Players Bought by Selected Team */}
          <div className="lg:col-span-7 rounded-3xl bg-slate-900/90 border border-slate-800 p-4 sm:p-5 shadow-2xl flex flex-col justify-between space-y-4">
            {/* Team Quick Selector Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {teams.map((t, idx) => {
                const isSelected = selectedTeamIndex === idx;
                const count = soldItems.filter(s => s.soldToTeamId === t.id).length;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setSelectedTeamIndex(idx);
                      setAutoRotate(false);
                    }}
                    className={`px-2.5 py-1.5 rounded-xl border flex items-center gap-1.5 shrink-0 transition-all cursor-pointer text-xs font-extrabold ${
                      isSelected
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-black'
                        : 'bg-slate-950/80 text-slate-300 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <TeamLogo team={t} size="xs" />
                    <span>{t.shortName || t.name.slice(0, 3)}</span>
                    <span className={`text-[10px] px-1 rounded ${isSelected ? 'bg-slate-950 text-amber-400' : 'bg-slate-800 text-slate-400'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Selected Team Hero Header */}
            {selectedTeam && (
              <div
                className="rounded-2xl p-4 border flex flex-wrap items-center justify-between gap-4"
                style={{
                  background: `linear-gradient(135deg, ${selectedTeam.primaryColor}40 0%, #090D16 100%)`,
                  borderColor: selectedTeam.primaryColor || '#F59E0B'
                }}
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <TeamLogo team={selectedTeam} size="lg" />
                  <div>
                    <div className="text-[10px] sm:text-xs font-extrabold uppercase tracking-widest text-slate-300">
                      DAY 1 ACQUISITIONS & ROSTER
                    </div>
                    <h2 className="font-display text-xl sm:text-3xl font-extrabold text-white uppercase leading-tight">
                      {selectedTeam.name}
                    </h2>
                  </div>
                </div>

                <div className="flex items-center gap-4 text-right">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">
                      Remaining Purse
                    </div>
                    <div className="font-mono-num text-xl sm:text-2xl font-extrabold text-amber-400">
                      {formatCurrency(selectedTeam.remainingPurse, cur)}
                    </div>
                  </div>
                  <div className="px-3.5 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
                    <div className="text-[10px] uppercase font-bold text-slate-400">
                      Squad Size
                    </div>
                    <div className="font-mono-num text-base sm:text-lg font-bold text-white">
                      {selectedTeam.squadCount}/25
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Bought Players Grid */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-display font-extrabold text-xs sm:text-sm text-slate-300 uppercase tracking-wider">
                  PLAYERS BOUGHT TODAY ({selectedTeamBuys.length})
                </span>
                <span className="text-xs font-mono-num font-bold text-emerald-400">
                  Spent Today: {formatCurrency(selectedTeamSpentToday, cur)}
                </span>
              </div>

              {selectedTeamBuys.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[260px] overflow-y-auto pr-1">
                  {selectedTeamBuys.map(item => (
                    <div
                      key={item.id}
                      className="rounded-2xl p-2.5 bg-slate-950 border border-slate-800 flex items-center justify-between gap-3 shadow-md"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ItemImage
                          name={item.name}
                          poolName={item.poolName}
                          imageUrl={item.imageUrl}
                          className="w-10 h-12 rounded-xl object-cover border border-slate-700 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-display font-extrabold text-xs sm:text-sm text-white truncate">
                            {item.name}
                            <OverseasPlane playerName={item.name} auction={auction} className="ml-1 text-xs" />
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {item.poolName}
                            {item.soldViaRtm ? ' • ⚡ RTM' : ''}
                          </div>
                        </div>
                      </div>
                      <div className="font-mono-num text-sm sm:text-base font-extrabold text-emerald-400 shrink-0">
                        {formatCurrency(item.soldAmount, cur)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-slate-500 italic bg-slate-950/50 rounded-2xl border border-slate-800/80">
                  No auction players acquired on Day 1 yet.
                </div>
              )}
            </div>

            {/* Pre-Auction Retentions for this team */}
            {selectedTeamRetentions.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <span className="font-display font-extrabold text-[11px] text-slate-400 uppercase tracking-wider">
                  PRE-AUCTION RETENTIONS ({selectedTeamRetentions.length})
                </span>
                <div className="flex flex-wrap gap-2">
                  {selectedTeamRetentions.map(r => (
                    <span
                      key={r.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-bold text-slate-200"
                    >
                      <span>{r.playerName}</span>
                      <OverseasPlane playerName={r.playerName} auction={auction} className="text-xs" />
                      <span className="font-mono-num text-amber-400 text-[11px]">
                        ({formatCurrency(r.amount, cur)})
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW MODE B: ALL SQUADS GRID (Shows all 12 teams side-by-side) */}
      {viewMode === 'SQUADS' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 max-h-[550px] overflow-y-auto pr-1">
          {teams.map(team => {
            const teamBuys = soldItems.filter(s => s.soldToTeamId === team.id);
            const teamRet = retentions.filter(r => r.teamId === team.id);
            return (
              <div
                key={team.id}
                className="rounded-3xl bg-slate-900/95 border border-slate-800 p-4 flex flex-col justify-between gap-3 shadow-xl"
                style={{ borderTopWidth: '5px', borderTopColor: team.primaryColor }}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <TeamLogo team={team} size="md" />
                      <div className="min-w-0">
                        <h4 className="font-display font-extrabold text-sm text-white truncate">
                          {team.name}
                        </h4>
                        <div className="text-[10px] text-slate-400">
                          Squad: {team.squadCount} • Buys: {teamBuys.length}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Players list */}
                  <div className="mt-3 space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {teamBuys.map(item => (
                      <div
                        key={item.id}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800/90 flex items-center justify-between text-xs"
                      >
                        <span className="font-bold text-white truncate pr-2">
                          {item.name}
                          <OverseasPlane playerName={item.name} auction={auction} className="ml-1 text-xs" />
                        </span>
                        <span className="font-mono-num font-extrabold text-emerald-400 shrink-0">
                          {formatCurrency(item.soldAmount, cur)}
                        </span>
                      </div>
                    ))}
                    {teamRet.map(r => (
                      <div
                        key={r.id}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-950/60 border border-amber-500/20 flex items-center justify-between text-xs opacity-80"
                      >
                        <span className="font-medium text-slate-300 truncate pr-2">
                          {r.playerName} <span className="text-[9px] text-amber-400 font-bold">(Retained)</span>
                        </span>
                        <span className="font-mono-num text-amber-400/90 shrink-0 text-[11px]">
                          {formatCurrency(r.amount, cur)}
                        </span>
                      </div>
                    ))}
                    {teamBuys.length === 0 && teamRet.length === 0 && (
                      <div className="py-4 text-center text-xs text-slate-500 italic">
                        No players acquired yet
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                  <span className="text-slate-400 font-bold">Remaining Purse:</span>
                  <span className="font-mono-num font-extrabold text-amber-400">
                    {formatCurrency(team.remainingPurse, cur)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW MODE C: FULL PURSE LEADERBOARD */}
      {viewMode === 'LEADERBOARD' && (
        <div className="rounded-3xl bg-slate-900/90 border border-slate-800 p-5 sm:p-7 shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
            <div>
              <h3 className="font-display text-xl sm:text-2xl font-extrabold text-white uppercase">
                COMPLETE PURSE REMAINING LEADERBOARD
              </h3>
              <p className="text-xs text-slate-400">
                Ranked by highest available spending power heading into Day 2
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400 font-bold uppercase">Total Purse Left in Arena</div>
              <div className="font-mono-num text-xl sm:text-3xl font-extrabold text-amber-400">
                {formatCurrency(totalRemainingPurse, cur)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 max-h-[500px] overflow-y-auto pr-1">
            {sortedTeamsByPurse.map((team, idx) => {
              const teamBuys = soldItems.filter(s => s.soldToTeamId === team.id);
              return (
                <div
                  key={team.id}
                  className="rounded-2xl p-4 bg-slate-950 border border-slate-800 shadow-md flex items-center justify-between gap-3"
                  style={{ borderLeftWidth: '6px', borderLeftColor: team.primaryColor }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-mono-num text-base font-black text-slate-400 w-6 text-center shrink-0">
                      #{idx + 1}
                    </span>
                    <TeamLogo team={team} size="md" />
                    <div className="min-w-0">
                      <div className="font-display font-extrabold text-base text-white truncate">
                        {team.name}
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>Squad: {team.squadCount}/25</span>
                        <span>•</span>
                        <span className="text-emerald-400">{teamBuys.length} bought today</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono-num text-lg sm:text-xl font-extrabold text-amber-400">
                      {formatCurrency(team.remainingPurse, cur)}
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono-num">
                      Spent: {formatCurrency(team.totalSpent, cur)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
