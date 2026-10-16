import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../shared/constants.js';

let supabaseServerClient = null;
const channelsCache = new Map();

export function getSupabaseServerClient() {
  if (!supabaseServerClient && SUPABASE_CONFIG?.url && SUPABASE_CONFIG?.anonKey) {
    try {
      supabaseServerClient = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
        auth: { persistSession: false }
      });
    } catch (err) {
      console.warn('[Supabase Server Client Error]:', err.message);
    }
  }
  return supabaseServerClient;
}

export async function broadcastToSupabase(auctionId, eventName, payload) {
  try {
    const supabase = getSupabaseServerClient();
    if (!supabase || !auctionId) return;

    let channel = channelsCache.get(auctionId);
    if (!channel) {
      channel = supabase.channel(`auction:${auctionId}`, {
        config: { broadcast: { ack: false } }
      });
      channel.subscribe();
      channelsCache.set(auctionId, channel);
    }

    channel.send({
      type: 'broadcast',
      event: eventName,
      payload
    }).catch(err => {
      console.warn('[Supabase channel send warning]:', err?.message || err);
    });
  } catch (err) {
    console.warn('[Supabase Broadcast Warning]:', err?.message || err);
  }
}
