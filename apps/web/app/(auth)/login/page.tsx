import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getStaffSession, homeFor } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Login" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getStaffSession();
  if (session) redirect(homeFor(session.role));
  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">CatalogLink</h1>
          <p className="mt-1 text-sm text-stone-500">Sign in to manage your catalog</p>
        </div>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
