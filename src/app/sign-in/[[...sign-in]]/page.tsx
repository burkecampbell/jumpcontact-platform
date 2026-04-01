'use client';

import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0A0E1A',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Inter, -apple-system, sans-serif',
      }}
    >
      {/* Brand header */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            marginBottom: 8,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #3EA5C3, #21A8A5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
            </svg>
          </div>
          <span
            style={{
              fontWeight: 700,
              fontSize: 20,
              color: '#f1f5f9',
              letterSpacing: '-0.3px',
            }}
          >
            Jump Contact
          </span>
        </div>
        <p style={{ fontSize: 14, color: '#8B92A8', margin: 0 }}>
          Operations Platform
        </p>
      </div>

      <SignIn />

      <div style={{ textAlign: 'center', marginTop: 24 }}>
        <p style={{ fontSize: 11, color: '#4a5068', fontWeight: 500 }}>
          Jump Contact &middot; Secure Access
        </p>
      </div>
    </div>
  );
}
