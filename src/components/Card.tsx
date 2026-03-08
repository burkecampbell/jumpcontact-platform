'use client';

import { C } from '@/lib/constants';
import { type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  padding?: boolean;
}

export default function Card({ children, className = '', padding = true }: Props) {
  return (
    <div
      className={`rounded-2xl border backdrop-blur-md ${padding ? 'p-5' : ''} ${className}`}
      style={{
        background: C.card,
        borderColor: C.border,
      }}
    >
      {children}
    </div>
  );
}
