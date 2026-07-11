"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_NAME } from "@/lib/constants";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signUp.email({ name, email, password });
    setLoading(false);
    if (res.error) {
      setError(res.error.message || "Registration failed");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-dvh min-h-screen flex-col items-center justify-center p-4 sm:p-6">
      <Link
        href="/"
        className="mb-6 text-xs font-medium text-zinc-500 transition hover:text-teal-300"
      >
        ← Back to DevPulse
      </Link>
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400/20 to-teal-600/5 font-mono text-sm font-bold text-teal-300 shadow-[inset_0_0_0_1px_rgba(45,212,191,0.25)]">
            DP
          </div>
          <CardTitle className="text-xl tracking-tight">Create your {APP_NAME} account</CardTitle>
          <CardDescription>
            Solo research-first studio. Free-tier services by design. You post manually.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Name</label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Jabir" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Email</label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-400">Password (min 8)</label>
              <Input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Creating…" : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-zinc-500">
            Already have an account?{" "}
            <Link href="/login" className="text-cyan-400 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
