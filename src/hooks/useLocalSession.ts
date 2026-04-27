import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { API_URL, type SessionPrediction } from "./useBrunnstromPrediction";

export interface LocalSessionState {
  isActive: boolean;
  elapsed: number;
  sessionId: string | null;
  backendConnected: boolean;
}

export const useLocalSession = (
  onPrediction: (p: SessionPrediction) => void
) => {
  const [state, setState] = useState<LocalSessionState>({
    isActive: false,
    elapsed: 0,
    sessionId: null,
    backendConnected: false,
  });
  const [working, setWorking] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const getErrorMessage = async (res: Response, fallback: string) => {
    try {
      const data = await res.json();
      return typeof data.detail === "string" ? data.detail : fallback;
    } catch {
      return fallback;
    }
  };

  // Health check on mount
  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((r) => r.ok && setState((s) => ({ ...s, backendConnected: true })))
      .catch(() => setState((s) => ({ ...s, backendConnected: false })));
  }, []);

  const startSession = useCallback(async () => {
    setWorking(true);
    try {
      const res = await fetch(`${API_URL}/session/start`, { method: "POST" });
      if (!res.ok) throw new Error(await getErrorMessage(res, "Could not start session."));
      const data = await res.json();
      setState((s) => ({
        ...s,
        isActive: true,
        elapsed: 0,
        sessionId: data.session_id,
        backendConnected: true,
      }));
      timerRef.current = setInterval(
        () => setState((s) => ({ ...s, elapsed: s.elapsed + 1 })),
        1000
      );
      toast.success("Session started — follow prompts in the Hand Tracker window.");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Check that the local Python API is running.";
      toast.error(message);
    } finally {
      setWorking(false);
    }
  }, []);

  const stopSession = useCallback(async () => {
    setWorking(true);
    try {
      const res = await fetch(`${API_URL}/session/stop`, { method: "POST" });
      if (!res.ok) throw new Error(await getErrorMessage(res, "Session stopped, but prediction failed."));
      const data: SessionPrediction = await res.json();
      onPrediction(data);
      toast.success(`Session complete — analyzed ${data.trial_count} trials.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Check the Python API logs.";
      toast.error(message);
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setState((s) => ({ ...s, isActive: false }));
      setWorking(false);
    }
  }, [onPrediction]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return { state, working, startSession, stopSession };
};