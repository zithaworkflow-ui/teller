import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="absolute left-6 top-6 text-left sm:left-10 sm:top-8">
        <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-neutral-400">
          Created by
        </p>
        <p className="mt-1 text-sm font-semibold tracking-[0.08em] text-white">
          Sizwe Zitha
        </p>
        <p className="mt-1 text-xs font-medium tracking-[0.08em] text-neutral-400">
          TellerWorkflow™
        </p>
      </div>
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 rounded-full border border-neutral-700 px-4 py-2 text-sm text-neutral-300">
          Introducing Teller AI
        </div>

        <img
          src="/t-and-jupiter-logo.png"
          alt="T and Jupiter logo"
          className="mb-8 h-48 w-72 object-contain"
        />

        <h1 className="max-w-4xl text-5xl font-bold tracking-tight md:text-7xl">
          Your intelligent AI assistant for work, research, and ideas.
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-neutral-300">
          Teller AI helps you write, research, summarize, code, plan, and answer
          questions faster with a clean AI chat experience.
        </p>

        <div className="mt-4">
          <Link
            href="/chat"
            className="rounded-lg bg-white px-6 py-3 font-semibold text-black"
          >
            Start Chatting
          </Link>
        </div>
      </section>
    </main>
  );
}
