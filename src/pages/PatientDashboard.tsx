import { Link } from "react-router-dom";
import { Activity, TrendingUp, Clock, MessageSquare, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";

const mockTrend = [
  { date: "Jan 5", mobility: 2 },
  { date: "Jan 12", mobility: 3 },
  { date: "Jan 19", mobility: 4 },
  { date: "Jan 26", mobility: 4 },
  { date: "Feb 2", mobility: 5 },
  { date: "Feb 9", mobility: 6 },
  { date: "Feb 16", mobility: 7 },
];

const PatientDashboard = () => {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Welcome back, {user?.name?.split(" ")[0]}</h1>
        <p className="text-muted-foreground">Here's your rehabilitation overview</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Last Mobility Score", value: "7/10", icon: Activity, color: "text-status-green" },
          { label: "Total Sessions", value: "12", icon: Clock, color: "text-primary" },
          { label: "Improvement", value: "+35%", icon: TrendingUp, color: "text-accent" },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
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

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mobility Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: 13,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="mobility"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--primary))", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">Start Session</h3>
                <p className="text-sm text-muted-foreground mt-1">Begin a new mobility detection session</p>
              </div>
              <Button size="sm" asChild>
                <Link to="/mobility">
                  Start <ArrowRight className="w-3 h-3 ml-1" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">Message Doctor</h3>
                <p className="text-sm text-muted-foreground mt-1">Chat with Dr. Michael Chen</p>
              </div>
              <Button size="sm" variant="outline" asChild>
                <Link to="/chat">
                  <MessageSquare className="w-3 h-3 mr-1" /> Chat
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Doctor Feedback */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Latest Feedback from Dr. Chen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-4 rounded-lg bg-muted">
            <p className="text-sm text-foreground leading-relaxed">
              "Great progress this week, Sarah! Your wrist extension has improved significantly.
              Keep focusing on the finger abduction exercises. Let's aim for 3 sessions next week."
            </p>
            <p className="text-xs text-muted-foreground mt-2">Feb 10, 2026</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PatientDashboard;
