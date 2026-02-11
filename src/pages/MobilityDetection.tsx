import { useState, useRef, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Video, StopCircle, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

type MobilityLevel = "full" | "partial" | "minimal" | "none";

const levelConfig: Record<MobilityLevel, { label: string; color: string; bg: string }> = {
  full: { label: "Full Movement", color: "text-status-green", bg: "bg-status-green" },
  partial: { label: "Partial Movement", color: "text-status-yellow", bg: "bg-status-yellow" },
  minimal: { label: "Minimal Movement", color: "text-status-red", bg: "bg-status-red" },
  none: { label: "No Movement Detected", color: "text-status-red", bg: "bg-status-red" },
};

const classifyLevel = (level: number): MobilityLevel => {
  if (level >= 7) return "full";
  if (level >= 4) return "partial";
  if (level >= 1) return "minimal";
  return "none";
};

const MobilityDetection = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [mobilityLevel, setMobilityLevel] = useState<MobilityLevel>("none");
  const [mobilityScore, setMobilityScore] = useState(0);
  const [angles, setAngles] = useState<Record<string, number>>({});
  const [showAngles, setShowAngles] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsActive(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);

      // Simulate API calls every 2 seconds (replace with real POST /predict)
      const interval = setInterval(() => {
        const mockScore = Math.floor(Math.random() * 10) + 1;
        setMobilityScore(mockScore);
        setMobilityLevel(classifyLevel(mockScore));
        setAngles({
          wrist_flexion: Math.round(Math.random() * 90),
          finger_spread: Math.round(Math.random() * 45),
          thumb_opposition: Math.round(Math.random() * 60),
          wrist_extension: Math.round(Math.random() * 80),
        });
      }, 2000);

      // Store interval for cleanup
      (streamRef as any)._interval = interval;

      toast.success("Session started");
    } catch {
      toast.error("Camera access denied. Please allow camera permissions.");
    }
  }, []);

  const stopSession = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    if ((streamRef as any)._interval) clearInterval((streamRef as any)._interval);
    setIsActive(false);
    toast.success("Session saved successfully");
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if ((streamRef as any)?._interval) clearInterval((streamRef as any)._interval);
    };
  }, []);

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const config = levelConfig[mobilityLevel];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Mobility Detection</h1>
        <p className="text-muted-foreground">Real-time hand mobility analysis</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Video Feed */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-0">
              <div className="relative aspect-video bg-foreground/5 rounded-t-xl overflow-hidden">
                {isActive ? (
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Video className="w-8 h-8 text-primary" />
                    </div>
                    <p className="text-muted-foreground text-sm">Click Start to begin your session</p>
                  </div>
                )}
                {isActive && (
                  <div className="absolute top-4 left-4 bg-foreground/70 text-background px-3 py-1 rounded-full text-sm font-mono">
                    {formatTime(elapsed)}
                  </div>
                )}
              </div>
              <div className="p-4 flex gap-3">
                {!isActive ? (
                  <Button onClick={startCamera} className="flex-1">
                    <Video className="w-4 h-4 mr-2" /> Start Session
                  </Button>
                ) : (
                  <Button onClick={stopSession} variant="destructive" className="flex-1">
                    <StopCircle className="w-4 h-4 mr-2" /> End Session
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Status Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Mobility Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <motion.div
                  key={mobilityLevel}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center ${config.bg}`}
                >
                  <span className="text-2xl font-bold text-background">{mobilityScore}</span>
                </motion.div>
                <p className={`mt-3 font-semibold ${config.color}`}>{config.label}</p>
                <p className="text-xs text-muted-foreground mt-1">Score: {mobilityScore}/10</p>
              </div>

              {/* Legend */}
              <div className="space-y-2 pt-2 border-t border-border">
                {(["full", "partial", "minimal"] as MobilityLevel[]).map((level) => (
                  <div key={level} className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${levelConfig[level].bg}`} />
                    <span className="text-xs text-muted-foreground">{levelConfig[level].label}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Joint Angles */}
          <Card>
            <CardHeader className="pb-2">
              <button
                onClick={() => setShowAngles(!showAngles)}
                className="flex items-center justify-between w-full"
              >
                <CardTitle className="text-base">Joint Angles</CardTitle>
                {showAngles ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
            </CardHeader>
            <AnimatePresence>
              {showAngles && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {Object.entries(angles).map(([key, val]) => (
                        <div key={key} className="flex justify-between text-sm">
                          <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                          <span className="font-mono text-foreground">{val}°</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default MobilityDetection;
