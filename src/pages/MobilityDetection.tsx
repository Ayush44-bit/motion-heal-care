import { useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  FileSpreadsheet,
  Loader2,
  Monitor,
  PlayCircle,
  StopCircle,
  Upload,
  Wifi,
  WifiOff,
} from "lucide-react";
import { motion } from "framer-motion";
import BrunnstromStageCard from "@/components/BrunnstromStageCard";
import {
  useBrunnstromPrediction,
  type SessionPrediction,
} from "@/hooks/useBrunnstromPrediction";
import { useLocalSession } from "@/hooks/useLocalSession";

const formatTime = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const MobilityDetection = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    prediction,
    session,
    loading: predicting,
    predictFromExcel,
    setSessionPrediction,
    reset,
  } = useBrunnstromPrediction();

  const handlePrediction = (data: SessionPrediction) => setSessionPrediction(data);

  const { state, working, startSession, stopSession } = useLocalSession(handlePrediction);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    await predictFromExcel(file);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Mobility Detection</h1>
          <p className="text-muted-foreground">
            Protocol-driven hand assessment for Brunnstrom staging
          </p>
        </div>
        <Badge variant={state.backendConnected ? "default" : "secondary"} className="gap-1.5">
          {state.backendConnected ? (
            <><Wifi className="w-3 h-3" /> Local API Connected</>
          ) : (
            <><WifiOff className="w-3 h-3" /> API Offline</>
          )}
        </Badge>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Session control */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="w-5 h-5 text-primary" /> Local Data Acquisition
              </CardTitle>
              <CardDescription>
                The clinical-grade hand tracker runs on your local device. Follow the
                on-screen prompts in the <strong>Hand Movement Tracker</strong> window
                that opens on your computer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative aspect-video bg-foreground/5 rounded-lg overflow-hidden flex items-center justify-center">
                {state.isActive ? (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center space-y-4"
                  >
                    <div className="relative inline-block">
                      <div className="w-20 h-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <Activity className="w-10 h-10 text-emerald-500" />
                      </div>
                      <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 animate-pulse" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">Session in progress</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Follow prompts in the tracker window on your computer
                      </p>
                    </div>
                    <div className="font-mono text-3xl font-bold tracking-wider">
                      {formatTime(state.elapsed)}
                    </div>
                    {state.sessionId && (
                      <p className="text-xs text-muted-foreground font-mono">
                        {state.sessionId}
                      </p>
                    )}
                  </motion.div>
                ) : (
                  <div className="text-center space-y-3">
                    <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                      <PlayCircle className="w-8 h-8 text-primary" />
                    </div>
                    <p className="text-muted-foreground text-sm max-w-sm">
                      Click <strong>Start Session</strong> to launch the protocol-driven
                      assessment on your local device
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                {!state.isActive ? (
                  <Button
                    onClick={startSession}
                    disabled={working || !state.backendConnected}
                    className="flex-1"
                  >
                    {working ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <PlayCircle className="w-4 h-4 mr-2" />
                    )}
                    Start Session
                  </Button>
                ) : (
                  <Button
                    onClick={stopSession}
                    disabled={working}
                    variant="destructive"
                    className="flex-1"
                  >
                    {working ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <StopCircle className="w-4 h-4 mr-2" />
                    )}
                    End Session & Analyze
                  </Button>
                )}

                <Button
                  variant="outline"
                  disabled={state.isActive || uploading || predicting}
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 sm:flex-none"
                >
                  {uploading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  Upload CSV
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleUpload}
                />
              </div>

              {!state.backendConnected && (
                <p className="text-xs text-muted-foreground">
                  Local API offline. Start the FastAPI server (and cloudflared tunnel) on
                  your computer to enable session control.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Session info panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-primary" /> Session Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium">
                  {state.isActive
                    ? "Recording"
                    : session
                      ? "Analyzed"
                      : "Idle"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Trials analyzed</span>
                <span className="font-medium">{session?.trial_count ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Source file</span>
                <span className="font-mono text-xs truncate max-w-[140px]">
                  {session?.excel_filename ?? "—"}
                </span>
              </div>
              {(prediction || session) && (
                <Button variant="ghost" size="sm" onClick={reset} className="w-full mt-2">
                  Clear results
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <BrunnstromStageCard
        externalPrediction={prediction}
        externalSession={session}
        loading={predicting || working}
        emptyHint="Run a session or upload an Excel file from a previous session to see your Brunnstrom recovery stage."
      />
    </div>
  );
};

export default MobilityDetection;