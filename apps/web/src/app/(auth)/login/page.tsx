"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth-shell";
import { APP_NAME } from "@/lib/constants";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn.email({ email, password });
    setLoading(false);
    if (res.error) {
      setError(res.error.message || "Sign in failed");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <AuthShell
      eyebrow="Welcome back"
      title={`Sign in to ${APP_NAME}`}
      description="Return to your product intelligence, publishing queue, and growth experiments."
      footer={<>No account? <Link href="/register" className="font-medium text-teal-300 hover:text-teal-200">Create one</Link></>}
    >
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400">Email</label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400">Password</label>
              <Input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
    </AuthShell>
  );
}
