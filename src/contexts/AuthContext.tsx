import React, { createContext, useContext, useState, useCallback } from "react";

export type UserRole = "patient" | "doctor";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string, role: UserRole) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Mock users for demo
const MOCK_USERS: User[] = [
  { id: "p1", name: "Sarah Johnson", email: "patient@demo.com", role: "patient" },
  { id: "d1", name: "Dr. Michael Chen", email: "doctor@demo.com", role: "doctor" },
];

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("rehab_user");
    return saved ? JSON.parse(saved) : null;
  });

  const login = useCallback(async (email: string, _password: string) => {
    // Mock login — replace with real API call
    const found = MOCK_USERS.find((u) => u.email === email);
    if (found) {
      setUser(found);
      localStorage.setItem("rehab_user", JSON.stringify(found));
    } else {
      // Create a patient user for any email
      const newUser: User = {
        id: crypto.randomUUID(),
        name: email.split("@")[0],
        email,
        role: "patient",
      };
      setUser(newUser);
      localStorage.setItem("rehab_user", JSON.stringify(newUser));
    }
  }, []);

  const signup = useCallback(async (name: string, email: string, _password: string, role: UserRole) => {
    const newUser: User = { id: crypto.randomUUID(), name, email, role };
    setUser(newUser);
    localStorage.setItem("rehab_user", JSON.stringify(newUser));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("rehab_user");
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
