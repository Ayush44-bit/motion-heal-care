import { useAuth } from "@/contexts/AuthContext";
import PatientDashboard from "./PatientDashboard";
import DoctorDashboard from "./DoctorDashboard";

const Dashboard = () => {
  const { user } = useAuth();
  return user?.role === "doctor" ? <DoctorDashboard /> : <PatientDashboard />;
};

export default Dashboard;
