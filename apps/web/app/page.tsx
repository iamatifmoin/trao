"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { PageSpinner } from "@/components/Spinner";

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    router.replace(user ? "/kits" : "/login");
  }, [user, isLoading, router]);

  return <PageSpinner />;
}
