import { useState, useRef, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Check, CheckCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { supabase } from "@/integrations/supabase/client";

interface Message {
  id: string;
  text: string;
  sender: "me" | "other";
  timestamp: Date;
  read_at: Date | null;
}

const CHAT_PAIRS: Record<string, string> = {
  p1: "d1",
  d1: "p1",
};

const Chat = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [otherIsTyping, setOtherIsTyping] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otherName = user?.role === "patient" ? "Dr. Michael Chen" : "Sarah Johnson";
  const myId = user?.id ?? "unknown";
  const otherId = CHAT_PAIRS[myId] ?? (user?.role === "patient" ? "d1" : "p1");
  const { markAsRead } = useUnreadMessages();

  // Mark messages as read when chat page is opened
  useEffect(() => {
    markAsRead();
  }, [markAsRead]);

  // Fetch existing messages
  const fetchMessages = useCallback(async () => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(
        `and(sender_id.eq.${myId},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${myId})`
      )
      .order("created_at", { ascending: true });

    if (data) {
      setMessages(
        data.map((m) => ({
          id: m.id,
          text: m.text,
          sender: m.sender_id === myId ? "me" : "other",
          timestamp: new Date(m.created_at),
          read_at: m.read_at ? new Date(m.read_at) : null,
        }))
      );
    }
    setLoading(false);
  }, [myId, otherId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Mark incoming messages as read
  const markMessagesAsRead = useCallback(async () => {
    await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("sender_id", otherId)
      .eq("receiver_id", myId)
      .is("read_at", null);
  }, [myId, otherId]);

  useEffect(() => {
    markMessagesAsRead();
  }, [markMessagesAsRead, messages]);

  // Realtime subscription for messages + updates
  useEffect(() => {
    const channel = supabase
      .channel("chat-messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as {
            id: string;
            sender_id: string;
            receiver_id: string;
            text: string;
            created_at: string;
            read_at: string | null;
          };
          const isRelevant =
            (m.sender_id === myId && m.receiver_id === otherId) ||
            (m.sender_id === otherId && m.receiver_id === myId);
          if (!isRelevant) return;

          setMessages((prev) => {
            if (prev.some((msg) => msg.id === m.id)) return prev;
            return [
              ...prev,
              {
                id: m.id,
                text: m.text,
                sender: m.sender_id === myId ? "me" : "other",
                timestamp: new Date(m.created_at),
                read_at: m.read_at ? new Date(m.read_at) : null,
              },
            ];
          });

          // Mark as read if it's from the other person
          if (m.sender_id === otherId) {
            markMessagesAsRead();
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as {
            id: string;
            sender_id: string;
            read_at: string | null;
          };
          if (m.sender_id === myId && m.read_at) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === m.id ? { ...msg, read_at: new Date(m.read_at!) } : msg
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId, otherId, markMessagesAsRead]);

  // Typing indicator via Presence
  useEffect(() => {
    const channel = supabase.channel("typing-presence", {
      config: { presence: { key: myId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const otherPresence = state[otherId];
        if (otherPresence && Array.isArray(otherPresence)) {
          const isTyping = otherPresence.some(
            (p: Record<string, unknown>) => p.typing === true
          );
          setOtherIsTyping(isTyping);
        } else {
          setOtherIsTyping(false);
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ typing: false });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId, otherId]);

  // Broadcast typing state
  const broadcastTyping = useCallback(
    (isTyping: boolean) => {
      const channel = supabase.channel("typing-presence", {
        config: { presence: { key: myId } },
      });
      // Track on existing channel
      supabase
        .channel("typing-presence")
        ?.track({ typing: isTyping })
        .catch(() => {});
    },
    [myId]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);

    broadcastTyping(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      broadcastTyping(false);
    }, 2000);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, otherIsTyping]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    setInput("");
    broadcastTyping(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    await supabase.from("messages").insert({
      sender_id: myId,
      receiver_id: otherId,
      text,
    });
  };

  const formatTime = (d: Date) =>
    d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Messages</h1>
        <p className="text-muted-foreground">Chat with {otherName}</p>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-border flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
            {otherName.split(" ").map(n => n[0]).join("").slice(0, 2)}
          </div>
          <div>
            <p className="font-medium text-sm text-foreground">{otherName}</p>
            <p className="text-xs text-muted-foreground">
              {otherIsTyping ? (
                <span className="text-primary font-medium">Typing...</span>
              ) : (
                "Online"
              )}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No messages yet. Start the conversation!
            </div>
          ) : (
            messages.map((msg, idx) => {
              // Show read receipt only on the last "me" message that is read
              const isLastReadMe =
                msg.sender === "me" &&
                msg.read_at &&
                !messages.slice(idx + 1).some((m) => m.sender === "me" && m.read_at);

              return (
                <div key={msg.id} className={`flex ${msg.sender === "me" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                      msg.sender === "me"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-muted text-foreground rounded-bl-md"
                    }`}
                  >
                    <p>{msg.text}</p>
                    <div className={`flex items-center gap-1 mt-1 ${msg.sender === "me" ? "justify-end" : ""}`}>
                      <p className={`text-[10px] ${msg.sender === "me" ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                        {formatTime(msg.timestamp)}
                      </p>
                      {msg.sender === "me" && (
                        msg.read_at ? (
                          <CheckCheck className="w-3.5 h-3.5 text-primary-foreground/80" />
                        ) : (
                          <Check className="w-3 h-3 text-primary-foreground/50" />
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}

          {/* Typing indicator bubble */}
          {otherIsTyping && (
            <div className="flex justify-start">
              <div className="bg-muted text-foreground px-4 py-3 rounded-2xl rounded-bl-md">
                <div className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border flex gap-2">
          <Input
            value={input}
            onChange={handleInputChange}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type a message..."
            className="flex-1"
          />
          <Button onClick={sendMessage} size="icon">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default Chat;
