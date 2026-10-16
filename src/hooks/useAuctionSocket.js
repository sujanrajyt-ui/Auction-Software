import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext.jsx';
import { playAuctionSound } from '../utils/sound.js';
import { getAuctionRealtimeChannel, broadcastLive } from '../utils/supabaseClient.js';
import { AUCTION_STATES } from '../../shared/constants.js';

export function useAuctionSocket(auctionId, teamId = null) {
  const { token, apiFetch } = useAuth();
  const [auction, setAuction] = useState(null);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastEvent, setLastEvent] = useState(null);
  const [teamWinNotification, setTeamWinNotification] = useState(null);

  const socketRef = useRef(null);
  const wsConnectedRef = useRef(false);
  const prevSnapshotRef = useRef({
    activeItemId: null,
    currentBid: 0,
    overlayKey: null
  });

  const applyIncomingAuction = useCallback(
    (nextAuction, fromPoll = false) => {
      if (!nextAuction) return;

      if (fromPoll && !wsConnectedRef.current) {
        const prev = prevSnapshotRef.current;
        const activeId = nextAuction.activeItem?.id || null;
        const curBid = Number(nextAuction.activeItem?.currentBid || 0);
        const ov = nextAuction.projectorOverlay || null;
        const ovKey = ov ? `${ov.type}:${ov.itemId}:${ov.triggeredAt || ''}` : null;

        if (ov && ovKey !== prev.overlayKey) {
          if (ov.type === 'SOLD') {
            playAuctionSound('SOLD');
            setLastEvent({ type: 'ITEM_SOLD', sale: ov, receivedAt: Date.now() });
            if (teamId && ov.teamId === teamId) {
              setTeamWinNotification({ ...ov, receivedAt: Date.now() });
              playAuctionSound('TEAM_WON');
            }
          } else if (ov.type === 'UNSOLD') {
            playAuctionSound('UNSOLD');
            setLastEvent({ type: 'ITEM_UNSOLD', unsold: ov, receivedAt: Date.now() });
          } else if (ov.type === 'DAY_1_SUMMARY') {
            playAuctionSound('TRANSITION');
          }
        } else if (activeId && activeId === prev.activeItemId && curBid > prev.currentBid) {
          playAuctionSound('BID');
        } else if (activeId && activeId !== prev.activeItemId) {
          playAuctionSound('AUCTION_START');
        }

        prevSnapshotRef.current = {
          activeItemId: activeId,
          currentBid: curBid,
          overlayKey: ovKey
        };
      } else {
        const activeId = nextAuction.activeItem?.id || null;
        const curBid = Number(nextAuction.activeItem?.currentBid || 0);
        const ov = nextAuction.projectorOverlay || null;
        const ovKey = ov ? `${ov.type}:${ov.itemId}:${ov.triggeredAt || ''}` : null;
        prevSnapshotRef.current = {
          activeItemId: activeId,
          currentBid: curBid,
          overlayKey: ovKey
        };
      }

      setAuction(prev => {
        if (!prev) return nextAuction;

        // 1. Never let a stale background poll wipe out an active DAY_1_SUMMARY
        let resolvedOverlay = nextAuction.projectorOverlay;
        if (prev.projectorOverlay?.type === 'DAY_1_SUMMARY' && !nextAuction.projectorOverlay) {
          resolvedOverlay = prev.projectorOverlay;
        }

        // 2. Never let a stale background poll with fewer items wipe out newly added players
        let resolvedItems = nextAuction.items;
        let resolvedQueue = nextAuction.queue;
        if (
          Array.isArray(prev.items) &&
          Array.isArray(nextAuction.items) &&
          prev.items.length > nextAuction.items.length
        ) {
          resolvedItems = prev.items;
          resolvedQueue = prev.queue;
        }

        return {
          ...nextAuction,
          projectorOverlay: resolvedOverlay,
          items: resolvedItems,
          queue: resolvedQueue
        };
      });
      setConnected(true);
      setError(null);
      setLoading(false);
    },
    [teamId]
  );

  const fetchLatestState = useCallback(
    async (isPoll = false) => {
      if (!auctionId) return;
      try {
        const data = await apiFetch(`/api/auctions/${auctionId}`);
        if (data?.auction) {
          applyIncomingAuction(data.auction, isPoll);
        }
      } catch (err) {
        if (!isPoll) {
          setError(err.message);
        }
      } finally {
        if (!isPoll) {
          setLoading(false);
        }
      }
    },
    [auctionId, apiFetch, applyIncomingAuction]
  );

  useEffect(() => {
    if (!auctionId) return;

    fetchLatestState(false);

    // 1. Supabase Realtime WebSockets (0-Latency sync across Vercel & all clients)
    const supabaseChannel = getAuctionRealtimeChannel(auctionId);
    let supabaseSub = null;

    if (supabaseChannel) {
      const onDay1Toggle = ({ payload }) => {
        const isActive = Boolean(payload?.active);
        setAuction(prev => {
          if (!prev) return prev;
          const nextStatus =
            isActive && prev.status === AUCTION_STATES.LIVE ? AUCTION_STATES.PAUSED : prev.status;
          return {
            ...prev,
            status: nextStatus,
            projectorOverlay: isActive
              ? payload?.overlay || { type: 'DAY_1_SUMMARY', activatedAt: new Date().toISOString() }
              : prev.projectorOverlay?.type === 'DAY_1_SUMMARY'
              ? null
              : prev.projectorOverlay
          };
        });
        if (isActive) {
          playAuctionSound('TRANSITION');
        }
        setLastEvent({ type: 'DAY_1_SUMMARY_TOGGLED', active: isActive, receivedAt: Date.now() });
      };

      const onStateChange = ({ payload }) => {
        if (payload?.status) {
          setAuction(prev => (prev ? { ...prev, status: payload.status } : prev));
        }
      };

      const onCompactState = ({ payload }) => {
        if (!payload || !payload.id) return;
        setAuction(prev => {
          if (!prev) return prev;
          let updatedTeams = prev.teams;
          if (Array.isArray(payload.teamsSummary) && Array.isArray(prev.teams)) {
            const summaryMap = new Map(payload.teamsSummary.map(t => [t.id, t]));
            updatedTeams = prev.teams.map(t => {
              const sum = summaryMap.get(t.id);
              if (!sum) return t;
              return {
                ...t,
                remainingPurse:
                  sum.remainingPurse !== undefined ? sum.remainingPurse : t.remainingPurse,
                totalSpent: sum.totalSpent !== undefined ? sum.totalSpent : t.totalSpent,
                squadCount: sum.squadCount !== undefined ? sum.squadCount : t.squadCount,
                rtmRemaining: sum.rtmRemaining !== undefined ? sum.rtmRemaining : t.rtmRemaining
              };
            });
          }

          // Sound triggers based on delta
          const prevOv = prev.projectorOverlay;
          const nextOv = payload.projectorOverlay;
          if (nextOv && nextOv.type !== prevOv?.type) {
            if (nextOv.type === 'SOLD') {
              playAuctionSound('SOLD');
              setLastEvent({ type: 'ITEM_SOLD', sale: nextOv, receivedAt: Date.now() });
              if (teamId && nextOv.teamId === teamId) {
                setTeamWinNotification({ ...nextOv, receivedAt: Date.now() });
                playAuctionSound('TEAM_WON');
              }
            } else if (nextOv.type === 'UNSOLD') {
              playAuctionSound('UNSOLD');
              setLastEvent({ type: 'ITEM_UNSOLD', unsold: nextOv, receivedAt: Date.now() });
            } else if (nextOv.type === 'DAY_1_SUMMARY') {
              playAuctionSound('TRANSITION');
            }
          }

          return {
            ...prev,
            status: payload.status !== undefined ? payload.status : prev.status,
            activeItemId: payload.activeItemId !== undefined ? payload.activeItemId : prev.activeItemId,
            activeItem: payload.activeItem !== undefined ? payload.activeItem : prev.activeItem,
            projectorOverlay:
              payload.projectorOverlay !== undefined
                ? payload.projectorOverlay
                : prev.projectorOverlay,
            retentionsPublished:
              payload.retentionsPublished !== undefined
                ? payload.retentionsPublished
                : prev.retentionsPublished,
            stats: payload.stats !== undefined ? payload.stats : prev.stats,
            teams: updatedTeams
          };
        });
        setConnected(true);
      };

      const onAuctionEvent = ({ payload }) => {
        setLastEvent({ ...payload, receivedAt: Date.now() });
        if (payload?.sound) {
          playAuctionSound(payload.sound);
        }
        if (payload?.type === 'ITEM_SOLD' && teamId && payload?.sale?.teamId === teamId) {
          setTeamWinNotification({ ...payload.sale, receivedAt: Date.now() });
          playAuctionSound('TEAM_WON');
        }
      };

      const onAuctionSync = () => {
        fetchLatestState(false);
      };

      const onItemAdded = ({ payload }) => {
        if (payload?.auction) {
          setAuction(prev => {
            if (!prev) return payload.auction;
            return {
              ...prev,
              items: payload.auction.items || prev.items,
              queue: payload.auction.queue || prev.queue,
              stats: payload.auction.stats || prev.stats
            };
          });
        }
      };

      supabaseChannel
        .on('broadcast', { event: 'DAY_1_SUMMARY_TOGGLED' }, onDay1Toggle)
        .on('broadcast', { event: 'auction:state_change' }, onStateChange)
        .on('broadcast', { event: 'auction:compact_state' }, onCompactState)
        .on('broadcast', { event: 'auction:item_added' }, onItemAdded)
        .on('broadcast', { event: 'auction:event' }, onAuctionEvent)
        .on('broadcast', { event: 'auction:sync' }, onAuctionSync);

      wsConnectedRef.current = true;
      setConnected(true);
    }

    // 2. Local Socket.io (for local development)
    const isLocalHost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname.startsWith('192.168.');

    let socket = null;
    if (isLocalHost) {
      socket = io(window.location.origin, {
        reconnection: true,
        reconnectionDelay: 500,
        reconnectionDelayMax: 3000,
        reconnectionAttempts: 5
      });
      socketRef.current = socket;

      const joinRooms = () => {
        wsConnectedRef.current = true;
        setConnected(true);
        socket.emit('join:auction', {
          auctionId,
          token,
          teamId
        });
      };

      socket.on('connect', joinRooms);
      socket.on('reconnect', () => {
        joinRooms();
        fetchLatestState(false);
      });

      socket.on('disconnect', () => {
        if (!supabaseChannel) {
          wsConnectedRef.current = false;
        }
      });

      socket.on('auction:state', updatedAuction => {
        if (updatedAuction && updatedAuction.id === auctionId) {
          applyIncomingAuction(updatedAuction, false);
        }
      });

      socket.on('auction:event', evt => {
        setLastEvent({ ...evt, receivedAt: Date.now() });
        if (evt?.sound) {
          playAuctionSound(evt.sound);
        }
      });

      socket.on('team:won', winPayload => {
        setTeamWinNotification({ ...winPayload, receivedAt: Date.now() });
        playAuctionSound('TEAM_WON');
      });
    }

    // 3. Fallback polling ONLY when WebSocket is NOT connected (prevents overwriting live state)
    const pollInterval = setInterval(() => {
      if (!wsConnectedRef.current) {
        fetchLatestState(true);
      }
    }, 10000);

    return () => {
      clearInterval(pollInterval);
      if (socket) {
        socket.emit('leave:auction', { auctionId });
        socket.disconnect();
      }
    };
  }, [auctionId, token, teamId, fetchLatestState, applyIncomingAuction]);

  const dismissWinNotification = useCallback(() => {
    setTeamWinNotification(null);
  }, []);

  const broadcastLiveEvent = useCallback(
    (eventName, payload) => {
      broadcastLive(auctionId, eventName, payload);
    },
    [auctionId]
  );

  return {
    auction,
    setAuction,
    connected,
    loading,
    error,
    lastEvent,
    teamWinNotification,
    dismissWinNotification,
    refresh: () => fetchLatestState(false),
    fetchLatestState,
    broadcastLiveEvent
  };
}
