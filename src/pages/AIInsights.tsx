import { useAuth } from "@/contexts/AuthContext";
import { useParams } from "react-router-dom";
import AIRehabInsights from "@/components/AIRehabInsights";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain } from "lucide-react";

const mockTrend = [
  { date: "Jan 5", mobility: 2 },
  { date: "Jan 12", mobility: 3 },
  { date: "Jan 19", mobility: 4 },
  { date: "Jan 26", mobility: 4 },
  { date: "Feb 2", mobility: 5 },
  { date: "Feb 9", mobility: 6 },
  { date: "Feb 16", mobility: 7 },
];

const mockPatients = [
  { id: "p1", name: "Sarah Johnson", lastSession: "Feb 10, 2026", score: 7, trend: "up", sessions: 12 },
  { id: "p2", name: "James Williams", lastSession: "Feb 9, 2026", score: 4, trend: "up", sessions: 8 },
  { id: "p3", name: "Emma Davis", lastSession: "Feb 8, 2026", score: 3, trend: "stable", sessions: 5 },
  { id: "p4", name: "Robert Brown", lastSession: "Feb 7, 2026", score: 6, trend: "up", sessions: 15 },
];

const trendData = [
  { date: "Jan 5", score: 2 },
  { date: "Jan 12", score: 3 },
  { date: "Jan 19", score: 4 },
  { date: "Jan 26", score: 5 },
  { date: "Feb 2", score: 5 },
  { date: "Feb 9", score: 7 },
];

const sessionHistory = [
  { id: 1, date: "Feb 10, 2026", duration: "12:34", score: 7, level: "Full" },
  { id: 2, date: "Feb 8, 2026", duration: "10:20", score: 6, level: "Partial" },
  { id: 3, date: "Feb 5, 2026", duration: "15:45", score: 5, level: "Partial" },
  { id: 4, date: "Feb 2, 2026", duration: "11:10", score: 5, level: "Partial" },
  { id: 5, date: "Jan 28, 2026", duration: "09:50", score: 4, level: "Partial" },
  { id: 6, date: "Jan 25, 2026", duration: "13:22", score: 3, level: "Minimal" },
];

const AIInsightsPage = () => {
  const { user } = useAuth();
  const isDoctor = user?.role === "doctor";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <Brain className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">AI Insights</h1>
          <p className="text-muted-foreground">
            {isDoctor
              ? "AI-powered clinical analysis and treatment recommendations"
              : "Personalized exercise suggestions and progress analysis"}
          </p>
        </div>
      </div>

      {isDoctor ? (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">All Patients Overview</TabsTrigger>
            {mockPatients.map((p) => (
              <TabsTrigger key={p.id} value={p.id}>{p.name.split(" ")[0]}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview">
            <AIRehabInsights
              mode="doctor"
              contextKey="doctor-dashboard"
              patientData={{
                activePatients: mockPatients.length,
                patients: mockPatients.map((p) => ({
                  name: p.name,
                  lastSession: p.lastSession,
                  score: p.score,
                  trend: p.trend,
                  totalSessions: p.sessions,
                })),
                avgImprovement: "+28%",
                sessionsThisWeek: 8,
              }}
            />
          </TabsContent>

          {mockPatients.map((p) => (
            <TabsContent key={p.id} value={p.id}>
              <AIRehabInsights
                mode="doctor"
                contextKey={`doctor-patient-${p.id}`}
                title={`AI Insights for ${p.name}`}
                description={`Clinical analysis of ${p.name}'s rehabilitation progress`}
                patientData={{
                  patientName: p.name,
                  totalSessions: p.sessions,
                  mobilityTrend: trendData,
                  sessionHistory,
                  latestScore: p.score,
                }}
              />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <AIRehabInsights
          mode="patient"
          contextKey="patient-dashboard"
          patientData={{
            patientName: user?.name || "Patient",
            lastMobilityScore: 7,
            totalSessions: 12,
            improvement: "+35%",
            mobilityTrend: mockTrend,
            doctorFeedback:
              "Great progress this week, Sarah! Your wrist extension has improved significantly. Keep focusing on the finger abduction exercises. Let's aim for 3 sessions next week.",
          }}
        />
      )}
    </div>
  );
};

export default AIInsightsPage;
