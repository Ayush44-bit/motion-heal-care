import { Link } from "react-router-dom";
import { Users, TrendingUp, Calendar, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import AIRehabInsights from "@/components/AIRehabInsights";

const mockPatients = [
  { id: "p1", name: "Sarah Johnson", lastSession: "Feb 10, 2026", score: 7, trend: "up", sessions: 12 },
  { id: "p2", name: "James Williams", lastSession: "Feb 9, 2026", score: 4, trend: "up", sessions: 8 },
  { id: "p3", name: "Emma Davis", lastSession: "Feb 8, 2026", score: 3, trend: "stable", sessions: 5 },
  { id: "p4", name: "Robert Brown", lastSession: "Feb 7, 2026", score: 6, trend: "up", sessions: 15 },
];

const getScoreColor = (score: number) => {
  if (score >= 7) return "bg-status-green/10 text-status-green";
  if (score >= 4) return "bg-status-yellow/10 text-status-yellow";
  return "bg-status-red/10 text-status-red";
};

const DoctorDashboard = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welcome, {user?.name}</h1>
        <p className="text-muted-foreground">Your patient overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Active Patients", value: "4", icon: Users },
          { label: "Sessions This Week", value: "8", icon: Calendar },
          { label: "Avg. Improvement", value: "+28%", icon: TrendingUp },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  </div>
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                    <stat.icon className="w-5 h-5 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Patients List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assigned Patients</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {mockPatients.map((patient) => (
              <div
                key={patient.id}
                className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                    {patient.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{patient.name}</p>
                    <p className="text-xs text-muted-foreground">Last session: {patient.lastSession} · {patient.sessions} sessions</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${getScoreColor(patient.score)}`}>
                    {patient.score}/10
                  </span>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to={`/patients/${patient.id}`}>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      {/* AI Clinical Insights */}
      <AIRehabInsights
        mode="doctor"
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
    </div>
  );
};

export default DoctorDashboard;
