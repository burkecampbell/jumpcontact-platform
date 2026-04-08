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

  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const seekFromEvent = (clientX: number) => {
    const audio = audioRef.current;
    const bar = barRef.current;
    if (!audio || !bar || !audio.duration || !isFinite(audio.duration)) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    audio.currentTime = pct * audio.duration;
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => seekFromEvent(e.clientX);

  // Drag-to-seek: mouse down on bar starts tracking, mouse up ends
  const onDragStart = (e: React.MouseEvent<HTMLDivElement>) => {
    setDragging(true);
    seekFromEvent(e.clientX);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => seekFromEvent(e.clientX);
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging]);

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
          <Volume2 size={14} style={{ color: C.bad }} />
        ) : (
          <Play size={14} style={{ color: C.cyan }} />
        )}
      </button>
      {(state === 'playing' || state === 'paused') && (
        <>
          <div
            ref={barRef}
            onMouseDown={onDragStart}
            onTouchStart={(e) => { setDragging(true); seekFromEvent(e.touches[0].clientX); }}
            onTouchMove={(e) => { if (dragging) seekFromEvent(e.touches[0].clientX); }}
            onTouchEnd={() => setDragging(false)}
            className="flex-1 min-w-[100px] h-3 rounded-full overflow-hidden cursor-pointer group relative select-none"
            style={{ background: C.border }}
            title={`${fmtTime(currentTime)} / ${fmtTime(duration)}`}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${progress}%`, background: C.cyan, transition: dragging ? 'none' : 'width 0.1s linear' }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full transition-opacity"
              style={{
                left: `calc(${progress}% - 7px)`,
                background: C.cyan,
                opacity: dragging ? 1 : undefined,
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
