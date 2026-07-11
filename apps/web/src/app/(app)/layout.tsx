import { requireUser } from "@/lib/session";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();

  return <AppShell>{children}</AppShell>;
}
