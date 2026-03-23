'use client';

import { useEffect, useState, useRef } from 'react';
import { C } from '@/lib/constants';
import { Play, Pause, Square, Volume2 } from 'lucide-react';

/**
 * Inline audio player for Twilio call recordings.
 * Shared between CallsPage and LiveNowPage.
 */
export default function InlinePlayer({ callSid, recordingUrl }: { callSid: string; recordingUrl: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused' | 'error'>('idle');
  const [progress, setProgress] = useState(0);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (state === 'idle' || state === 'error') {
      setState('loading');
      audio.src = recordingUrl;
      audio.load();
      audio.play().then(() => setState('playing')).catch(() => setState('error'));
    } else if (state === 'playing') {
      audio.pause();
      setState('paused');
    } else if (state === 'paused') {
      audio.play().then(() => setState('playing')).catch(() => setState('error'));
    }
  };

  const stop = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    setState('idle');
    setProgress(0);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      if (audio.duration) setProgress((audio.currentTime / audio.duration) * 100);
    };
    const onEnd = () => { setState('idle'); setProgress(0); };
    const onErr = () => setState('error');

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('error', onErr);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
      audio.removeEventListener('error', onErr);
    };
  }, []);

  return (
    <div className="flex items-center gap-1.5">
      <audio ref={audioRef} preload="none" />
      <button
        onClick={toggle}
        className="p-1 rounded-md transition-colors hover:bg-white/5"
        title={state === 'playing' ? 'Pause' : 'Play recording'}
      >
        {state === 'loading' ? (
          <div className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: C.cyan, borderTopColor: 'transparent' }} />
        ) : state === 'playing' ? (
          <Pause size={14} style={{ color: C.cyan }} />
        ) : state === 'error' ? (
          <Volume2 size={14} style={{ color: '#f87171' }} />
        ) : (
          <Play size={14} style={{ color: C.cyan }} />
        )}
      </button>
      {(state === 'playing' || state === 'paused') && (
        <>
          <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: C.border }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: C.cyan }} />
          </div>
          <button onClick={stop} className="p-0.5 rounded hover:bg-white/5">
            <Square size={10} style={{ color: C.sub }} />
          </button>
        </>
      )}
    </div>
  );
}
