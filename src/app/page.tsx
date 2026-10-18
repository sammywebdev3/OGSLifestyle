import { Logo } from '@/components/brand/Logo';
import { IsoSkyline } from '@/components/brand/IsoSkyline';
import { ButtonLink } from '@/components/ui/Button';
import { LandingCta } from '@/components/landing/LandingCta';

const FEATURES = [
  { icon: '🏠', title: 'Start in Kuto', text: 'Your first self-contain, a phone with a cracked screen, and ₦50,000 to your name.' },
  { icon: '🗺️', title: 'Walk the Gateway', text: 'Explore an isometric Abeokuta neighbourhood — bukas, POS kiosks, okada parks and more.' },
  { icon: '💼', title: 'Hustle & grow', text: 'Jobs, businesses, property and cars are coming — in a world shared with other players.' },
];

export default function LandingPage() {
  return (
    <main className="min-h-dvh overflow-hidden bg-adire-900 bg-adire-dots text-cream [background-size:22px_22px]">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <nav className="flex gap-2">
          <ButtonLink href="/login" variant="ghost" className="px-3 py-2 text-sm">Sign in</ButtonLink>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-8 px-4 pb-10 pt-4 sm:px-6 md:grid-cols-2 md:pt-10">
        <div>
          <p className="mb-3 inline-block rounded-full bg-palm-500/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-palm-300">Gateway State · Early prototype</p>
          <h1 className="font-display text-4xl font-black leading-[1.05] sm:text-6xl">
            Build your life in <span className="text-palm-500">Ogun State</span>.
          </h1>
          <p className="mt-4 max-w-md text-lg text-cream/80">
            A colourful 2.5D life simulation. Make your character, step out of your starter apartment in Kuto, and start your hustle in Abeokuta.
          </p>
          <LandingCta />
        </div>
        <div className="relative">
          <div className="absolute inset-8 rounded-full bg-ogun-500/25 blur-3xl" aria-hidden="true" />
          <IsoSkyline className="relative w-full drop-shadow-2xl" />
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-16 sm:px-6 md:grid-cols-3">
        {FEATURES.map((f) => (
          <article key={f.title} className="rounded-3xl bg-white/5 p-5 ring-1 ring-white/10">
            <div className="text-3xl" aria-hidden="true">{f.icon}</div>
            <h2 className="mt-2 font-display text-lg font-extrabold">{f.title}</h2>
            <p className="mt-1 text-sm text-cream/75">{f.text}</p>
          </article>
        ))}
      </section>

      <footer className="border-t border-white/10 py-6 text-center text-xs text-cream/50">
        OGUN STATE LIFESTYLE · an original game set in Ogun State, Nigeria · virtual money only, no real-world value
      </footer>
    </main>
  );
}
