import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export function useUnreadMessages() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  const myId = user?.id ?? "";

  const fetchCount = useCallback(async () => {
    if (!myId) return;

    // Count all unread messages sent TO me
    const lastViewed = localStorage.getItem(`chat_last_viewed_${myId}`);

    let query = supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("receiver_id", myId)
      .is("read_at", null);

    if (lastViewed) {
      query = query.gt("created_at", lastViewed);
    }

    const { count: c } = await query;
    setCount(c ?? 0);
  }, [myId]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  // Listen for new messages in realtime
  useEffect(() => {
    if (!myId) return;
    const channel = supabase
      .channel("unread-count")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as { sender_id: string; receiver_id: string };
          if (m.receiver_id === myId && m.sender_id !== myId) {
            if (window.location.pathname !== "/chat") {
              setCount((prev) => prev + 1);
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [myId]);

  const markAsRead = useCallback(async () => {
    localStorage.setItem(`chat_last_viewed_${myId}`, new Date().toISOString());
    setCount(0);
    await fetchCount();
  }, [myId, fetchCount]);

  return { unreadCount: count, markAsRead };
}
