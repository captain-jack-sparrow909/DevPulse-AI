import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-6 text-center">
      <div className="w-full">
        <p className="font-mono text-sm text-teal-300">404</p>
        <h1 className="mt-3 text-3xl font-semibold text-zinc-100">Page not found</h1>
        <p className="mt-3 text-zinc-400">The page may have moved or the link is no longer valid.</p>
        <Link className="mt-6 inline-flex rounded-xl bg-teal-400 px-4 py-2 text-sm font-medium text-zinc-950" href="/dashboard">Return to dashboard</Link>
      </div>
    </main>
  );
}
