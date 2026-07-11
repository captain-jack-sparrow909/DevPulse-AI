import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { APP_NAME } from "@/lib/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — Research-first content for engineers`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    "Research-first studio that turns live engineering signal into X and LinkedIn posts—one due slot at a time, with human approval and manual posting.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full min-h-dvh flex-col overflow-x-hidden app-bg text-zinc-100">
        {children}
      </body>
    </html>
  );
}
