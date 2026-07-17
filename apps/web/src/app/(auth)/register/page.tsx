"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth-shell";
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
    <AuthShell
      eyebrow="Create your workspace"
      title={`Start with ${APP_NAME}`}
      description="Build a private signal engine around your products, voice, and growth goals."
      footer={<>Already have an account? <Link href="/login" className="font-medium text-teal-300 hover:text-teal-200">Sign in</Link></>}
    >
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400">Name</label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Jabir" />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400">Email</label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-400">Password (min 8)</label>
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
    </AuthShell>
  );
}
