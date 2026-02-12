import { useCallback } from "react";

export interface AnalysisRecord {
  id: string;
  mode: "patient" | "doctor";
  contextKey: string; // e.g. "patient-dashboard" or "doctor-p1"
  content: string;
  timestamp: string;
  patientData: Record<string, unknown>;
}

const STORAGE_KEY = "rehab-ai-analysis-history";
const MAX_RECORDS = 50;

function getAll(): AnalysisRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveAll(records: AnalysisRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)));
}

export function useAnalysisHistory(contextKey: string) {
  const getHistory = useCallback((): AnalysisRecord[] => {
    return getAll().filter((r) => r.contextKey === contextKey);
  }, [contextKey]);

  const saveAnalysis = useCallback(
    (mode: "patient" | "doctor", content: string, patientData: Record<string, unknown>) => {
      const record: AnalysisRecord = {
        id: crypto.randomUUID(),
        mode,
        contextKey,
        content,
        timestamp: new Date().toISOString(),
        patientData,
      };
      const all = getAll();
      all.unshift(record);
      saveAll(all);
      return record;
    },
    [contextKey]
  );

  const deleteRecord = useCallback((id: string) => {
    saveAll(getAll().filter((r) => r.id !== id));
  }, []);

  return { getHistory, saveAnalysis, deleteRecord };
}
