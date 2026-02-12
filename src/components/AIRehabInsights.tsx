import { useState, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Brain, Loader2, RefreshCw, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useAnalysisHistory, type AnalysisRecord } from "@/hooks/useAnalysisHistory";
import AnalysisHistoryDrawer from "@/components/AnalysisHistoryDrawer";

interface AIRehabInsightsProps {
  mode: "patient" | "doctor";
  patientData: Record<string, unknown>;
  title?: string;
  description?: string;
  contextKey?: string;
}

const AIRehabInsights = ({ mode, patientData, title, description, contextKey }: AIRehabInsightsProps) => {
  const [analysis, setAnalysis] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<AnalysisRecord[]>([]);
  const { toast } = useToast();
  const fullTextRef = useRef("");

  const resolvedKey = contextKey || `${mode}-dashboard`;
  const { getHistory, saveAnalysis, deleteRecord } = useAnalysisHistory(resolvedKey);

  const FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-rehab-analysis`;

  const refreshHistory = useCallback(() => {
    setHistoryRecords(getHistory());
  }, [getHistory]);

  const handleDelete = useCallback(
    (id: string) => {
      deleteRecord(id);
      refreshHistory();
    },
    [deleteRecord, refreshHistory]
  );

  const runAnalysis = useCallback(async () => {
    setIsLoading(true);
    setAnalysis("");
    setHasAnalyzed(true);
    fullTextRef.current = "";

    try {
      const resp = await fetch(FUNCTION_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ mode, patientData }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "AI analysis failed" }));
        if (resp.status === 429) {
          toast({ title: "Rate Limited", description: "Please try again in a moment.", variant: "destructive" });
        } else if (resp.status === 402) {
          toast({ title: "Credits Depleted", description: "AI credits need to be topped up.", variant: "destructive" });
        } else {
          toast({ title: "Error", description: err.error || "Analysis failed", variant: "destructive" });
        }
        setIsLoading(false);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullTextRef.current += content;
              setAnalysis(fullTextRef.current);
            }
          } catch {
            buffer = line + "\n" + buffer;
            break;
          }
        }
      }

      // Auto-save completed analysis
      if (fullTextRef.current) {
        saveAnalysis(mode, fullTextRef.current, patientData);
        toast({ title: "Analysis saved", description: "This analysis has been saved to your history." });
      }
    } catch (e) {
      console.error(e);
      toast({ title: "Error", description: "Failed to connect to AI service.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [mode, patientData, FUNCTION_URL, toast, saveAnalysis]);

  const defaultTitle = mode === "patient" ? "AI Rehabilitation Assistant" : "AI Clinical Insights";
  const defaultDesc = mode === "patient"
    ? "Get personalized exercise suggestions and progress analysis"
    : "AI-powered clinical analysis and treatment recommendations";

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Brain className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                {title || defaultTitle}
                <Sparkles className="w-4 h-4 text-accent" />
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{description || defaultDesc}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AnalysisHistoryDrawer
              records={historyRecords}
              onDelete={handleDelete}
              onRefresh={refreshHistory}
            />
            <Button
              size="sm"
              onClick={runAnalysis}
              disabled={isLoading}
              variant={hasAnalyzed ? "outline" : "default"}
            >
              {isLoading ? (
                <><Loader2 className="w-3 h-3 animate-spin mr-1" /> Analyzing...</>
              ) : hasAnalyzed ? (
                <><RefreshCw className="w-3 h-3 mr-1" /> Re-analyze</>
              ) : (
                <><Brain className="w-3 h-3 mr-1" /> Analyze</>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <AnimatePresence mode="wait">
          {!hasAnalyzed && !isLoading ? (
            <motion.div
              key="placeholder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-8 text-muted-foreground"
            >
              <Brain className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Click "Analyze" to get AI-powered {mode === "patient" ? "exercise recommendations" : "clinical insights"}</p>
            </motion.div>
          ) : (
            <motion.div
              key="content"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-li:text-foreground/90"
            >
              {analysis ? (
                <ReactMarkdown>{analysis}</ReactMarkdown>
              ) : isLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground py-4">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Analyzing rehabilitation data...</span>
                </div>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
};

export default AIRehabInsights;
