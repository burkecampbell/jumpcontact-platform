'use client';

import React, { Component } from 'react';
import { C } from '@/lib/constants';

interface Props {
  /** Optional label shown in the fallback card */
  section?: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React error boundary — wraps page sections so one failure
 * doesn't crash the entire dashboard.
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.section ? ` — ${this.props.section}` : ''}]`, error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="rounded-xl p-6 text-center"
          style={{ background: C.card, border: `1px solid ${C.border}` }}
        >
          <p className="text-lg font-semibold mb-1" style={{ color: C.text }}>
            Something went wrong
          </p>
          {this.props.section && (
            <p className="text-sm mb-3" style={{ color: C.sub }}>
              Section: {this.props.section}
            </p>
          )}
          <p className="text-xs mb-4 font-mono" style={{ color: C.pink }}>
            {this.state.error?.message || 'Unknown error'}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{ background: C.cyan, color: C.bg }}
          >
            Retry
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
