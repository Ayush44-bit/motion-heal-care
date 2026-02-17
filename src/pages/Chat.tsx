import { useState, useRef, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Loader2, Check, CheckCheck, MessageSquare } from "lucide-react";
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

interface ChatPartner {
  user_id: string;
  name: string;
}

const Chat = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [otherIsTyping, setOtherIsTyping] = useState(false);
  const [partners, setPartners] = useState<ChatPartner[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<ChatPartner | null>(null);
  const [partnersLoading, setPartnersLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myId = user?.id ?? "unknown";
  const { markAsRead } = useUnreadMessages();

  // Fetch chat partners from assignments
  useEffect(() => {
    if (!user) return;

    const fetchPartners = async () => {
      const isPatient = user.role === "patient";
      const column = isPatient ? "patient_id" : "doctor_id";
      const otherColumn = isPatient ? "doctor_id" : "patient_id";

      const { data: assignments } = await supabase
        .from("patient_doctor_assignments")
        .select("patient_id, doctor_id")
        .eq(column, user.id);

      if (assignments && assignments.length > 0) {
        const otherIds = assignments.map((a) => isPatient ? a.doctor_id : a.patient_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, name")
          .in("user_id", otherIds);

        const partnerList = (profiles || []).map((p) => ({
          user_id: p.user_id,
          name: p.name || "Unknown",
        }));
        setPartners(partnerList);

        // Auto-select first partner (or only partner for patients)
        if (partnerList.length > 0) {
          setSelectedPartner(partnerList[0]);
        }
      }
      setPartnersLoading(false);
    };

    fetchPartners();
  }, [user]);

  const otherId = selectedPartner?.user_id ?? "";
  const otherName = selectedPartner?.name ?? "";

  // Mark messages as read when chat page is opened
  useEffect(() => {
    markAsRead();
  }, [markAsRead]);

  // Fetch existing messages
  const fetchMessages = useCallback(async () => {
    if (!otherId) { setLoading(false); return; }
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
    if (otherId) {
      setLoading(true);
      fetchMessages();
    }
  }, [fetchMessages, otherId]);

  // Mark incoming messages as read
  const markMessagesAsRead = useCallback(async () => {
    if (!otherId) return;
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
    if (!otherId) return;
    const channel = supabase
      .channel(`chat-messages-${otherId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as {
            id: string; sender_id: string; receiver_id: string;
            text: string; created_at: string; read_at: string | null;
          };
          const isRelevant =
            (m.sender_id === myId && m.receiver_id === otherId) ||
            (m.sender_id === otherId && m.receiver_id === myId);
          if (!isRelevant) return;

          setMessages((prev) => {
            if (prev.some((msg) => msg.id === m.id)) return prev;
            return [...prev, {
              id: m.id, text: m.text,
              sender: m.sender_id === myId ? "me" : "other",
              timestamp: new Date(m.created_at),
              read_at: m.read_at ? new Date(m.read_at) : null,
            }];
          });

          if (m.sender_id === otherId) markMessagesAsRead();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new as { id: string; sender_id: string; read_at: string | null; };
          if (m.sender_id === myId && m.read_at) {
            setMessages((prev) =>
              prev.map((msg) => msg.id === m.id ? { ...msg, read_at: new Date(m.read_at!) } : msg)
            );
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [myId, otherId, markMessagesAsRead]);

  // Typing indicator via Presence
  useEffect(() => {
    if (!otherId) return;
    const channel = supabase.channel(`typing-${otherId}`, {
      config: { presence: { key: myId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        const otherPresence = state[otherId];
        if (otherPresence && Array.isArray(otherPresence)) {
          setOtherIsTyping(otherPresence.some((p: Record<string, unknown>) => p.typing === true));
        } else {
          setOtherIsTyping(false);
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ typing: false });
      });

    return () => { supabase.removeChannel(channel); };
  }, [myId, otherId]);

  const broadcastTyping = useCallback((isTyping: boolean) => {
    if (!otherId) return;
    supabase.channel(`typing-${otherId}`)?.track({ typing: isTyping }).catch(() => {});
  }, [otherId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
    broadcastTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => broadcastTyping(false), 2000);
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, otherIsTyping]);

  const sendMessage = async () => {
    if (!input.trim() || !otherId) return;
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

  // Show partner list for doctors, or "no doctor" message for unassigned patients
  if (partnersLoading) {
    return (
      <div className="h-[calc(100vh-8rem)] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (partners.length === 0) {
    return (
      <div className="h-[calc(100vh-8rem)] flex flex-col items-center justify-center text-center">
        <MessageSquare className="w-12 h-12 text-muted-foreground/40 mb-4" />
        <h2 className="text-lg font-semibold text-foreground mb-1">No conversations yet</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          {user?.role === "patient"
            ? "You need to select a doctor from your dashboard before you can start chatting."
            : "No patients have been assigned to you yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Messages</h1>
        <p className="text-muted-foreground">
          {user?.role === "doctor" ? "Chat with your patients" : `Chat with ${otherName}`}
        </p>
      </div>

      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Conversation list for doctors with multiple patients */}
        {user?.role === "doctor" && partners.length > 0 && (
          <Card className="w-64 shrink-0 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-sm font-semibold text-foreground">Patients</p>
            </div>
            <div className="flex-1 overflow-auto">
              {partners.map((p) => (
                <button
                  key={p.user_id}
                  onClick={() => setSelectedPartner(p)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted ${
                    selectedPartner?.user_id === p.user_id ? "bg-muted" : ""
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                    {p.name.charAt(0)}
                  </div>
                  <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {/* Chat area */}
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
                ) : "Online"}
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
              messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender === "me" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm ${
                    msg.sender === "me"
                      ? "bg-primary text-primary-foreground rounded-br-md"
                      : "bg-muted text-foreground rounded-bl-md"
                  }`}>
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
              ))
            )}

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
            <Button onClick={sendMessage} size="icon" disabled={!otherId}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Chat;
