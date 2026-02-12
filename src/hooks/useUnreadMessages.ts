import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const CHAT_PAIRS: Record<string, string> = {
  p1: "d1",
  d1: "p1",
};

export function useUnreadMessages() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const myId = user?.id ?? "unknown";
  const otherId = CHAT_PAIRS[myId] ?? (user?.role === "patient" ? "d1" : "p1");

  const fetchCount = useCallback(async () => {
    const lastViewed = localStorage.getItem(`chat_last_viewed_${myId}`);
    let query = supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_id", otherId)
      .eq("receiver_id", myId);

    if (lastViewed) {
      query = query.gt("created_at", lastViewed);
    }

    const { count: c } = await query;
    setCount(c ?? 0);
  }, [myId, otherId]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // Listen for new messages in realtime
  useEffect(() => {
    const channel = supabase
      .channel("unread-count")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as { sender_id: string; receiver_id: string };
          if (m.sender_id === otherId && m.receiver_id === myId) {
            // Only increment if not currently on chat page
            if (window.location.pathname !== "/chat") {
              setCount((prev) => prev + 1);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId, otherId]);

  const markAsRead = useCallback(() => {
    localStorage.setItem(`chat_last_viewed_${myId}`, new Date().toISOString());
    setCount(0);
  }, [myId]);

  return { unreadCount: count, markAsRead };
}
