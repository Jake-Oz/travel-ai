import { SearchExperience } from "@/components/search/SearchExperience";

export default function Home() {
  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.25),_transparent_55%)]" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-8 sm:py-16">
        <section className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-emerald-200">
            Travel-AI Preview
            <span className="rounded-full bg-emerald-400 px-2 py-[2px] text-[10px] text-emerald-950">
              Orchestrated agents
            </span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-50 sm:text-5xl">
            Plan and book curated journeys with conversational AI
          </h1>
          <p className="max-w-2xl text-base text-slate-300">
            Travel-AI understands complex requests, coordinates flight and accommodation agents, and prepares bookable itineraries with Apple Pay ready checkout.
          </p>
        </section>
        <SearchExperience />
      </main>
    </div>
  );
}
