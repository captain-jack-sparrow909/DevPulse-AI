import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: "DevPulse AI — Research-first content for engineers",
  description:
    "Turn owned-product lessons and narrowly relevant engineering research into posts for X and LinkedIn. One due slot at a time. You approve. You post.",
  openGraph: {
    title: "DevPulse AI — Research-first content for engineers",
    description:
      "A production-minded studio that researches before it writes—and never auto-publishes without you.",
    type: "website",
  },
};

export default async function HomePage() {
  const session = await getSession();
  if (session?.user) {
    redirect("/dashboard");
  }

  return <LandingPage />;
}
