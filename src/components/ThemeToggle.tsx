'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { C } from '@/lib/constants';

export default function ThemeToggle() {
  const [light, setLight] = useState(false);

  // Read from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('jc-theme');
    if (saved === 'light') {
      document.documentElement.classList.add('light');
      setLight(true);
    }
  }, []);

  const toggle = () => {
    const next = !light;
    setLight(next);
    if (next) {
      document.documentElement.classList.add('light');
      localStorage.setItem('jc-theme', 'light');
    } else {
      document.documentElement.classList.remove('light');
      localStorage.setItem('jc-theme', 'dark');
    }
  };

  return (
    <button
      onClick={toggle}
      className="p-1.5 rounded-lg transition-colors border-none cursor-pointer"
      style={{
        background: light ? C.cyanSoft : 'rgba(139,146,168,0.1)',
        color: light ? C.cyan : C.sub,
      }}
      title={light ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      {light ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
}
