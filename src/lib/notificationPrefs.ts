export type AlertMode = "sound" | "vibrate" | "silent";

const MODE_KEY = "notif_alert_mode";
const VOLUME_KEY = "notif_volume";
const LEGACY_SOUND_KEY = "notif_sound";

export function getAlertMode(): AlertMode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === "sound" || stored === "vibrate" || stored === "silent") return stored;
    // Migrate legacy boolean key
    const legacy = localStorage.getItem(LEGACY_SOUND_KEY);
    if (legacy === "false") return "silent";
    return "sound";
  } catch {
    return "sound";
  }
}

export function setAlertMode(mode: AlertMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
    localStorage.setItem(LEGACY_SOUND_KEY, mode === "sound" ? "true" : "false");
  } catch {}
}

export function getVolume(): number {
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY) ?? "0.6");
    if (Number.isFinite(v)) return Math.min(1, Math.max(0, v));
  } catch {}
  return 0.6;
}

export function setVolume(value: number) {
  try {
    const clamped = Math.min(1, Math.max(0, value));
    localStorage.setItem(VOLUME_KEY, String(clamped));
  } catch {}
}

export function triggerAlert(mode: AlertMode, volume: number) {
  if (mode === "silent") return;
  if (mode === "vibrate") {
    try {
      if ("vibrate" in navigator) navigator.vibrate([200, 100, 200]);
    } catch {}
    return;
  }
  // sound
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1047, ctx.currentTime + 0.1);
    const peak = Math.max(0.01, Math.min(1, volume) * 0.5);
    gain.gain.setValueAtTime(peak, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {}
}