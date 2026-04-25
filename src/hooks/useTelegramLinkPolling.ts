import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface UseTelegramLinkPollingOptions {
  userId: string | null | undefined;
  enabled: boolean;
  intervalMs?: number;
  onLinked: () => void;
}

/**
 * Polls the user's profile for a saved telegram_id at a fixed interval.
 * Stops immediately when:
 *  - userId becomes null/undefined (sign-out),
 *  - userId changes (account switch),
 *  - enabled becomes false.
 *
 * Uses an internal `cancelled` flag so any in-flight request resolved AFTER
 * the user changed will NOT trigger state updates for the previous account.
 */
export function useTelegramLinkPolling({
  userId,
  enabled,
  intervalMs = 30_000,
  onLinked,
}: UseTelegramLinkPollingOptions) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || !enabled) return;
    let cancelled = false;
    const interval = setInterval(async () => {
      if (cancelled) return;
      const { data } = await supabase
        .from("profiles")
        .select("telegram_id")
        .eq("user_id", userId)
        .maybeSingle();
      // Guard: drop responses that resolve after teardown (sign-out / switch).
      if (cancelled) return;
      if (data?.telegram_id) {
        onLinked();
        toast.success("✅ تم اكتشاف ربط Telegram بنجاح!");
        queryClient.invalidateQueries({ queryKey: ["my-profile", userId] });
      }
    }, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [userId, enabled, intervalMs, onLinked, queryClient]);
}
