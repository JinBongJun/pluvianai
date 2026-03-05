import "./globals.css";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ToastProvider } from "@/components/ToastContainer";
import ErrorBoundary from "@/components/ErrorBoundary";
import { MouseSpotlight } from "@/components/ui/MouseSpotlight";

const PostHogProviderWrapper = dynamic(
  () => import("@/components/analytics/PostHogProvider").then((m) => ({ default: m.default })),
  { ssr: false }
);

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PluvianAI — The Symbiotic Guardian for AI Agents",
  description:
    "Clinical grade validation for AI Agents. Cut hallucination rates & logic errors in half. Instantly.",
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
          <PostHogProviderWrapper>
            <ToastProvider>
              <div className="relative z-10">{children}</div>
            </ToastProvider>
          </PostHogProviderWrapper>
        </ErrorBoundary>
      </body>
    </html>
  );
}
