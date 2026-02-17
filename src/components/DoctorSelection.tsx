import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Stethoscope, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Doctor {
  user_id: string;
  name: string;
}

export default function DoctorSelection() {
  const { user } = useAuth();
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [hasAssignment, setHasAssignment] = useState(false);

  useEffect(() => {
    if (!user) return;

    // Check if patient already has a doctor
    const checkAssignment = async () => {
      const { data } = await supabase
        .from("patient_doctor_assignments")
        .select("id")
        .eq("patient_id", user.id)
        .limit(1);
      if (data && data.length > 0) {
        setHasAssignment(true);
      }
    };

    // Fetch all doctors
    const fetchDoctors = async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "doctor");

      if (roleRows && roleRows.length > 0) {
        const doctorIds = roleRows.map((r) => r.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, name")
          .in("user_id", doctorIds);

        setDoctors(
          (profiles || []).map((p) => ({ user_id: p.user_id, name: p.name || "Unnamed Doctor" }))
        );
      }
      setLoading(false);
    };

    checkAssignment();
    fetchDoctors();
  }, [user]);

  const assignDoctor = async (doctorId: string) => {
    if (!user) return;
    setAssigning(true);
    const { error } = await supabase.from("patient_doctor_assignments").insert({
      patient_id: user.id,
      doctor_id: doctorId,
    });
    if (error) {
      toast.error("Failed to assign doctor");
    } else {
      toast.success("Doctor assigned successfully!");
      setHasAssignment(true);
    }
    setAssigning(false);
  };

  if (hasAssignment) return null;
  if (user?.role !== "patient") return null;

  return (
    <Card className="border-primary/30 bg-primary/5 mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Stethoscope className="w-5 h-5 text-primary" />
          Select Your Doctor
        </CardTitle>
        <CardDescription>
          Choose a doctor to start your rehabilitation journey. You'll be able to message them directly.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : doctors.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            No doctors are available yet. Please check back later.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {doctors.map((doc) => (
              <div
                key={doc.user_id}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-card"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                    {doc.name.charAt(0)}
                  </div>
                  <span className="text-sm font-medium text-foreground">{doc.name}</span>
                </div>
                <Button size="sm" disabled={assigning} onClick={() => assignDoctor(doc.user_id)}>
                  Select
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
