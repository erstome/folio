import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { Toaster } from "sonner";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ConfirmProvider } from "@/components/ui/confirm-dialog";
import { auth, isCloudMode } from "@/lib/auth";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Folio - Investment Tracker",
  description: "Personal investment tracking application",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = isCloudMode() ? await auth() : null;
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased bg-zinc-950 text-zinc-100 flex min-h-screen`}>
        <ConfirmProvider>
          <Suspense>
            <Sidebar userEmail={session?.user?.email} />
          </Suspense>
          <main className="flex-1 overflow-x-hidden">
            {children}
          </main>
          <Toaster richColors theme="dark" position="bottom-right" />
        </ConfirmProvider>
      </body>
    </html>
  );
}
