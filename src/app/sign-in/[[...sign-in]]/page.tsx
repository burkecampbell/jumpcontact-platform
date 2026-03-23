import { SignIn } from '@clerk/nextjs';
import Image from 'next/image';
import { getClerkPageElements, getPageBackground, getSubtitleColor } from '@/lib/theme';

export default function SignInPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 -mt-14"
      style={{ background: getPageBackground() }}
    >
      <Image src="/logo.png" alt="Jump Contact" width={180} height={50} className="mb-8" />
      <SignIn
        appearance={{ elements: getClerkPageElements() }}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
      />
      <p className="mt-6 text-xs" style={{ color: getSubtitleColor() }}>
        Only @jumpcontact.com Google accounts can access this platform.
      </p>
    </div>
  );
}
