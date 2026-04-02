'use client';

import { useBrand } from '@/hooks/useBrand';
import { BRANDS, BRAND_LABELS, BRAND_ACCENT, type Brand } from '@/lib/brand';
import { C } from '@/lib/constants';

export default function BrandToggle() {
  const { brand, setBrand } = useBrand();

  const activeIdx = BRANDS.indexOf(brand);
  const accent = BRAND_ACCENT[brand];

  return (
    <div
      className="relative flex items-center rounded-lg p-0.5"
      style={{
        background: 'rgba(139,146,168,0.1)',
        border: `1px solid ${C.border}`,
      }}
    >
      {/* Sliding indicator */}
      <div
        className="absolute top-0.5 bottom-0.5 rounded-md transition-all duration-300 ease-out"
        style={{
          width: `calc(${100 / BRANDS.length}% - 2px)`,
          left: `calc(${(activeIdx * 100) / BRANDS.length}% + 1px)`,
          background: accent + '22',
          boxShadow: `0 0 8px ${accent}15`,
        }}
      />

      {BRANDS.map((b) => {
        const isActive = b === brand;
        return (
          <button
            key={b}
            onClick={() => setBrand(b)}
            className="relative z-10 px-3 py-1 text-[11px] font-semibold tracking-wide rounded-md transition-colors duration-200 border-none cursor-pointer"
            style={{
              background: 'transparent',
              color: isActive ? BRAND_ACCENT[b] : C.sub,
              minWidth: '42px',
            }}
          >
            {BRAND_LABELS[b]}
          </button>
        );
      })}
    </div>
  );
}
