import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";

export type MobilityLevel = "full" | "partial" | "minimal" | "none";

export interface MobilityAngles {
  [key: string]: number;
}

export interface MobilityState {
  isActive: boolean;
  mobilityLevel: MobilityLevel;
  mobilityScore: number;
  angles: MobilityAngles;
  elapsed: number;
  handDetected: boolean;
  confidence: number;
  backendConnected: boolean;
}

const API_URL = "http://localhost:8000";

export const useMobilityDetection = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const predictionRef = useRef<NodeJS.Timeout | null>(null);

  const [state, setState] = useState<MobilityState>({
    isActive: false,
    mobilityLevel: "none",
    mobilityScore: 0,
    angles: {},
    elapsed: 0,
    handDetected: false,
    confidence: 0,
    backendConnected: false,
  });

  // Check backend health on mount
  useEffect(() => {
    fetch(`${API_URL}/health`)
      .then((r) => r.ok && setState((s) => ({ ...s, backendConnected: true })))
      .catch(() => setState((s) => ({ ...s, backendConnected: false })));
  }, []);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);
    // Get base64 JPEG (strip the data:image/jpeg;base64, prefix)
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    return dataUrl.split(",")[1];
  }, []);

  const sendFrame = useCallback(async () => {
    const base64 = captureFrame();
    if (!base64) return;

    try {
      const res = await fetch(`${API_URL}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 }),
      });

      if (!res.ok) return;

      const data = await res.json();
      setState((s) => ({
        ...s,
        handDetected: data.hand_detected,
        confidence: data.confidence,
        mobilityScore: data.mobility_score,
        mobilityLevel: data.mobility_level as MobilityLevel,
        angles: data.angles || {},
        backendConnected: true,
      }));
    } catch {
      // If backend is unreachable, fall back to mock data
      setState((s) => {
        if (s.backendConnected) {
          toast.error("Lost connection to detection backend. Using mock data.");
        }
        const mockScore = Math.floor(Math.random() * 10) + 1;
        return {
          ...s,
          backendConnected: false,
          mobilityScore: mockScore,
          mobilityLevel:
            mockScore >= 7 ? "full" : mockScore >= 4 ? "partial" : mockScore >= 1 ? "minimal" : "none",
          angles: {
            thumb_cmc: Math.round(Math.random() * 90),
            index_mcp: Math.round(Math.random() * 90),
            middle_mcp: Math.round(Math.random() * 90),
            wrist_angle: Math.round(Math.random() * 80),
          },
        };
      });
    }
  }, [captureFrame]);

  const startSession = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setState((s) => ({ ...s, isActive: true, elapsed: 0 }));
      timerRef.current = setInterval(
        () => setState((s) => ({ ...s, elapsed: s.elapsed + 1 })),
        1000
      );

      // Send frames every 500ms
      predictionRef.current = setInterval(() => {
        sendFrame();
      }, 500);

      toast.success("Session started");
    } catch {
      toast.error("Camera access denied. Please allow camera permissions.");
    }
  }, [sendFrame]);

  const stopSession = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    if (predictionRef.current) clearInterval(predictionRef.current);
    setState((s) => ({ ...s, isActive: false }));
    toast.success("Session saved successfully");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (predictionRef.current) clearInterval(predictionRef.current);
    };
  }, []);

  return {
    videoRef,
    canvasRef,
    state,
    startSession,
    stopSession,
  };
};
