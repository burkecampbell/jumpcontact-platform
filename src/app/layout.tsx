import type { Metadata } from 'next';
import { getClerkThemeVariables, getPageBackground } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'JumpContact Platform',
  description: 'Call center operations dashboard — Jump Contact',
  icons: { icon: '/logo.png' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const inner = (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased min-h-screen" style={{ background: getPageBackground() }}>
        <main className="pt-14">
          {children}
        </main>
      </body>
    </html>
  );

  if (process.env.CLERK_SECRET_KEY) {
    const { ClerkProvider } = await import('@clerk/nextjs');
    const { dark } = await import('@clerk/themes');
    return (
      <ClerkProvider
        afterSignOutUrl="/sign-in"
        appearance={{ baseTheme: dark, variables: getClerkThemeVariables() }}
      >
        {inner}
      </ClerkProvider>
    );
  }

  return inner;
}
