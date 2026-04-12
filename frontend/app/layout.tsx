import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import PaddlePaymentLinkHandler from "@/components/billing/PaddlePaymentLinkHandler";
import { ToastProvider } from "@/components/ToastContainer";
import ErrorBoundary from "@/components/ErrorBoundary";
import { MouseSpotlight } from "@/components/ui/MouseSpotlight";
import PostHogProvider from "@/components/analytics/PostHogProvider";

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.pluvianai.com"),
  title: "PluvianAI — Validation & Release Gates for AI Agents",
  description:
    "Validate and ship AI agents with confidence. Live view, release gates, and behavior checks.",
  openGraph: {
    title: "PluvianAI — Validation & Release Gates for AI Agents",
    description:
      "Validate and ship AI agents with confidence. Live view, release gates, and behavior checks.",
    url: "https://www.pluvianai.com",
    siteName: "PluvianAI",
  },
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={plusJakartaSans.className}>
        <div className="bg-flowing-lines pointer-events-none fixed inset-0 z-0 opacity-100" />
        <MouseSpotlight />
        <ErrorBoundary>
          <PostHogProvider>
            <ToastProvider>
              <Suspense fallback={null}>
                <PaddlePaymentLinkHandler />
              </Suspense>
              <div className="relative z-10">{children}</div>
            </ToastProvider>
          </PostHogProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
