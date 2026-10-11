// Section 34: Built-in Web Audio API Sound System
// Events: AUCTION_START, BID, SOLD, UNSOLD, TRANSITION, TEAM_WON
// Settings (Master Volume & Mute) are strictly local to the device.

const STORAGE_VOL_KEY = 'vista_verdict_sound_volume';
const STORAGE_MUTE_KEY = 'vista_verdict_sound_muted';

let audioCtx = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function getSoundSettings() {
  try {
    const rawVol = localStorage.getItem(STORAGE_VOL_KEY);
    const rawMute = localStorage.getItem(STORAGE_MUTE_KEY);
    return {
      volume: rawVol !== null ? Math.max(0, Math.min(1, parseFloat(rawVol))) : 0.75,
      muted: rawMute === 'true'
    };
  } catch {
    return { volume: 0.75, muted: false };
  }
}

export function setSoundSettings({ volume, muted }) {
  try {
    if (volume !== undefined) {
      localStorage.setItem(STORAGE_VOL_KEY, String(Math.max(0, Math.min(1, Number(volume)))));
    }
    if (muted !== undefined) {
      localStorage.setItem(STORAGE_MUTE_KEY, String(Boolean(muted)));
    }
    window.dispatchEvent(new CustomEvent('vista-sound-settings-changed'));
  } catch {
    // Ignore storage errors
  }
}

function playTone(ctx, { freq = 440, type = 'sine', startTime = 0, duration = 0.15, gain = 0.3, endFreq = null }) {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);
  if (endFreq) {
    osc.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + startTime + duration);
  }

  gainNode.gain.setValueAtTime(0.001, ctx.currentTime + startTime);
  gainNode.gain.linearRampToValueAtTime(gain, ctx.currentTime + startTime + 0.015);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startTime + duration);

  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(ctx.currentTime + startTime);
  osc.stop(ctx.currentTime + startTime + duration + 0.02);
}

export function playAuctionSound(eventType = 'BID') {
  const { volume, muted } = getSoundSettings();
  if (muted || volume <= 0.01) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const v = volume * 0.45;

  switch (eventType) {
    case 'BID': {
      // Crisp high-contrast arena bid ping
      playTone(ctx, { freq: 587.33, type: 'triangle', startTime: 0, duration: 0.11, gain: v * 0.9 });
      playTone(ctx, { freq: 880, type: 'sine', startTime: 0.06, duration: 0.18, gain: v });
      break;
    }

    case 'SOLD': {
      // Gavel strike + triumphant major chord fanfare
      playTone(ctx, { freq: 140, type: 'sawtooth', startTime: 0, duration: 0.09, gain: v * 1.1, endFreq: 75 });
      playTone(ctx, { freq: 523.25, type: 'triangle', startTime: 0.09, duration: 0.22, gain: v });
      playTone(ctx, { freq: 659.25, type: 'triangle', startTime: 0.18, duration: 0.25, gain: v });
      playTone(ctx, { freq: 783.99, type: 'triangle', startTime: 0.27, duration: 0.35, gain: v });
      playTone(ctx, { freq: 1046.5, type: 'sine', startTime: 0.36, duration: 0.65, gain: v * 1.15 });
      break;
    }

    case 'TEAM_WON': {
      // Celebratory winning arpeggio on team devices
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      notes.forEach((n, idx) => {
        playTone(ctx, {
          freq: n,
          type: 'triangle',
          startTime: idx * 0.085,
          duration: 0.45,
          gain: v * 1.1
        });
      });
      break;
    }

    case 'UNSOLD': {
      // Descending muted two-tone horn
      playTone(ctx, { freq: 349.23, type: 'sawtooth', startTime: 0, duration: 0.22, gain: v * 0.7 });
      playTone(ctx, { freq: 261.63, type: 'sawtooth', startTime: 0.2, duration: 0.42, gain: v * 0.75, endFreq: 220 });
      break;
    }

    case 'AUCTION_START': {
      // Rising arena chime
      playTone(ctx, { freq: 440, type: 'sine', startTime: 0, duration: 0.16, gain: v * 0.8 });
      playTone(ctx, { freq: 554.37, type: 'sine', startTime: 0.1, duration: 0.18, gain: v * 0.85 });
      playTone(ctx, { freq: 659.25, type: 'triangle', startTime: 0.2, duration: 0.35, gain: v });
      break;
    }

    case 'TRANSITION':
    default: {
      playTone(ctx, { freq: 493.88, type: 'sine', startTime: 0, duration: 0.16, gain: v * 0.65 });
      break;
    }
  }
}
