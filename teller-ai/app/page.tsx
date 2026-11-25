import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";

const capabilities = ["Write", "Research", "Summarize", "Code", "Plan"];

export default function HomePage() {
  return (
    <main className="relative isolate min-h-screen overflow-hidden bg-[#08090b] text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -left-48 top-20 h-[32rem] w-[32rem] rounded-full bg-sky-500/10 blur-[120px]" />
        <div className="absolute -right-40 top-48 h-[34rem] w-[34rem] rounded-full bg-violet-500/10 blur-[140px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      </div>

      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 sm:px-10">
        <header className="flex items-center justify-between border-b border-white/10 py-6">
          <Link href="/" aria-label="Teller AI home" className="group flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] text-white shadow-inner shadow-white/10">
              <span className="text-lg font-semibold">T</span>
            </span>
            <span className="text-sm font-semibold tracking-[0.2em] text-white">
              TELLER <span className="text-neutral-500">AI</span>
            </span>
          </Link>
          <p className="hidden text-sm text-neutral-500 sm:block">
            Created by <span className="text-neutral-300">Sizwe Zitha</span>
          </p>
        </header>

        <section className="grid flex-1 items-center gap-12 py-16 md:grid-cols-[1.05fr_0.95fr] md:gap-8 md:py-20">
          <div className="relative z-10 mx-auto max-w-2xl text-center md:mx-0 md:text-left">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-xs font-medium tracking-wide text-neutral-300 shadow-lg shadow-black/20">
              <Sparkles aria-hidden="true" className="h-3.5 w-3.5 text-sky-300" />
              Introducing Teller AI
            </div>

            <h1 className="text-5xl font-semibold leading-[1.05] tracking-[-0.055em] sm:text-6xl md:text-7xl">
              Make room for
              <span className="mt-1 block bg-gradient-to-r from-white via-neutral-200 to-neutral-500 bg-clip-text text-transparent">
                your best thinking.
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-neutral-400 sm:text-lg sm:leading-8 md:mx-0">
              Write, research, summarize, code, and plan with an AI assistant
              designed to help ideas move forward.
            </p>

            <div className="mt-8 flex justify-center md:justify-start">
              <Link
                href="/chat"
                className="group inline-flex items-center gap-3 rounded-xl bg-white px-5 py-3.5 text-sm font-semibold text-neutral-950 shadow-[0_8px_35px_rgba(255,255,255,0.12)] transition hover:-translate-y-0.5 hover:bg-neutral-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
              >
                Start chatting
                <ArrowUpRight
                  aria-hidden="true"
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                />
              </Link>
            </div>

            <p className="mt-5 text-xs tracking-wide text-neutral-600">
              Your next idea starts here.
            </p>
          </div>

          <div className="relative mx-auto w-full max-w-2xl">
            <div
              aria-hidden="true"
              className="absolute inset-8 rounded-full bg-sky-300/10 blur-3xl"
            />
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-black/70 p-3 shadow-[0_30px_100px_rgba(0,0,0,0.6)]">
              <div className="absolute inset-3 rounded-[1.5rem] ring-1 ring-inset ring-white/[0.06]" />
              <Image
                src="/t-and-jupiter-logo.png"
                alt="Metallic T emblem beside Jupiter"
                width={1536}
                height={1024}
                className="relative aspect-[4/3] w-full rounded-[1.5rem] object-contain"
              />
              <div className="absolute bottom-7 left-7 flex items-center gap-2 rounded-full border border-white/10 bg-black/60 px-3 py-2 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-400 backdrop-blur-md">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-300 shadow-[0_0_10px_rgba(125,211,252,0.8)]" />
                Teller Workflow
              </div>
            </div>
            <div
              aria-hidden="true"
              className="absolute -right-3 top-1/4 hidden h-16 w-16 rounded-2xl border border-white/10 bg-neutral-900/80 shadow-2xl backdrop-blur sm:block"
            >
              <div className="absolute left-4 top-4 h-2 w-8 rounded-full bg-white/70" />
              <div className="absolute left-4 top-8 h-1.5 w-5 rounded-full bg-sky-300/70" />
              <div className="absolute left-4 top-11 h-1.5 w-7 rounded-full bg-white/20" />
            </div>
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-4 border-t border-white/10 py-6 text-xs text-neutral-500 sm:flex-row">
          <p>Clear thinking. Better momentum.</p>
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-neutral-400">
            {capabilities.map((capability) => (
              <li key={capability}>{capability}</li>
            ))}
          </ul>
        </footer>
      </div>
    </main>
  );
}
