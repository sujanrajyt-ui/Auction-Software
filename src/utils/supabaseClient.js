import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../../shared/constants.js';

let supabaseInstance = null;
const channelMap = new Map();

export function getSupabaseClient() {
  if (!supabaseInstance && SUPABASE_CONFIG?.url && SUPABASE_CONFIG?.anonKey) {
    try {
      supabaseInstance = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
        realtime: {
          params: {
            eventsPerSecond: 20
          }
        }
      });
    } catch (err) {
      console.warn('[Supabase Client Error]:', err.message);
    }
  }
  return supabaseInstance;
}

export function getAuctionRealtimeChannel(auctionId) {
  const supabase = getSupabaseClient();
  if (!supabase || !auctionId) return null;
  const channelName = `auction:${auctionId}`;
  if (!channelMap.has(channelName)) {
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false } }
    });
    channel.subscribe();
    channelMap.set(channelName, channel);
  }
  return channelMap.get(channelName);
}

export async function broadcastLive(auctionId, eventName, payload) {
  try {
    const channel = getAuctionRealtimeChannel(auctionId);
    if (!channel) return;
    if (channel.state !== 'joined') {
      channel.subscribe();
    }
    await channel.send({
      type: 'broadcast',
      event: eventName,
      payload
    });
  } catch (err) {
    console.warn('[Supabase broadcastLive error]:', err?.message || err);
  }
}
