import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { getClerkThemeVariables, getPageBackground } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'JumpContact Platform',
  description: 'Call center operations dashboard — Jump Contact',
  icons: { icon: '/logo.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased min-h-screen" style={{ background: getPageBackground() }}>
        <ClerkProvider
          afterSignOutUrl="/sign-in"
          appearance={{
            baseTheme: dark,
            variables: getClerkThemeVariables(),
          }}
        >
          <main className="pt-14">
            {children}
          </main>
        </ClerkProvider>
      </body>
    </html>
  );
}
