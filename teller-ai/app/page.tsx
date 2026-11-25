import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";

const capabilities = ["Research", "Writing", "Ideas", "Code"];

export default function HomePage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-neutral-900 text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-25rem] h-[44rem] w-[44rem] -translate-x-1/2 rounded-full bg-sky-400/[0.07] blur-[120px]" />
        <div className="absolute -right-48 top-[28rem] h-[30rem] w-[30rem] rounded-full bg-violet-500/[0.06] blur-[120px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,#171717_78%)]" />
      </div>

      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 sm:px-8">
        <header className="flex items-center justify-between border-b border-white/[0.08] py-5">
          <Link href="/" aria-label="Teller AI home" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-neutral-950 text-lg font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              T
            </span>
            <span className="text-sm font-semibold tracking-[0.18em]">
              TELLER <span className="text-neutral-500">AI</span>
            </span>
          </Link>

          <nav aria-label="Main navigation" className="flex items-center gap-2 sm:gap-5">
            <Link href="/pricing" className="hidden text-sm text-neutral-400 transition hover:text-white sm:block">
              Pricing
            </Link>
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-neutral-950 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-sky-300/30 hover:bg-neutral-800 hover:text-white"
            >
              Open chat
              <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </nav>
        </header>

        <section className="grid flex-1 items-center gap-10 py-14 sm:py-20 lg:grid-cols-[0.95fr_1.05fr] lg:gap-4">
          <div className="relative z-10 mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-sky-300/15 bg-sky-300/[0.06] px-3.5 py-2 text-xs font-medium tracking-wide text-sky-100">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-sky-300" />
              Meet TellerWorkflow™
            </div>

            <h1 className="text-[3.25rem] font-semibold leading-[0.98] tracking-[-0.065em] sm:text-6xl lg:text-7xl">
              Your ideas,
              <span className="mt-2 block bg-gradient-to-r from-white via-neutral-200 to-neutral-500 bg-clip-text text-transparent">
                in a new orbit.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-lg text-base leading-7 text-neutral-400 sm:text-lg sm:leading-8 lg:mx-0">
              A thoughtful AI workspace for exploring questions, shaping ideas, and getting meaningful work moving.
            </p>

            <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center lg:justify-start">
              <Link
                href="/chat"
                className="group inline-flex items-center gap-3 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-neutral-950 shadow-[0_8px_35px_rgba(255,255,255,0.1)] transition hover:-translate-y-0.5 hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300"
              >
                Start a conversation
                <ArrowUpRight
                  aria-hidden="true"
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </Link>
              <span className="text-xs tracking-wide text-neutral-500">A little curiosity goes a long way.</span>
            </div>

            <ul className="mt-10 flex flex-wrap justify-center gap-2 lg:justify-start">
              {capabilities.map((capability) => (
                <li
                  key={capability}
                  className="rounded-full border border-white/[0.08] bg-neutral-950/70 px-3.5 py-1.5 text-xs text-neutral-400"
                >
                  {capability}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative mx-auto flex w-full max-w-[38rem] items-center justify-center py-4 lg:py-0">
            <div
              aria-hidden="true"
              className="absolute aspect-square w-[82%] rounded-full border border-white/[0.07] shadow-[0_0_100px_rgba(125,211,252,0.06)]"
            />
            <div
              aria-hidden="true"
              className="absolute aspect-square w-[66%] rotate-[-24deg] rounded-full border border-dashed border-sky-200/15"
            />
            <div
              aria-hidden="true"
              className="absolute aspect-square w-[50%] rounded-full border border-white/[0.05]"
            />
            <div className="relative w-[88%] overflow-hidden rounded-[2rem] border border-white/10 bg-neutral-950/80 p-2.5 shadow-[0_30px_100px_rgba(0,0,0,0.5)] backdrop-blur-xl sm:w-[82%]">
              <div className="relative overflow-hidden rounded-[1.5rem] bg-neutral-950">
                <Image
                  src="/t-and-jupiter-logo.png"
                  alt="A metallic T emblem alongside Jupiter"
                  width={1536}
                  height={1024}
                  priority
                  className="aspect-[4/3] w-full object-contain"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-transparent to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4 sm:bottom-7 sm:left-7 sm:right-7">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-sky-200/80">
                      A space to think
                    </p>
                    <p className="mt-1 text-lg font-medium tracking-tight text-white sm:text-xl">
                      Find your next bright idea.
                    </p>
                  </div>
                  <span className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-neutral-900/70 text-sky-200 backdrop-blur">
                    <Sparkles aria-hidden="true" className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </div>
            <span
              aria-hidden="true"
              className="absolute right-[5%] top-[15%] h-2 w-2 rounded-full bg-sky-200 shadow-[0_0_18px_4px_rgba(125,211,252,0.35)]"
            />
            <span
              aria-hidden="true"
              className="absolute bottom-[13%] left-[8%] h-1.5 w-1.5 rounded-full bg-white/70 shadow-[0_0_14px_3px_rgba(255,255,255,0.2)]"
            />
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-3 border-t border-white/[0.08] py-5 text-xs text-neutral-500 sm:flex-row">
          <p>Created by <span className="text-neutral-300">Sizwe Zitha</span></p>
          <p className="tracking-wide">TellerWorkflow™ · Clear thinking, better momentum.</p>
        </footer>
      </div>
    </main>
  );
}
