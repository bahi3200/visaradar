import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

function generateFingerprint(): string {
  const nav = window.navigator;
  const screen = window.screen;
  const raw = [
    nav.userAgent,
    nav.language,
    screen.width,
    screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    nav.hardwareConcurrency || 0,
    (nav as any).deviceMemory || 0,
  ].join("|");

  // Simple hash
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getDeviceInfo() {
  const ua = navigator.userAgent;
  let browser = "Unknown";
  let os = "Unknown";
  let deviceName = "جهاز غير معروف";

  // Browser detection
  if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Edg")) browser = "Edge";
  else if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";

  // OS detection
  if (ua.includes("Windows")) { os = "Windows"; deviceName = "كمبيوتر Windows"; }
  else if (ua.includes("Mac")) { os = "macOS"; deviceName = "Mac"; }
  else if (ua.includes("Linux")) { os = "Linux"; deviceName = "كمبيوتر Linux"; }
  else if (ua.includes("Android")) { os = "Android"; deviceName = "هاتف Android"; }
  else if (ua.includes("iPhone") || ua.includes("iPad")) { os = "iOS"; deviceName = ua.includes("iPad") ? "iPad" : "iPhone"; }

  return { browser, os, deviceName };
}

export type DeviceCheckResult = {
  allowed: boolean;
  activeDeviceCount: number;
  isShared: boolean;
  error?: string;
  activeDevices?: Array<{ device_name: string; browser: string; last_active_at: string }>;
};

export function useDeviceCheck() {
  const [result, setResult] = useState<DeviceCheckResult | null>(null);
  const [loading, setLoading] = useState(true);

  const checkDevice = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setResult(null);
        setLoading(false);
        return;
      }

      const fingerprint = generateFingerprint();
      const { browser, os, deviceName } = getDeviceInfo();

      const { data, error } = await supabase.functions.invoke("check-device", {
        body: { fingerprint, deviceName, browser, os },
      });

      if (error) {
        // Check if it's a 403 (device limit exceeded)
        setResult({
          allowed: false,
          activeDeviceCount: 0,
          isShared: false,
          error: "فشل التحقق من الجهاز",
        });
      } else {
        setResult(data);
      }
    } catch {
      setResult({ allowed: true, activeDeviceCount: 1, isShared: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkDevice();

    // Heartbeat every 5 minutes
    const interval = setInterval(checkDevice, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkDevice]);

  return { result, loading, recheckDevice: checkDevice };
}

export function useMyDevices() {
  const [devices, setDevices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("user_devices")
        .select("*")
        .order("last_active_at", { ascending: false });
      setDevices(data || []);
      setLoading(false);
    }
    load();
  }, []);

  const deactivateDevice = async (deviceId: string) => {
    await supabase
      .from("user_devices")
      .update({ is_active: false })
      .eq("id", deviceId);
    setDevices((prev) => prev.map((d) => d.id === deviceId ? { ...d, is_active: false } : d));
  };

  return { devices, loading, deactivateDevice };
}
