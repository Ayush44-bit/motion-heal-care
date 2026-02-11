import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

const allSessions = [
  { patient: "Sarah Johnson", date: "Feb 10, 2026", score: 7, duration: "12:34" },
  { patient: "James Williams", date: "Feb 9, 2026", score: 4, duration: "10:20" },
  { patient: "Sarah Johnson", date: "Feb 8, 2026", score: 6, duration: "15:45" },
  { patient: "Emma Davis", date: "Feb 8, 2026", score: 3, duration: "09:12" },
  { patient: "Robert Brown", date: "Feb 7, 2026", score: 6, duration: "11:10" },
  { patient: "James Williams", date: "Feb 6, 2026", score: 3, duration: "08:50" },
];

const exportCSV = () => {
  const header = "Patient,Date,Score,Duration\n";
  const rows = allSessions.map((s) => `${s.patient},${s.date},${s.score},${s.duration}`).join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "all_sessions.csv";
  a.click();
  URL.revokeObjectURL(url);
};

const Reports = () => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Reports</h1>
        <p className="text-muted-foreground">All patient session logs</p>
      </div>
      <Button variant="outline" size="sm" onClick={exportCSV}>
        <Download className="w-3 h-3 mr-1" /> Export CSV
      </Button>
    </div>

    <Card>
      <CardHeader><CardTitle className="text-base">Session Logs</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Patient</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Score</TableHead>
              <TableHead>Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allSessions.map((s, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{s.patient}</TableCell>
                <TableCell>{s.date}</TableCell>
                <TableCell>{s.score}/10</TableCell>
                <TableCell>{s.duration}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  </div>
);

export default Reports;
