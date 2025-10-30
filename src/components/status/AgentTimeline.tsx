"use client";

import type { AgentStatus, AgentTrace } from "@/lib/types/travel";
import type { SearchPhase } from "@/store/searchStore";

interface AgentTimelineProps {
  trace: AgentTrace[];
  phase: SearchPhase;
}

function statusColor(status: AgentStatus): string {
  switch (status) {
    case "completed":
      return "bg-emerald-400 text-emerald-950";
    case "running":
      return "bg-sky-400 text-sky-950 animate-pulse";
    case "failed":
      return "bg-rose-500 text-rose-50";
    default:
      return "bg-slate-700 text-slate-300";
  }
}

function statusLabel(status: AgentStatus): string {
  switch (status) {
    case "completed":
      return "Done";
    case "running":
      return "Running";
    case "failed":
      return "Failed";
    default:
      return "Queued";
  }
}

export function AgentTimeline({ trace, phase }: AgentTimelineProps) {
  const fallback: AgentTrace[] = [
    { agent: "Coordinator", status: "pending" },
    {
      agent: "LLM Parser",
      status: phase === "searching" ? "running" : "pending",
    },
    { agent: "Flight Agent", status: "pending" },
    { agent: "Hotel Agent", status: "pending" },
  ];
  const orderedTrace = trace.length ? trace : fallback;

  return (
    <section className="rounded-3xl border border-slate-800/40 bg-slate-950/60 p-5 shadow-lg shadow-slate-900/40">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Agent activity
        </h2>
        <span className="text-xs text-slate-500">
          {phase === "searching" ? "In progress" : "Latest run"}
        </span>
      </header>
      <ol className="space-y-3">
        {orderedTrace.map((item) => (
          <li key={item.agent} className="flex items-center gap-3">
            <span
              className={`inline-flex h-9 min-w-[9rem] items-center justify-between rounded-full px-3 text-xs font-semibold uppercase tracking-wide ${statusColor(
                item.status
              )}`}
            >
              {item.agent}
              <span className="text-[10px] text-slate-950/70">
                {statusLabel(item.status)}
              </span>
            </span>
            <div className="flex-1 rounded-full bg-slate-800/60">
              <div
                className={`h-2 rounded-full transition-all ${
                  item.status === "completed"
                    ? "w-full bg-emerald-400"
                    : item.status === "running"
                    ? "w-2/3 bg-sky-400"
                    : item.status === "failed"
                    ? "w-full bg-rose-500"
                    : "w-1/4 bg-slate-700"
                }`}
              />
            </div>
            <div className="min-w-[70px] text-right text-xs text-slate-400">
              {item.elapsedMs ? `${item.elapsedMs} ms` : ""}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
