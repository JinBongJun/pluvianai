import './globals.css'
import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import { ToastProvider } from '@/components/ToastContainer'
import ErrorBoundary from '@/components/ErrorBoundary'
import PostHogProviderWrapper from '@/components/analytics/PostHogProvider'

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-plus-jakarta',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'PluvianAI — The Symbiotic Guardian for AI Agents',
  description: 'Clinical grade validation for AI Agents. Cut hallucination rates & logic errors in half. Instantly.',
  icons: {
    icon: '/icon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={plusJakartaSans.className}>
        <ErrorBoundary>
          <PostHogProviderWrapper>
            <ToastProvider>
              {children}
            </ToastProvider>
          </PostHogProviderWrapper>
        </ErrorBoundary>
      </body>
    </html>
  )
}
