'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Suspense } from 'react';
import { Activity, Phone, Presentation, Trophy } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import BrandToggle from './BrandToggle';

const NAV_ITEMS = [
  { href: '/',        label: 'Live Now',  icon: Activity },
  { href: '/calls',   label: 'Call Log',  icon: Phone },
  { href: '/meeting', label: 'Money Monday', icon: Presentation },
  { href: '/race',    label: 'Race',      icon: Trophy },
] as const;

function NavBarInner({ pulledAt }: { pulledAt?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const brand = searchParams.get('brand');

  // Preserve brand query param across nav links
  const brandSuffix = brand && brand !== 'jc' ? `?brand=${brand}` : '';

  const timeStr = pulledAt
    ? new Date(pulledAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Edmonton' })
    : null;

  // Active accent color from brand
  const accent = brand === 'msc' ? '#5BC5D4' : brand === 'mixed' ? '#a78bfa' : '#3EA5C3';

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl border-b"
         style={{
           background: 'rgba(10,14,26,0.82)',
           borderColor: 'rgba(62,165,195,0.18)',
         }}>
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Logo + Brand Toggle */}
        <div className="flex items-center gap-3 shrink-0">
          <Link href={'/' + brandSuffix} className="flex items-center gap-2">
            <Image src="/logo.png" alt="JC" width={100} height={28} className="h-7 w-auto" />
          </Link>
          <div style={{ width: 1, height: 20, background: 'rgba(62,165,195,0.18)' }} />
          <BrandToggle />
        </div>

        {/* Nav Links */}
        <div className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href + brandSuffix}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors relative"
                style={{
                  color: active ? accent : '#8B92A8',
                }}
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
                {active && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full" style={{ background: accent }} />
                )}
              </Link>
            );
          })}
        </div>

        {/* Right side: time + user */}
        <div className="flex items-center gap-3 shrink-0">
          {timeStr && (
            <span className="text-xs" style={{ color: '#8B92A8' }}>
              Pulled {timeStr}
            </span>
          )}
          <UserButton appearance={{ elements: { avatarBox: 'w-7 h-7' } }} />
        </div>
      </div>
    </nav>
  );
}

export default function NavBar({ pulledAt }: { pulledAt?: string }) {
  return (
    <Suspense fallback={
      <nav className="fixed top-0 left-0 right-0 z-50 h-14 backdrop-blur-xl border-b"
           style={{ background: 'rgba(10,14,26,0.82)', borderColor: 'rgba(62,165,195,0.18)' }} />
    }>
      <NavBarInner pulledAt={pulledAt} />
    </Suspense>
  );
}
