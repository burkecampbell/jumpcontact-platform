'use client';

import { useDraggable } from '@/hooks/useDraggable';
import { C } from '@/lib/constants';

interface DraggableCardProps {
  children: React.ReactNode;
  initialX?: number;
  initialY?: number;
  snapBack?: boolean;
  className?: string;
  width?: number;
  zIndex?: number;
}

export default function DraggableCard({
  children,
  initialX = 0,
  initialY = 0,
  snapBack = false,
  className = '',
  width,
  zIndex = 1,
}: DraggableCardProps) {
  const { state, handlers } = useDraggable({
    initialX,
    initialY,
    snapBack,
    baseZIndex: zIndex,
    stiffness: 290,
    damping: 24,
    liftScale: 1.04,
  });

  return (
    <div
      {...handlers}
      className={`select-none touch-none ${className}`}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`,
        zIndex: state.zIndex,
        width: width || undefined,
        cursor: state.isDragging ? 'grabbing' : 'grab',
        willChange: 'transform',
        // Glass card styling
        background: state.isDragging
          ? 'rgba(20,24,36,0.88)'
          : C.card,
        borderRadius: '16px',
        border: `1px solid ${state.isDragging ? C.cyanHover : C.border}`,
        padding: '20px',
        boxShadow: state.isDragging
          ? '0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(62,165,195,0.2)'
          : '0 4px 20px rgba(0,0,0,0.2)',
        transition: 'box-shadow 0.2s, border-color 0.2s, background 0.2s',
      }}
    >
      {children}
    </div>
  );
}
