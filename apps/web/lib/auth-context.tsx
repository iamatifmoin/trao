"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi, type AuthUser } from "./api";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  refresh: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => authApi.me(),
  });

  const value: AuthContextValue = {
    user: data?.user ?? null,
    isLoading,
    refresh: () => queryClient.invalidateQueries({ queryKey: ["auth", "me"] }),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
