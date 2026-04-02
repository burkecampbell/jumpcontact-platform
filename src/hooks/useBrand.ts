'use client';

import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { type Brand, parseBrand, BRAND_ACCENT, BRAND_LABELS, BRAND_FULL_NAMES } from '@/lib/brand';

export interface BrandContext {
  brand: Brand;
  setBrand: (b: Brand) => void;
  accentColor: string;
  label: string;
  fullName: string;
  isJC: boolean;
  isMSC: boolean;
  isMixed: boolean;
  /** Build a URL preserving the brand query param */
  brandHref: (path: string) => string;
}

export function useBrand(): BrandContext {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const brand = parseBrand(searchParams.get('brand'));

  const setBrand = useCallback((b: Brand) => {
    const params = new URLSearchParams(searchParams.toString());
    if (b === 'jc') {
      params.delete('brand'); // clean URL for default
    } else {
      params.set('brand', b);
    }
    const qs = params.toString();
    router.push(pathname + (qs ? '?' + qs : ''), { scroll: false });
  }, [searchParams, pathname, router]);

  const brandHref = useCallback((path: string) => {
    if (brand === 'jc') return path;
    return path + (path.includes('?') ? '&' : '?') + 'brand=' + brand;
  }, [brand]);

  return useMemo(() => ({
    brand,
    setBrand,
    accentColor: BRAND_ACCENT[brand],
    label: BRAND_LABELS[brand],
    fullName: BRAND_FULL_NAMES[brand],
    isJC: brand === 'jc',
    isMSC: brand === 'msc',
    isMixed: brand === 'mixed',
    brandHref,
  }), [brand, setBrand, brandHref]);
}
