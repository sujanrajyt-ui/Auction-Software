import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext.jsx';
import { playAuctionSound } from '../utils/sound.js';

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

      setAuction(nextAuction);
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
        wsConnectedRef.current = false;
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

    // Serverless / fallback real-time polling (keeps Vercel deployments live in real time)
    const pollInterval = setInterval(() => {
      if (!wsConnectedRef.current) {
        fetchLatestState(true);
      }
    }, 1500);

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

  return {
    auction,
    setAuction,
    connected,
    loading,
    error,
    lastEvent,
    teamWinNotification,
    dismissWinNotification,
    refresh: () => fetchLatestState(false)
  };
}
