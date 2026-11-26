import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import metallicTEmblem from "../Futuristic Metallic T Emblem.png";

const capabilities = ["Research", "Writing", "Ideas", "Code"];

export default function HomePage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#050914] text-white">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-25rem] h-[52rem] w-[52rem] -translate-x-1/2 rounded-full bg-blue-500/[0.18] blur-[140px]" />
        <div className="absolute -left-48 top-[38rem] h-[32rem] w-[32rem] rounded-full bg-cyan-500/[0.08] blur-[140px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_12%,#050914_76%)]" />
      </div>

      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-5 sm:px-8">
        <header className="flex items-center justify-between border-b border-white/[0.09] py-5">
          <Link href="/" aria-label="Teller home" className="flex items-center gap-3">
            <Image
              src={metallicTEmblem}
              alt=""
              priority
              className="h-10 w-10 rounded-full object-cover drop-shadow-[0_0_16px_rgba(59,130,246,0.3)]"
            />
            <span className="text-sm font-semibold tracking-[0.18em]">TELLER</span>
          </Link>

          <nav aria-label="Main navigation" className="flex items-center gap-3 sm:gap-6">
            <Link href="/pricing" className="px-2 py-2 text-sm text-slate-300 transition hover:text-white">
              Pricing
            </Link>
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 rounded-full border border-blue-200/20 bg-blue-300/[0.08] px-4 py-2 text-sm font-medium text-blue-50 transition hover:border-blue-200/40 hover:bg-blue-300/[0.14]"
            >
              Open chat
              <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </nav>
        </header>

        <section className="flex flex-1 flex-col items-center pt-16 text-center sm:pt-20 lg:pt-24">
          <h1 className="mt-7 max-w-5xl text-[3.4rem] font-medium leading-[0.98] tracking-[-0.075em] sm:text-7xl lg:text-[6.5rem]">
            Think further.
            <span className="mt-2 block bg-gradient-to-r from-blue-100 via-sky-300 to-blue-500 bg-clip-text text-transparent">
              Make it happen.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg sm:leading-8">
            A thoughtful AI workspace for exploring questions, shaping ideas, and getting meaningful work moving.
          </p>

          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row">
            <Link
              href="/chat"
              className="group inline-flex items-center gap-3 rounded-full bg-blue-100 px-6 py-3.5 text-sm font-semibold text-[#071225] shadow-[0_8px_40px_rgba(59,130,246,0.28)] transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sky-300"
            >
              Start a conversation
              <ArrowUpRight
                aria-hidden="true"
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              />
            </Link>
            <span className="text-xs tracking-wide text-slate-400">A little curiosity goes a long way.</span>
          </div>

          <div className="relative mx-auto mt-14 w-full max-w-4xl sm:mt-16">
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 aspect-square w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-200/[0.09] shadow-[0_0_120px_rgba(37,99,235,0.16)]"
            />
            <div
              aria-hidden="true"
              className="absolute left-1/2 top-1/2 aspect-square w-[62%] -translate-x-1/2 -translate-y-1/2 rotate-[-24deg] rounded-full border border-dashed border-sky-200/15"
            />
            <div className="relative overflow-hidden rounded-[1.75rem] border border-blue-100/15 bg-[#071225]/80 p-2 shadow-[0_32px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl sm:rounded-[2rem] sm:p-3">
              <div className="relative overflow-hidden rounded-[1.25rem] bg-[#050914] sm:rounded-[1.5rem]">
                <Image
                  src={metallicTEmblem}
                  alt="A futuristic metallic T emblem"
                  width={1536}
                  height={1024}
                  priority
                  className="aspect-[3/2] w-full object-contain"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#050914]/80 via-transparent to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4 text-left sm:bottom-7 sm:left-7 sm:right-7">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-sky-200/85">
                      A space to think
                    </p>
                    <p className="mt-1 text-lg font-medium tracking-tight text-white sm:text-xl">
                      Find your next bright idea.
                    </p>
                  </div>
                  <span className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blue-100/20 bg-blue-950/70 text-sky-200 backdrop-blur">
                    <Sparkles aria-hidden="true" className="h-4 w-4" />
                  </span>
                </div>
              </div>
            </div>
            <span
              aria-hidden="true"
              className="absolute right-[5%] top-[15%] h-2 w-2 rounded-full bg-sky-200 shadow-[0_0_18px_4px_rgba(125,211,252,0.45)]"
            />
            <span
              aria-hidden="true"
              className="absolute bottom-[13%] left-[8%] h-1.5 w-1.5 rounded-full bg-blue-100/80 shadow-[0_0_14px_3px_rgba(147,197,253,0.3)]"
            />
          </div>

          <ul aria-label="Teller capabilities" className="mt-8 flex flex-wrap justify-center gap-2 pb-14">
            {capabilities.map((capability) => (
              <li
                key={capability}
                className="rounded-full border border-blue-100/[0.12] bg-blue-950/30 px-3.5 py-1.5 text-xs text-slate-300"
              >
                {capability}
              </li>
            ))}
          </ul>
        </section>

        <footer className="flex flex-col items-center justify-between gap-3 border-t border-white/[0.09] py-5 text-xs text-slate-400 sm:flex-row">
          <p>Created by <span className="text-slate-200">Sizwe Zitha</span></p>
          <p className="tracking-wide">SpaceflightTellerSI builds AI</p>
        </footer>
      </div>
    </main>
  );
}
