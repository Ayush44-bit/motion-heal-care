import { useCallback, useState } from "react";
import { toast } from "sonner";

export interface BrunnstromFeatures {
  rom_index_mcp: number;
  rom_middle_mcp: number;
  rom_thumb_mcp: number;
  mean_velocity: number;
  peak_velocity: number;
  velocity_variance: number;
  mean_palm_acceleration: number;
  mean_dominant_finger_acceleration: number;
  mean_non_target_acceleration: number;
  finger_correlation_score: number;
  unintended_activation_ratio: number;
  stability_score: number;
  tremor_index: number;
  smoothness_index: number;
}

export interface BrunnstromPrediction {
  stage: number;
  label: string;
  description: string;
  confidence: number;
  probabilities: Record<string, number>;
}

const API_URL =
  (import.meta.env.VITE_BRUNNSTROM_API_URL as string | undefined) ||
  "https://hint-oxygen-quarter-race.trycloudflare.com";

export const useBrunnstromPrediction = () => {
  const [prediction, setPrediction] = useState<BrunnstromPrediction | null>(null);
  const [loading, setLoading] = useState(false);

  const predict = useCallback(async (features: BrunnstromFeatures) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/predict-brunnstrom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(features),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data: BrunnstromPrediction = await res.json();
      setPrediction(data);
      return data;
    } catch (e) {
      toast.error("Brunnstrom prediction unavailable. Is the Python API running?");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { prediction, loading, predict };
};
