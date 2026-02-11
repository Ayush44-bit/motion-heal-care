import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";

const Profile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        <p className="text-muted-foreground">Manage your account</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
              {user?.name?.charAt(0)}
            </div>
            <div>
              <p className="font-semibold text-foreground">{user?.name}</p>
              <p className="text-sm text-muted-foreground capitalize">{user?.role}</p>
            </div>
          </div>

          <div>
            <Label>Full Name</Label>
            <Input value={user?.name || ""} readOnly className="mt-1.5" />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={user?.email || ""} readOnly className="mt-1.5" />
          </div>
          <div>
            <Label>Role</Label>
            <Input value={user?.role || ""} readOnly className="mt-1.5 capitalize" />
          </div>
        </CardContent>
      </Card>

      <Button variant="destructive" onClick={handleLogout} className="w-full">
        Sign Out
      </Button>
    </div>
  );
};

export default Profile;
