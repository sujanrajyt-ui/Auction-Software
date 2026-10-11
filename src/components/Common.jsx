import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Tv,
  LogOut,
  Shield,
  Gavel,
  Sparkles
} from 'lucide-react';
import {
  generateCrestSvgDataUri,
  generateItemSvgDataUri,
  AUCTION_STATES,
  getPlayerStats,
  isOverseasPlayer
} from '../../shared/constants.js';
import { getSoundSettings, setSoundSettings, playAuctionSound } from '../utils/sound.js';
import { useAuth } from '../context/AuthContext.jsx';

export function TeamLogo({
  team,
  name,
  shortName,
  logoUrl,
  primaryColor = '#034694',
  secondaryColor = '#DBA111',
  size = 'md',
  className = ''
}) {
  const resolvedName = team?.name || name || 'Team';
  const resolvedShort = team?.shortName || shortName || resolvedName.slice(0, 3).toUpperCase();
  const resolvedPrimary = team?.primaryColor || primaryColor || '#034694';
  const resolvedSecondary = team?.secondaryColor || secondaryColor || '#DBA111';
  const initialSrc = team?.logoUrl || logoUrl;

  const fallbackSvg = generateCrestSvgDataUri({
    name: resolvedName,
    shortName: resolvedShort,
    primaryColor: resolvedPrimary,
    secondaryColor: resolvedSecondary
  });

  const [src, setSrc] = useState(initialSrc || fallbackSvg);

  useEffect(() => {
    setSrc(initialSrc || fallbackSvg);
  }, [initialSrc, fallbackSvg]);

  const sizeMap = {
    xs: 'w-6 h-6 p-0.5',
    sm: 'w-8 h-8 p-1',
    md: 'w-11 h-11 p-1.5',
    lg: 'w-16 h-16 p-2',
    xl: 'w-24 h-24 p-2.5',
    '2xl': 'w-32 h-32 p-3'
  };

  return (
    <div
      className={`relative rounded-xl bg-slate-900/90 flex items-center justify-center shrink-0 overflow-hidden border ${
        sizeMap[size] || sizeMap.md
      } ${className}`}
      style={{
        borderColor: `${resolvedPrimary}66`,
        boxShadow: `0 0 16px ${resolvedPrimary}25`
      }}
    >
      <img
        src={src}
        alt={resolvedName}
        onError={() => setSrc(fallbackSvg)}
        className="w-full h-full object-contain drop-shadow"
      />
    </div>
  );
}

export function ItemImage({
  item,
  name,
  poolName,
  imageUrl,
  accentColor = '#F59E0B',
  className = 'w-16 h-16 rounded-xl object-cover'
}) {
  const resolvedName = item?.name || name || 'Item';
  const resolvedPool = item?.poolName || poolName || 'Pool';
  const initialSrc = item?.imageUrl || imageUrl;

  const fallbackSvg = generateItemSvgDataUri({
    name: resolvedName,
    pool: resolvedPool,
    accentColor
  });

  const [src, setSrc] = useState(initialSrc || fallbackSvg);

  useEffect(() => {
    setSrc(initialSrc || fallbackSvg);
  }, [initialSrc, fallbackSvg]);

  return (
    <img
      src={src}
      alt={resolvedName}
      onError={() => setSrc(fallbackSvg)}
      className={`bg-slate-900 border border-slate-800 ${className}`}
    />
  );
}

