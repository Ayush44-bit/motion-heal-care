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

export interface PerMovementPrediction {
  movement_name: string;
  trial_index: number | null;
  stage: number;
  label: string;
  confidence: number;
  probabilities: Record<string, number>;
}

export interface SessionPrediction {
  overall: BrunnstromPrediction;
  per_movement: PerMovementPrediction[];
  excel_filename: string;
  trial_count: number;
}

export const API_URL =
  (import.meta.env.VITE_BRUNNSTROM_API_URL as string | undefined) ||
  "https://penny-compromise-backed-volt.trycloudflare.com";

export const useBrunnstromPrediction = () => {
  const [prediction, setPrediction] = useState<BrunnstromPrediction | null>(null);
  const [session, setSession] = useState<SessionPrediction | null>(null);
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

  const predictFromExcel = useCallback(async (file: File) => {
    setLoading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_URL}/predict-from-excel`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data: SessionPrediction = await res.json();
      setSession(data);
      setPrediction(data.overall);
      return data;
    } catch {
      toast.error("Could not predict from Excel. Is the Python API running?");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const setSessionPrediction = useCallback((data: SessionPrediction) => {
    setSession(data);
    setPrediction(data.overall);
  }, []);

  const reset = useCallback(() => {
    setPrediction(null);
    setSession(null);
  }, []);

  return { prediction, session, loading, predict, predictFromExcel, setSessionPrediction, reset };
};
