import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, MessageSquare } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import AIRehabInsights from "@/components/AIRehabInsights";

const mockData = {
  p1: { name: "Sarah Johnson", sessions: 12 },
  p2: { name: "James Williams", sessions: 8 },
  p3: { name: "Emma Davis", sessions: 5 },
  p4: { name: "Robert Brown", sessions: 15 },
};

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

const exportCSV = () => {
  const header = "Date,Duration,Score,Level\n";
  const rows = sessionHistory.map((s) => `${s.date},${s.duration},${s.score},${s.level}`).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "session_history.csv";
  a.click();
  URL.revokeObjectURL(url);
};

const PatientDetail = () => {
  const { id } = useParams();
  const patient = mockData[id as keyof typeof mockData] || { name: "Unknown", sessions: 0 };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/dashboard"><ArrowLeft className="w-4 h-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{patient.name}</h1>
          <p className="text-muted-foreground">{patient.sessions} total sessions</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/chat"><MessageSquare className="w-3 h-3 mr-1" /> Message</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="w-3 h-3 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Progress Chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Mobility Progression</CardTitle></CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px" }} />
                <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Session History */}
      <Card>
        <CardHeader><CardTitle className="text-base">Session History</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Level</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessionHistory.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.date}</TableCell>
                  <TableCell>{s.duration}</TableCell>
                  <TableCell>{s.score}/10</TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      s.level === "Full" ? "bg-status-green/10 text-status-green" :
                      s.level === "Partial" ? "bg-status-yellow/10 text-status-yellow" :
                      "bg-status-red/10 text-status-red"
                    }`}>
                      {s.level}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* AI Clinical Insights for this Patient */}
      <AIRehabInsights
        mode="doctor"
        title={`AI Insights for ${patient.name}`}
        description="AI-powered analysis of this patient's rehabilitation progress"
        patientData={{
          patientName: patient.name,
          totalSessions: patient.sessions,
          mobilityTrend: trendData,
          sessionHistory,
          latestScore: trendData[trendData.length - 1]?.score,
        }}
      />
    </div>
  );
};

export default PatientDetail;
