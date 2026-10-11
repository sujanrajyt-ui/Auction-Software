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

  const fetchLatestState = useCallback(async () => {
    if (!auctionId) return;
    try {
      const data = await apiFetch(`/api/auctions/${auctionId}`);
      setAuction(data.auction);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [auctionId, apiFetch]);

  useEffect(() => {
    if (!auctionId) return;

    fetchLatestState();

    const socket = io(window.location.origin, {
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      reconnectionAttempts: Infinity
    });
    socketRef.current = socket;

    const joinRooms = () => {
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
      fetchLatestState();
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('auction:state', updatedAuction => {
      if (updatedAuction && updatedAuction.id === auctionId) {
        setAuction(updatedAuction);
        setLoading(false);
        setError(null);
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

    return () => {
      socket.emit('leave:auction', { auctionId });
      socket.disconnect();
    };
  }, [auctionId, token, teamId, fetchLatestState]);

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
    refresh: fetchLatestState
  };
}
