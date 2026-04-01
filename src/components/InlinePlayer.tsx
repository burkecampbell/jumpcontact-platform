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
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

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
    setCurrentTime(0);
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration || !isFinite(audio.duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * audio.duration;
  };

  const fmtTime = (s: number) => {
    if (!isFinite(s) || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setProgress((audio.currentTime / audio.duration) * 100);
        setCurrentTime(audio.currentTime);
        setDuration(audio.duration);
      }
    };
    const onEnd = () => { setState('idle'); setProgress(0); setCurrentTime(0); };
    const onErr = () => setState('error');
    const onMeta = () => {
      if (audio.duration && isFinite(audio.duration)) setDuration(audio.duration);
    };

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('error', onErr);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('durationchange', onMeta);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
      audio.removeEventListener('error', onErr);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('durationchange', onMeta);
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
          <div
            onClick={seek}
            className="w-20 h-2 rounded-full overflow-hidden cursor-pointer group relative"
            style={{ background: C.border }}
            title={`${fmtTime(currentTime)} / ${fmtTime(duration)}`}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, background: C.cyan }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              style={{
                left: `calc(${progress}% - 5px)`,
                background: C.cyan,
                boxShadow: `0 0 6px ${C.cyan}80`,
              }}
            />
          </div>
          <span className="text-[10px] font-mono min-w-[32px]" style={{ color: C.sub }}>
            {fmtTime(currentTime)}
          </span>
          <button onClick={stop} className="p-0.5 rounded hover:bg-white/5">
            <Square size={10} style={{ color: C.sub }} />
          </button>
        </>
      )}
    </div>
  );
}
