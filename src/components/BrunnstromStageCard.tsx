import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Activity, Loader2 } from "lucide-react";
import { useBrunnstromPrediction, type BrunnstromFeatures } from "@/hooks/useBrunnstromPrediction";

interface Props {
  features?: Partial<BrunnstromFeatures>;
}

const STAGE_COLORS: Record<number, string> = {
  1: "bg-destructive text-destructive-foreground",
  2: "bg-orange-500 text-white",
  3: "bg-yellow-500 text-black",
  4: "bg-blue-500 text-white",
  5: "bg-emerald-500 text-white",
  6: "bg-primary text-primary-foreground",
};

const DEMO_FEATURES: BrunnstromFeatures = {
  rom_index_mcp: 65,
  rom_middle_mcp: 70,
  rom_thumb_mcp: 45,
  mean_velocity: 32,
  peak_velocity: 88,
  velocity_variance: 12,
  mean_palm_acceleration: 4.2,
  mean_dominant_finger_acceleration: 6.8,
  mean_non_target_acceleration: 2.1,
  finger_correlation_score: 0.78,
  unintended_activation_ratio: 0.12,
  stability_score: 0.85,
  tremor_index: 0.08,
  smoothness_index: 0.91,
};

const BrunnstromStageCard = ({ features }: Props) => {
  const { prediction, loading, predict } = useBrunnstromPrediction();

  const handlePredict = () => {
    predict({ ...DEMO_FEATURES, ...features } as BrunnstromFeatures);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-primary" />
          <CardTitle className="text-lg">Brunnstrom Recovery Stage</CardTitle>
        </div>
        <CardDescription>
          ML-based classification of post-stroke motor recovery (1–6)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!prediction && (
          <Button onClick={handlePredict} disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            {loading ? "Analyzing..." : "Run Brunnstrom Prediction"}
          </Button>
        )}

        {prediction && (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Predicted Stage</p>
                <p className="text-3xl font-bold">{prediction.stage}</p>
              </div>
              <Badge className={STAGE_COLORS[prediction.stage] || ""}>
                {prediction.label}
              </Badge>
            </div>

            <p className="text-sm text-muted-foreground">{prediction.description}</p>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>Confidence</span>
                <span className="font-medium">{Math.round(prediction.confidence * 100)}%</span>
              </div>
              <Progress value={prediction.confidence * 100} />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase">
                Probability per stage
              </p>
              {Object.entries(prediction.probabilities).map(([stage, p]) => (
                <div key={stage} className="flex items-center gap-2">
                  <span className="text-xs w-12">Stage {stage}</span>
                  <Progress value={p * 100} className="flex-1 h-2" />
                  <span className="text-xs w-12 text-right">{Math.round(p * 100)}%</span>
                </div>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={handlePredict} disabled={loading} className="w-full">
              {loading ? "Re-analyzing..." : "Re-run Prediction"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default BrunnstromStageCard;
