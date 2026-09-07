"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { PageSpinner } from "./Spinner";

/**
 * Client-side auth gate. The session cookie lives on the API's origin, so a
 * Next server (even in this same app) has no way to check it during
 * rendering — only the browser, via a credentialed fetch, can. See the note
 * in lib/api-client.ts.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  if (isLoading) return <PageSpinner label="Checking your session…" />;
  if (!user) return null;

  return <>{children}</>;
}