export function StatusBadge({ status, size = 'md' }) {
  const styles = {
    [AUCTION_STATES.DRAFT]:
      'bg-slate-800/90 text-slate-300 border-slate-600/60',
    [AUCTION_STATES.READY]:
      'bg-indigo-500/20 text-indigo-300 border-indigo-500/50',
    [AUCTION_STATES.LIVE]:
      'bg-emerald-500/20 text-emerald-300 border-emerald-500/60 animate-pulse',
    [AUCTION_STATES.PAUSED]:
      'bg-amber-500/25 text-amber-300 border-amber-500/60',
    [AUCTION_STATES.COMPLETED]:
      'bg-purple-500/20 text-purple-300 border-purple-500/50'
  };

  const sizeClass =
    size === 'lg'
      ? 'px-4 py-1.5 text-sm font-extrabold tracking-widest'
      : 'px-2.5 py-0.5 text-xs font-bold tracking-wider';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border uppercase ${sizeClass} ${
        styles[status] || styles[AUCTION_STATES.DRAFT]
      }`}
    >
      <span
        className={`w-2 h-2 rounded-full ${
          status === AUCTION_STATES.LIVE
            ? 'bg-emerald-400'
            : status === AUCTION_STATES.PAUSED
            ? 'bg-amber-400'
            : status === AUCTION_STATES.READY
            ? 'bg-indigo-400'
            : status === AUCTION_STATES.COMPLETED
            ? 'bg-purple-400'
            : 'bg-slate-400'
        }`}
      />
      {status}
    </span>
  );
}

export function SoundControl() {
  const [settings, setSettings] = useState(() => getSoundSettings());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handler = () => setSettings(getSoundSettings());
    window.addEventListener('vista-sound-settings-changed', handler);
    return () => window.removeEventListener('vista-sound-settings-changed', handler);
  }, []);

  const toggleMute = () => {
    const nextMuted = !settings.muted;
    setSoundSettings({ muted: nextMuted });
    setSettings(getSoundSettings());
    if (!nextMuted) {
      playAuctionSound('BID');
    }
  };

  const handleVolume = e => {
    const vol = parseFloat(e.target.value);
    setSoundSettings({ volume: vol, muted: vol <= 0.01 });
    setSettings(getSoundSettings());
  };

  return (
    <div className="relative flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-1.5">
      <button
        type="button"
        onClick={toggleMute}
        title={settings.muted ? 'Unmute local device sound' : 'Mute local device sound'}
        className="text-slate-300 hover:text-amber-400 transition-colors"
      >
        {settings.muted || settings.volume <= 0.01 ? (
          <VolumeX className="w-4 h-4 text-rose-400" />
        ) : (
          <Volume2 className="w-4 h-4 text-amber-400" />
        )}
      </button>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-xs font-mono-num text-slate-400 hover:text-white"
      >
        {settings.muted ? 'MUTE' : `${Math.round(settings.volume * 100)}%`}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-52 bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-2xl">
          <div className="flex items-center justify-between text-xs text-slate-300 mb-2 font-semibold">
            <span>Device Volume</span>
            <span className="font-mono-num text-amber-400">
              {settings.muted ? 'Muted' : `${Math.round(settings.volume * 100)}%`}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={settings.muted ? 0 : settings.volume}
            onChange={handleVolume}
            className="w-full accent-amber-500 cursor-pointer"
          />
          <div className="mt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => playAuctionSound('SOLD')}
              className="text-[11px] text-amber-400 hover:underline"
            >
              Test Sound
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] text-slate-400 hover:text-white"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function VistaHeader({
  subtitle = 'Universal Multi-Committee Live Auction Platform',
  auction = null,
  connected = true,
  rightActions = null
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const openProjectorWindow = () => {
    if (!auction?.id) return;
    window.open(
      `/projector/${auction.id}`,
      `Projector_${auction.id}`,
      'width=1440,height=900,menubar=no,toolbar=no,location=no,status=no'
    );
  };

  return (
    <header className="sticky top-0 z-40 bg-[#07090E]/95 backdrop-blur-md border-b border-slate-800/80 px-4 lg:px-6 py-3">
      <div className="max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to={user?.kind === 'ADMIN' ? '/admin' : '/'}
            className="flex items-center gap-3 group"
          >
            <div className="h-10 px-2.5 rounded-xl bg-slate-950/90 border border-slate-800/90 flex items-center justify-center shadow-lg">
              <img
                src="/vista-logo.png"
                alt="VISTA"
                className="h-6 sm:h-7 w-auto object-contain drop-shadow"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-extrabold text-sm sm:text-base tracking-wider text-white">
                  PRESENTS <span className="text-amber-400">THE VERDICT</span>
                </span>
                <span className="hidden sm:inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  NMAMIT
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate max-w-[260px] sm:max-w-md">
                {auction ? `${auction.name} • ${auction.committeeName}` : subtitle}
              </p>
            </div>
          </Link>

          {auction && (
            <div className="hidden md:flex items-center gap-2 pl-3 border-l border-slate-800">
              <StatusBadge status={auction.status} />
              <span
                className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                  connected
                    ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                    : 'bg-rose-950/60 text-rose-400 border-rose-800/60'
                }`}
              >
                {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {connected ? 'LIVE SYNC' : 'RECONNECTING...'}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {rightActions}

          {auction && (
            <button
              type="button"
              onClick={openProjectorWindow}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/35 text-indigo-300 border border-indigo-500/40 text-xs font-bold transition-all cursor-pointer"
            >
              <Tv className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Live Projector</span>
            </button>
          )}

          <SoundControl />

          {user && (
            <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-bold text-white leading-tight">{user.name}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                  {user.auctionRole || user.role}
                </div>
              </div>
              {user.role === 'SUPER_ADMIN' && (
                <Link
                  to="/super-admin"
                  className="text-xs px-2 py-1 rounded-lg bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30 font-semibold"
                >
                  Platform
                </Link>
              )}
              <button
                type="button"
                onClick={() => {
                  const target = user?.kind === 'ADMIN' ? '/admin' : '/';
                  logout();
                  navigate(target);
                }}
                title="Sign Out"
                className="p-1 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function OverseasPlane({ playerName, auction, className = 'ml-1.5 text-sm' }) {
  if (!isOverseasPlayer(playerName, auction)) return null;
  return (
    <span
      title="Overseas Player"
      aria-label="Overseas Player"
      className={`inline-block select-none align-middle ${className}`}
    >
      ✈️
    </span>
  );
}

export function PlayerStatsBar({ playerName, poolName, auction, size = 'md' }) {
  const stats = getPlayerStats(playerName, poolName, auction);
  if (!stats) return null;

  if (size === 'lg') {
    return (
      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-2.5 mb-3">
          <span className="text-xs font-extrabold uppercase tracking-widest px-3.5 py-1 rounded-full bg-slate-800/95 text-amber-300 border border-amber-500/40 shadow">
            {stats.role}
          </span>
          {stats.country && (
            <span className="text-xs font-bold uppercase tracking-wider px-3.5 py-1 rounded-full bg-slate-900/95 text-slate-200 border border-slate-700 shadow">
              {stats.country}
            </span>
          )}
          {stats.lastTeam && (
            <span className="text-xs font-extrabold uppercase tracking-widest px-4 py-1 rounded-full bg-purple-500/20 text-purple-200 border border-purple-400/50 shadow">
              LAST TEAM: <strong className="text-white ml-1">{stats.lastTeam}</strong>
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.metrics.map(m => (
            <div
              key={m.label}
              className={`rounded-2xl px-4 py-3 text-center border shadow-lg ${
                m.label === 'LAST TEAM'
                  ? 'bg-purple-950/50 border-purple-500/50'
                  : 'bg-slate-950/95 border-slate-800/90'
              }`}
            >
              <div
                className={`text-[10px] font-extrabold uppercase tracking-widest ${
                  m.label === 'LAST TEAM' ? 'text-purple-300' : 'text-slate-400'
                }`}
              >
                {m.label}
              </div>
              <div
                className={`font-mono-num font-black text-lg sm:text-xl mt-0.5 truncate ${
                  m.label === 'LAST TEAM' ? 'text-amber-300' : 'text-white'
                }`}
              >
                {m.value}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (size === 'sm') {
    return (
      <div className="flex flex-wrap items-center gap-1.5 mt-1">
        <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
          {stats.role}
        </span>
        {stats.lastTeam && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
            Last: {stats.lastTeam}
          </span>
        )}
        {stats.metrics
          .filter(m => m.label !== 'LAST TEAM')
          .map(m => (
            <span
              key={m.label}
              className="text-[10px] font-mono-num px-1.5 py-0.5 rounded bg-slate-900/90 text-slate-300 border border-slate-800"
            >
              <span className="text-slate-500 mr-1">{m.label}:</span>
              <span className="font-bold text-white">{m.value}</span>
            </span>
          ))}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 border border-amber-500/30">
          {stats.role}
        </span>
        {stats.country && (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-900 text-slate-300 border border-slate-800">
            {stats.country}
          </span>
        )}
        {stats.lastTeam && (
          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/40">
            Last Team: <strong className="text-white">{stats.lastTeam}</strong>
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
        {stats.metrics.map(m => (
          <div
            key={m.label}
            className={`rounded-lg border px-2 py-1.5 text-center ${
              m.label === 'LAST TEAM'
                ? 'bg-purple-950/40 border-purple-500/40'
                : 'bg-slate-950/90 border-slate-800'
            }`}
          >
            <div
              className={`text-[9px] font-bold uppercase tracking-wider ${
                m.label === 'LAST TEAM' ? 'text-purple-300' : 'text-slate-400'
              }`}
            >
              {m.label}
            </div>
            <div className="font-mono-num font-extrabold text-xs sm:text-sm text-white truncate">
              {m.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

