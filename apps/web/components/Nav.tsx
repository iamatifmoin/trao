"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { authApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "./Button";

export function Nav() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleLogout() {
    await authApi.logout();
    queryClient.setQueryData(["auth", "me"], { user: null });
    queryClient.clear();
    router.replace("/login");
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6" aria-label="Main">
        <Link href="/kits" className="text-base font-semibold text-slate-900">
          Interview Prep Kit
        </Link>
        {user && (
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <span className="hidden sm:inline">{user.email}</span>
            <Button variant="ghost" onClick={handleLogout}>
              Log out
            </Button>
          </div>
        )}
      </nav>
    </header>
  );
}
