import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SiteSettings = Record<string, string>;

export function useSiteSettings() {
  const queryClient = useQueryClient();

  const { data: settings = {}, isLoading } = useQuery({
    queryKey: ["site-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings" as any)
        .select("key, value");
      if (error) throw error;
      const map: SiteSettings = {};
      (data as any[])?.forEach((row: any) => {
        map[row.key] = row.value;
      });
      return map;
    },
    staleTime: 10 * 60 * 1000,
  });

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      // upsert على عمود key (له قيد UNIQUE) لإنشاء الصف إن لم يوجد، وتحديثه إن وُجد.
      const { error } = await (supabase as any)
        .from("site_settings")
        .upsert(
          { key, value, updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["site-settings"] });
    },
  });

  return { settings, isLoading, updateSetting };
}
