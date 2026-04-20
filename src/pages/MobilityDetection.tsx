import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Video, StopCircle, ChevronDown, ChevronUp, Wifi, WifiOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useMobilityDetection, MobilityLevel } from "@/hooks/useMobilityDetection";
import BrunnstromStageCard from "@/components/BrunnstromStageCard";

const levelConfig: Record<MobilityLevel, { label: string; color: string; bg: string }> = {
  full: { label: "Full Movement", color: "text-status-green", bg: "bg-status-green" },
  partial: { label: "Partial Movement", color: "text-status-yellow", bg: "bg-status-yellow" },
  minimal: { label: "Minimal Movement", color: "text-status-red", bg: "bg-status-red" },
  none: { label: "No Movement Detected", color: "text-status-red", bg: "bg-status-red" },
};

const MobilityDetection = () => {
  const { videoRef, canvasRef, state, startSession, stopSession } = useMobilityDetection();
  const [showAngles, setShowAngles] = useState(false);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const config = levelConfig[state.mobilityLevel];

  return (
    <div className="space-y-6">
      {/* Hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mobility Detection</h1>
          <p className="text-muted-foreground">Real-time hand mobility analysis</p>
        </div>
        <Badge variant={state.backendConnected ? "default" : "secondary"} className="gap-1.5">
          {state.backendConnected ? (
            <><Wifi className="w-3 h-3" /> Backend Connected</>
          ) : (
            <><WifiOff className="w-3 h-3" /> Mock Mode</>
          )}
        </Badge>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Video Feed */}
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="p-0">
              <div className="relative aspect-video bg-foreground/5 rounded-t-xl overflow-hidden">
                {state.isActive ? (
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-4">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Video className="w-8 h-8 text-primary" />
                    </div>
                    <p className="text-muted-foreground text-sm">Click Start to begin your session</p>
                  </div>
                )}
                {state.isActive && (
                  <>
                    <div className="absolute top-4 left-4 bg-foreground/70 text-background px-3 py-1 rounded-full text-sm font-mono">
                      {formatTime(state.elapsed)}
                    </div>
                    {!state.handDetected && state.backendConnected && (
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-lg text-sm">
                        No hand detected — ensure your hand is visible
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="p-4 flex gap-3">
                {!state.isActive ? (
                  <Button onClick={startSession} className="flex-1">
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
                  key={state.mobilityLevel}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className={`w-20 h-20 rounded-full mx-auto flex items-center justify-center ${config.bg}`}
                >
                  <span className="text-2xl font-bold text-background">{state.mobilityScore}</span>
                </motion.div>
                <p className={`mt-3 font-semibold ${config.color}`}>{config.label}</p>
                <p className="text-xs text-muted-foreground mt-1">Score: {state.mobilityScore}/10</p>
                {state.backendConnected && state.isActive && (
                  <p className="text-xs text-muted-foreground">
                    Confidence: {Math.round(state.confidence * 100)}%
                  </p>
                )}
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
                {showAngles ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
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
                      {Object.entries(state.angles).length > 0 ? (
                        Object.entries(state.angles).map(([key, val]) => (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-muted-foreground capitalize">
                              {key.replace(/_/g, " ")}
                            </span>
                            <span className="font-mono text-foreground">{val}°</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Start a session to see joint angles
                        </p>
                      )}
                    </div>
                  </CardContent>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </div>
      </div>

      <BrunnstromStageCard />
    </div>
  );
};

export default MobilityDetection;
