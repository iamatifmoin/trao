"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { kitsApi, progressStreamUrl, type KitDetail, type KitStatus } from "./api";

/**
 * Fetches the kit and, while it's still pending/generating, subscribes to
 * its SSE progress stream and writes each event straight into the query
 * cache — no polling needed. Once a terminal event (ready/failed) arrives,
 * the stream closes itself and we refetch once to pick up the full kit
 * content the "ready" event doesn't carry.
 */
export function useKit(kitId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["kit", kitId],
    queryFn: () => kitsApi.get(kitId),
  });

  const status = query.data?.status;
  const isActive = status === "pending" || status === "generating";

  useEffect(() => {
    if (!isActive) return;

    const source = new EventSource(progressStreamUrl(kitId), { withCredentials: true });

    source.onmessage = (event) => {
      const data = JSON.parse(event.data) as {
        step: string;
        status: KitStatus;
        error?: { code: string; message: string };
      };

      queryClient.setQueryData<KitDetail>(["kit", kitId], (prev) =>
        prev ? { ...prev, status: data.status, progress: { step: data.step }, error: data.error ?? prev.error } : prev,
      );

      if (data.status === "ready" || data.status === "failed") {
        source.close();
        void queryClient.invalidateQueries({ queryKey: ["kit", kitId] });
      }
    };

    return () => source.close();
  }, [kitId, isActive, queryClient]);

  return query;
}
