import { useAuth } from "@/contexts/AuthContext";
import DashboardLayout from "@/components/DashboardLayout";
import { Navigate } from "react-router-dom";

const Patients = () => {
  const { user } = useAuth();
  if (user?.role !== "doctor") return <Navigate to="/dashboard" replace />;
  // Reuse DoctorDashboard's patient list — redirect to dashboard for now
  return <Navigate to="/dashboard" replace />;
};

export default Patients;
