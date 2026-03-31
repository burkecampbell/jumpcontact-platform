'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

// ── Brand Colors ────────────────────────────────────────────────────────────
const C = {
  bg: '#0A0E1A',
  card: '#141824',
  text: '#f1f5f9',
  sub: '#8B92A8',
  border: 'rgba(62,165,195,0.18)',
  cyan: '#3EA5C3',
  lime: '#BCFD4C',
  pink: '#E63888',
};

function PlayerInner() {
  const params = useSearchParams();
  const sid = params.get('sid') || '';
  const agentSid = params.get('agent_sid') || '';
  const agent = params.get('agent') || '';
  const client = params.get('client') || '';
  const phone = params.get('phone') || '';
  const time = params.get('time') || '';
  const dur = params.get('dur') || '';
  const dir = params.get('dir') || 'inbound';

  const audioRef = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const audioUrl = sid ? `/api/calls/recording?sid=${sid}${agentSid ? `&agent_sid=${agentSid}` : ''}` : '';

  const load = useCallback(() => {
    if (!audioRef.current || !audioUrl) return;
    setState('loading');
    audioRef.current.src = audioUrl;
    audioRef.current.load();
  }, [audioUrl]);

  useEffect(() => {
    if (sid) load();
  }, [sid, load]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onCanPlay = () => {
      setState('ready');
      setDuration(audio.duration);
    };
    const onPlay = () => setState('playing');
    const onPause = () => setState('paused');
    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
    };
    const onEnded = () => { setState('ready'); setProgress(0); setCurrentTime(0); };
    const onError = () => setState('error');

    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (state === 'playing') audio.pause();
    else if (state === 'ready' || state === 'paused') audio.play();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audio.currentTime = pct * audio.duration;
  };

  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const fmtDisplayTime = (iso: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('en-US', {
        timeZone: 'America/Edmonton',
        weekday: 'short', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
      });
    } catch { return iso; }
  };

  if (!sid) {
    return (
      <div style={{ background: C.bg, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: C.sub, fontSize: 14 }}>No call SID provided</div>
      </div>
    );
  }

  return (
    <div style={{
      background: C.bg,
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    }}>
      {/* Subtle grid background */}
      <div style={{
        position: 'fixed', inset: 0, opacity: 0.03,
        backgroundImage: `linear-gradient(${C.cyan} 1px, transparent 1px), linear-gradient(90deg, ${C.cyan} 1px, transparent 1px)`,
        backgroundSize: '60px 60px',
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: 520,
        margin: '0 auto',
        padding: '0 20px',
      }}>
        {/* Branding */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: C.cyan, textTransform: 'uppercase', marginBottom: 4 }}>
            Jump Contact
          </div>
          <div style={{ fontSize: 13, color: C.sub }}>Call Recording</div>
        </div>

        {/* Player Card */}
        <div style={{
          background: C.card,
          borderRadius: 20,
          border: `1px solid ${C.border}`,
          overflow: 'hidden',
          boxShadow: `0 0 80px ${C.cyan}08, 0 20px 60px rgba(0,0,0,0.5)`,
        }}>
          {/* Call Info Header */}
          <div style={{
            padding: '28px 28px 20px',
            borderBottom: `1px solid ${C.border}`,
          }}>
            {/* Direction badge */}
            <div style={{ marginBottom: 16 }}>
              <span style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: dir === 'inbound' ? '#4ade80' : C.cyan,
                background: dir === 'inbound' ? '#4ade8015' : C.cyan + '15',
                padding: '4px 10px',
                borderRadius: 6,
              }}>
                {dir === 'inbound' ? '↓ Inbound' : '↑ Outbound'}
              </span>
            </div>

            {/* Client name */}
            {client && (
              <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginBottom: 6, lineHeight: 1.2 }}>
                {client}
              </div>
            )}

            {/* Details row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', marginTop: 12 }}>
              {agent && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.sub, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Agent</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{agent}</div>
                </div>
              )}
              {phone && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.sub, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Phone</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.text, fontFamily: 'monospace' }}>{phone}</div>
                </div>
              )}
              {dur && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: C.sub, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>Duration</div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: C.text, fontFamily: 'monospace' }}>{dur}</div>
                </div>
              )}
            </div>
            {time && (
              <div style={{ fontSize: 12, color: C.sub, marginTop: 12 }}>{fmtDisplayTime(time)}</div>
            )}
          </div>

          {/* Player Controls */}
          <div style={{ padding: '24px 28px 28px' }}>
            <audio ref={audioRef} preload="none" />

            {state === 'error' ? (
              <div style={{
                textAlign: 'center',
                padding: '20px 0',
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.pink} strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M15 9l-6 6M9 9l6 6" />
                  </svg>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 4 }}>Recording Not Available</div>
                <div style={{ fontSize: 12, color: C.sub }}>This call may not have been recorded or the recording has expired.</div>
                <button
                  onClick={load}
                  style={{
                    marginTop: 16,
                    padding: '8px 20px',
                    borderRadius: 8,
                    border: `1px solid ${C.border}`,
                    background: 'transparent',
                    color: C.cyan,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Retry
                </button>
              </div>
            ) : (
              <>
                {/* Waveform / Progress Bar */}
                <div
                  onClick={seek}
                  style={{
                    position: 'relative',
                    height: 48,
                    borderRadius: 8,
                    cursor: state === 'ready' || state === 'playing' || state === 'paused' ? 'pointer' : 'default',
                    overflow: 'hidden',
                    background: C.bg,
                    marginBottom: 16,
                  }}
                >
                  {/* Progress fill */}
                  <div style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${progress}%`,
                    background: `linear-gradient(90deg, ${C.cyan}30, ${C.cyan}50)`,
                    transition: 'width 0.1s linear',
                    borderRadius: 8,
                  }} />
                  {/* Faux waveform bars */}
                  <div style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 2,
                    padding: '0 12px',
                  }}>
                    {Array.from({ length: 50 }, (_, i) => {
                      const h = 8 + Math.sin(i * 0.7) * 12 + Math.cos(i * 1.3) * 8 + Math.sin(i * 2.1) * 4;
                      const played = progress > (i / 50) * 100;
                      return (
                        <div
                          key={i}
                          style={{
                            flex: 1,
                            height: Math.max(4, h),
                            borderRadius: 2,
                            background: played ? C.cyan : C.cyan + '25',
                            transition: 'background 0.15s',
                          }}
                        />
                      );
                    })}
                  </div>
                  {/* Loading overlay */}
                  {state === 'loading' && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: C.bg + 'cc',
                    }}>
                      <div style={{
                        width: 24,
                        height: 24,
                        border: `2px solid ${C.cyan}33`,
                        borderTopColor: C.cyan,
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                      }} />
                    </div>
                  )}
                </div>

                {/* Time display */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  fontFamily: 'monospace',
                  color: C.sub,
                  marginBottom: 20,
                }}>
                  <span>{fmtTime(currentTime)}</span>
                  <span>{duration ? fmtTime(duration) : '--:--'}</span>
                </div>

                {/* Play / Pause / Download buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  {/* Play/Pause */}
                  <button
                    onClick={togglePlay}
                    disabled={state === 'loading' || state === 'idle'}
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      border: 'none',
                      background: state === 'playing' ? C.cyan : `linear-gradient(135deg, ${C.cyan}, ${C.cyan}cc)`,
                      cursor: state === 'loading' ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: `0 4px 20px ${C.cyan}40`,
                      transition: 'transform 0.15s, box-shadow 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                  >
                    {state === 'playing' ? (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="#0A0E1A">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="#0A0E1A">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    )}
                  </button>

                  {/* Download */}
                  <a
                    href={audioUrl + '&download=1'}
                    download={`recording-${sid}.mp3`}
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: '50%',
                      border: `1px solid ${C.border}`,
                      background: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textDecoration: 'none',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = C.cyan; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; }}
                    title="Download MP3"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.sub} strokeWidth="2" strokeLinecap="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                  </a>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: C.sub + '80' }}>
          Call SID: {sid.slice(0, 20)}...
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default function PlayPage() {
  return (
    <Suspense fallback={
      <div style={{ background: '#0A0E1A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#8B92A8', fontSize: 14 }}>Loading player...</div>
      </div>
    }>
      <PlayerInner />
    </Suspense>
  );
}
