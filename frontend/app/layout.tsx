import './globals.css'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ToastProvider } from '@/components/ToastContainer'
import ErrorBoundary from '@/components/ErrorBoundary'
import PostHogProviderWrapper from '@/components/analytics/PostHogProvider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Synpira — The test lab for agents',
  description: 'The test lab for agents. Run experiments, watch live, monitor quality and cost.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
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



