"use client";
import { useCallback, useEffect, useState } from "react";
import Image from "next/image";

type AnyRec = Record<string, unknown>;
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const num = (v: unknown, d = 0): number => (typeof v === "number" ? v : d);
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

async function api(path: string, opts?: { method?: string; body?: unknown }) {
  const res = await fetch(path, {
    method: opts?.method ?? (opts?.body ? "POST" : "GET"),
    headers: { "Content-Type": "application/json" },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = (await res.json()) as AnyRec;
  if (!res.ok) throw new Error(str(data.error, `Request failed (${res.status})`));
  return data;
}

const TABS = ["Today", "Setup", "Research", "Trends", "Ideas", "Scripts", "Studio", "Packaging", "Publish", "Analytics", "Strategy", "Jobs", "Tests", "Settings"] as const;

export default function Dashboard() {
  const [user, setUser] = useState<AnyRec | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [authForm, setAuthForm] = useState({ email: "", password: "", name: "" });
  const [tab, setTab] = useState<(typeof TABS)[number]>("Today");
  const [dash, setDash] = useState<AnyRec | null>(null);
  const [providers, setProviders] = useState<AnyRec | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [channelId, setChannelId] = useState("");
  const [nicheId, setNicheId] = useState("");

  const say = (kind: "ok" | "err", text: string) => setMsg({ kind, text });
  const refresh = useCallback(async (cid?: string) => {
    try {
      const me = await api("/api/v1/content?action=me");
      setUser((me.user as AnyRec) ?? null);
      const pv = await api("/api/v1/ops?action=providers");
      setProviders(pv.providers as AnyRec);
      const d = await api(`/api/v1/ops?action=dashboard${cid ? `&id=${cid}` : ""}`);
      setDash(d);
      if (!d.empty) {
        setChannelId(str((d.channel as AnyRec)?.id));
        setNicheId(str((d.niche as AnyRec)?.id));
      }
    } catch (e) { say("err", e instanceof Error ? e.message : "Load failed"); }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const runBusy = async (label: string, fn: () => Promise<void>) => {
    setBusy(label); setMsg(null);
    try { await fn(); } catch (e) { say("err", e instanceof Error ? e.message : "Failed"); }
    setBusy("");
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-950 text-white"><p className="animate-pulse">Loading Autonomous YouTube AI…</p></div>;

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 text-white grid place-items-center p-6">
        <div className="w-full max-w-md bg-slate-900 rounded-2xl p-8 border border-slate-800">
          <h1 className="text-2xl font-black">🎬 Autonomous YouTube AI</h1>
          <p className="text-slate-400 text-sm mt-1">Niche → Research → Produce → Publish → Learn → Repeat</p>
          <div className="flex gap-2 mt-6">
            {(["login", "signup"] as const).map((m) => (
              <button key={m} onClick={() => setAuthMode(m)} className={`flex-1 py-2 rounded-lg font-bold capitalize ${authMode === m ? "bg-red-600" : "bg-slate-800"}`}>{m}</button>
            ))}
          </div>
          <div className="mt-4 space-y-3">
            {authMode === "signup" && <input className="w-full bg-slate-800 rounded-lg p-3" placeholder="Name" value={authForm.name} onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })} />}
            <input className="w-full bg-slate-800 rounded-lg p-3" placeholder="Email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} />
            <input className="w-full bg-slate-800 rounded-lg p-3" placeholder="Password" type="password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} />
            <button
              className="w-full bg-red-600 py-3 rounded-lg font-bold disabled:opacity-50"
              disabled={busy === "auth"}
              onClick={() => runBusy("auth", async () => {
                const d = await api(`/api/v1/content?action=${authMode}`, { body: authForm });
                setUser(d.user as AnyRec);
                await refresh();
              })}
            >{busy === "auth" ? "…" : authMode === "login" ? "Log in" : "Create account"}</button>
          </div>
          {msg && <p className={`mt-3 text-sm ${msg.kind === "err" ? "text-red-400" : "text-green-400"}`}>{msg.text}</p>}
        </div>
      </div>
    );
  }

  const channel = dash?.channel as AnyRec | undefined;
  const niche = dash?.niche as AnyRec | undefined;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-900/80 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <span className="font-black text-lg">🎬 Autonomous YouTube AI</span>
          {channel && (
            <select value={channelId} onChange={(e) => { setChannelId(e.target.value); void refresh(e.target.value); }} className="bg-slate-800 rounded-lg px-3 py-1.5 text-sm">
              {arr<AnyRec>(dash?.channels).map((c) => <option key={str(c.id)} value={str(c.id)}>{str(c.name)}</option>)}
            </select>
          )}
          {niche && <span className="text-xs bg-red-600/20 text-red-300 px-2 py-1 rounded-full">Niche: {str(niche.primaryNiche)}</span>}
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-400">{str(user.name)} · {str(user.email)}</span>
            <button onClick={() => runBusy("logout", async () => { await api("/api/v1/content?action=logout"); setUser(null); })} className="bg-slate-800 px-3 py-1.5 rounded-lg">Log out</button>
          </div>
        </div>
        <nav className="max-w-7xl mx-auto px-4 pb-2 flex gap-1.5 flex-wrap">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${tab === t ? "bg-red-600 text-white" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>{t}</button>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {msg && <div className={`mb-4 p-3 rounded-lg text-sm ${msg.kind === "err" ? "bg-red-950 text-red-300 border border-red-800" : "bg-green-950 text-green-300 border border-green-800"}`}>{msg.text}</div>}
        {busy && <div className="mb-4 text-sm text-amber-300 animate-pulse">⏳ {busy}…</div>}

        {(!channel || tab === "Setup") && <SetupWizard say={say} runBusy={runBusy} busy={busy} refresh={refresh} showWizard={!channel || tab === "Setup"} channel={channel} />}
        {channel && tab === "Today" && <TodayTab dash={dash} say={say} runBusy={runBusy} busy={busy} refresh={refresh} channelId={channelId} nicheId={nicheId} />}
        {channel && tab === "Research" && <ResearchTab nicheId={nicheId} say={say} runBusy={runBusy} busy={busy} />}
        {channel && tab === "Trends" && <TrendsTab nicheId={nicheId} say={say} runBusy={runBusy} busy={busy} />}
        {channel && tab === "Ideas" && <IdeasTab nicheId={nicheId} say={say} runBusy={runBusy} busy={busy} refresh={() => refresh(channelId)} />}
        {channel && tab === "Scripts" && <ScriptsTab nicheId={nicheId} say={say} runBusy={runBusy} busy={busy} />}
        {channel && tab === "Studio" && <StudioTab nicheId={nicheId} say={say} runBusy={runBusy} busy={busy} />}
        {channel && tab === "Packaging" && <PackagingTab nicheId={nicheId} say={say} runBusy={runBusy} busy={busy} />}
        {channel && tab === "Publish" && <PublishTab nicheId={nicheId} channelId={channelId} say={say} runBusy={runBusy} busy={busy} />}
        {channel && tab === "Analytics" && <AnalyticsTab channelId={channelId} nicheId={nicheId} say={say} runBusy={runBusy} busy={busy} />}
        {channel && tab === "Strategy" && <StrategyTab nicheId={nicheId} say={say} runBusy={runBusy} busy={busy} />}
        {channel && tab === "Jobs" && <JobsTab say={say} runBusy={runBusy} busy={busy} />}
        {channel && tab === "Tests" && <TestsTab say={say} runBusy={runBusy} busy={busy} />}
        {channel && tab === "Settings" && <SettingsTab channelId={channelId} nicheId={nicheId} providers={providers} say={say} runBusy={runBusy} busy={busy} refresh={() => refresh(channelId)} />}
      </main>
    </div>
  );
}

type TabProps = { say: (k: "ok" | "err", t: string) => void; runBusy: (l: string, f: () => Promise<void>) => Promise<void>; busy: string };

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}
function Btn({ onClick, children, disabled, tone = "bg-red-600" }: { onClick: () => void; children: React.ReactNode; disabled?: boolean; tone?: string }) {
  return <button onClick={onClick} disabled={disabled} className={`${tone} px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-50`}>{children}</button>;
}
function Score({ v }: { v: number }) {
  const c = v >= 70 ? "text-green-400" : v >= 45 ? "text-amber-300" : "text-red-400";
  return <span className={`font-black ${c}`}>{v.toFixed(1)}</span>;
}

// ─── Setup wizard ───
function SetupWizard({ say, runBusy, busy, refresh, showWizard, channel }: TabProps & { refresh: () => Promise<void>; showWizard: boolean; channel?: AnyRec }) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState<AnyRec>({
    name: "", youtubeChannelId: "", channelUrl: "", country: "US", language: "en", targetAudience: "",
    primaryNiche: "Football", subNiches: "tactics, transfers", topicsToAvoid: "", competitors: "", preferredFormats: "long-form, short",
    contentType: "both", targetDurationSec: 600, videosPerDay: 1, videosPerWeek: 3, tone: "energetic", voiceStyle: "neutral", editingStyle: "dynamic", visualStyle: "cinematic",
    mode: "manual", autoProduction: false, autoUpload: false, autoPublishing: false, maxCostPerVideo: 5,
  });
  const set = (k: string, v: unknown) => setF({ ...f, [k]: v });
  const inp = "w-full bg-slate-800 rounded-lg p-2.5 text-sm";
  if (!showWizard) return null;
  return (
    <Card title={channel ? "➕ New channel setup wizard" : "🚀 Setup wizard — configure your channel"}>
      <div className="flex gap-2 mb-5 text-xs font-bold">
        {["Channel", "Niche", "Content", "Automation"].map((s, i) => (
          <div key={s} className={`flex-1 text-center py-2 rounded-lg ${step === i ? "bg-red-600" : step > i ? "bg-green-800" : "bg-slate-800"}`}>{i + 1}. {s}</div>
        ))}
      </div>
      {step === 0 && (
        <div className="grid md:grid-cols-2 gap-3">
          <input className={inp} placeholder="Channel name *" value={str(f.name)} onChange={(e) => set("name", e.target.value)} />
          <input className={inp} placeholder="YouTube channel ID (optional)" value={str(f.youtubeChannelId)} onChange={(e) => set("youtubeChannelId", e.target.value)} />
          <input className={inp} placeholder="Channel URL (optional)" value={str(f.channelUrl)} onChange={(e) => set("channelUrl", e.target.value)} />
          <input className={inp} placeholder="Target audience" value={str(f.targetAudience)} onChange={(e) => set("targetAudience", e.target.value)} />
          <input className={inp} placeholder="Country" value={str(f.country)} onChange={(e) => set("country", e.target.value)} />
          <input className={inp} placeholder="Language" value={str(f.language)} onChange={(e) => set("language", e.target.value)} />
        </div>
      )}
      {step === 1 && (
        <div className="grid md:grid-cols-2 gap-3">
          <input className={inp} placeholder="Primary niche *" value={str(f.primaryNiche)} onChange={(e) => set("primaryNiche", e.target.value)} />
          <input className={inp} placeholder="Sub-niches (comma separated)" value={str(f.subNiches)} onChange={(e) => set("subNiches", e.target.value)} />
          <input className={inp} placeholder="Topics to avoid (comma separated)" value={str(f.topicsToAvoid)} onChange={(e) => set("topicsToAvoid", e.target.value)} />
          <input className={inp} placeholder="Competitors (comma separated)" value={str(f.competitors)} onChange={(e) => set("competitors", e.target.value)} />
        </div>
      )}
      {step === 2 && (
        <div className="grid md:grid-cols-2 gap-3">
          <label className="text-sm">Preferred formats (comma)<input className={inp} value={str(f.preferredFormats)} onChange={(e) => set("preferredFormats", e.target.value)} /></label>
          <label className="text-sm">Content type<select className={inp} value={str(f.contentType)} onChange={(e) => set("contentType", e.target.value)}><option value="both">Both</option><option value="short">Shorts</option><option value="long-form">Long-form</option></select></label>
          <label className="text-sm">Target duration (sec)<input type="number" className={inp} value={num(f.targetDurationSec)} onChange={(e) => set("targetDurationSec", Number(e.target.value))} /></label>
          <label className="text-sm">Videos/week<input type="number" className={inp} value={num(f.videosPerWeek)} onChange={(e) => set("videosPerWeek", Number(e.target.value))} /></label>
          <label className="text-sm">Tone<input className={inp} value={str(f.tone)} onChange={(e) => set("tone", e.target.value)} /></label>
          <label className="text-sm">Visual style<input className={inp} value={str(f.visualStyle)} onChange={(e) => set("visualStyle", e.target.value)} /></label>
        </div>
      )}
      {step === 3 && (
        <div className="grid md:grid-cols-2 gap-3 text-sm">
          <label>Mode<select className={inp} value={str(f.mode)} onChange={(e) => set("mode", e.target.value)}><option value="manual">Manual</option><option value="semi">Semi-automatic</option><option value="autopilot">Autopilot</option></select></label>
          <label>Max cost/video ($)<input type="number" step="0.5" className={inp} value={num(f.maxCostPerVideo)} onChange={(e) => set("maxCostPerVideo", Number(e.target.value))} /></label>
          {(["autoProduction", "autoUpload", "autoPublishing"] as const).map((k) => (
            <label key={k} className="flex items-center gap-2 bg-slate-800 rounded-lg p-2.5"><input type="checkbox" checked={Boolean(f[k])} onChange={(e) => set(k, e.target.checked)} /> {k}</label>
          ))}
        </div>
      )}
      <div className="flex justify-between mt-5">
        <Btn onClick={() => setStep(Math.max(0, step - 1))} tone="bg-slate-700" disabled={step === 0}>← Back</Btn>
        {step < 3 ? <Btn onClick={() => setStep(step + 1)}>Next →</Btn> : (
          <Btn onClick={() => runBusy("Creating channel…", async () => {
            const csv = (v: unknown) => str(v).split(",").map((x) => x.trim()).filter(Boolean);
            await api("/api/v1/content?action=setup-wizard", { body: {
              channel: { name: f.name, youtubeChannelId: f.youtubeChannelId, channelUrl: f.channelUrl, country: f.country, language: f.language, targetAudience: f.targetAudience },
              niche: { primaryNiche: f.primaryNiche, subNiches: csv(f.subNiches), topicsToAvoid: csv(f.topicsToAvoid), competitors: csv(f.competitors), preferredFormats: csv(f.preferredFormats), contentType: f.contentType, targetDurationSec: f.targetDurationSec, videosPerDay: f.videosPerDay, videosPerWeek: f.videosPerWeek, tone: f.tone, voiceStyle: f.voiceStyle, editingStyle: f.editingStyle, visualStyle: f.visualStyle },
              automation: { mode: f.mode, autoProduction: f.autoProduction, autoUpload: f.autoUpload, autoPublishing: f.autoPublishing, maxCostPerVideo: f.maxCostPerVideo },
            }});
            say("ok", "Channel created with niche intelligence profile.");
            await refresh();
          })} disabled={busy !== ""}>Finish setup ✓</Btn>
        )}
      </div>
    </Card>
  );
}

// ─── Today ───
function TodayTab({ dash, say, runBusy, busy, refresh, channelId, nicheId }: TabProps & { dash: AnyRec | null; refresh: (cid?: string) => Promise<void>; channelId: string; nicheId: string }) {
  if (!dash || dash.empty) return <Card title="Today"><p className="text-slate-400">No channel yet — complete the Setup wizard.</p></Card>;
  const health = (dash.health as AnyRec) ?? {};
  const strat = dash.strategy as AnyRec | null;
  const pipe = (dash.pipeline as AnyRec) ?? {};
  const memory = (dash.memory as AnyRec) ?? {};
  const ideas = arr<AnyRec>(dash.ideas);
  const topOpportunity = arr<AnyRec>(dash.opportunities)[0];
  const nextAction = str(strat?.recommendation) || (topOpportunity ? `Generate a first draft around "${str(topOpportunity.topic)}".` : "Run Generate Everything to discover the next opportunity.");
  return (
    <div className="space-y-4">
      <Card title="🤖 AI Command Center" right={<Btn onClick={() => runBusy("Generating everything…", async () => { const d = await api("/api/v1/content?action=run-job", { body: { type: "AUTONOMOUS", nicheId, maxVideos: 1 } }); const job = d.job as AnyRec; say(str(job?.status) === "done" ? "ok" : "err", `Command Center ${(job?.status ?? "started")}: ${JSON.stringify(job?.result ?? job?.error ?? "pipeline running").slice(0, 240)}`); await refresh(channelId); })} disabled={busy !== ""}>⚡ Generate Everything</Btn>}>
        <div className="grid md:grid-cols-4 gap-3 text-sm">
          <div className="bg-slate-800 rounded-lg p-3 md:col-span-2"><p className="text-xs uppercase tracking-wide text-slate-400">Recommended next action</p><p className="font-bold text-green-300 mt-1">{nextAction}</p><p className="text-slate-400 mt-2">Confidence: {strat ? num(strat.confidence).toFixed(0) : "not scored"}</p></div>
          <div className="bg-slate-800 rounded-lg p-3"><p className="text-xs uppercase tracking-wide text-slate-400">Today&apos;s best opportunity</p><p className="font-bold mt-1">{str(topOpportunity?.topic, "No opportunity yet")}</p><p className="text-amber-300 mt-2">Score {topOpportunity ? num(topOpportunity.opportunityScore).toFixed(1) : "--"}</p></div>
          <div className="bg-slate-800 rounded-lg p-3"><p className="text-xs uppercase tracking-wide text-slate-400">Channel intelligence</p><p className="font-bold mt-1">{num(memory.successfulTopics ? arr(memory.successfulTopics).length : 0)} learned wins</p><p className="text-slate-400 mt-2">{num(health.samples)} performance samples</p></div>
        </div>
        <div className="mt-3"><p className="text-xs uppercase tracking-wide text-slate-400 mb-2">AI ideas ({ideas.length})</p>{ideas.length ? <div className="grid md:grid-cols-2 gap-x-5">{ideas.slice(0, 20).map((idea, index) => <div key={str(idea.id, String(index))} className="flex justify-between gap-3 py-1.5 border-b border-slate-800"><span className="truncate">{index + 1}. {str(idea.title)}</span><Score v={num(idea.score)} /></div>)}</div> : <p className="text-slate-400">No persisted ideas yet. Generate Everything will research, score, and create them.</p>}</div>
      </Card>
      <div className="grid md:grid-cols-3 gap-4">
        <Card title="📅 Today">
          <p className="text-sm text-slate-300">🔥 {arr(dash.trends).length} trends tracked · 💡 {arr(dash.opportunities).length} opportunities · 🎬 {arr(dash.projects).length} projects</p>
          <p className="text-sm text-slate-300 mt-1">🗓 {arr(dash.calendar).length} scheduled · 📈 {num(health.views).toLocaleString()} views captured</p>
          <div className="flex gap-2 mt-3 flex-wrap">
            <Btn onClick={() => runBusy("Running autonomous cycle…", async () => { const d = await api("/api/v1/content?action=run-job", { body: { type: "AUTONOMOUS", nicheId, maxVideos: 1 } }); say(str((d.job as AnyRec)?.status) === "done" ? "ok" : "err", `Autonomous job ${(d.job as AnyRec)?.status}: ${JSON.stringify((d.job as AnyRec)?.result ?? (d.job as AnyRec)?.error).slice(0, 200)}`); await refresh(channelId); })}>▶ Run autonomous cycle</Btn>
          </div>
        </Card>
        <Card title="❤️ Channel health">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>Views: <b>{num(health.views).toLocaleString()}</b></div>
            <div>Subs gained: <b>{num(health.subs)}</b></div>
            <div>Watch time: <b>{Math.round(num(health.watchTimeSec) / 3600)}h</b></div>
            <div>CTR: <b>{num(health.ctr)}%</b></div>
            <div>Retention: <b>{num(health.retention)}%</b></div>
            <div>Samples: <b>{num(health.samples)}</b></div>
          </div>
        </Card>
        <Card title="🤖 AI recommendation">
          {strat ? (
            <div className="text-sm space-y-1">
              <p className="font-bold text-green-300">{str(strat.recommendation)}</p>
              <p className="text-slate-400">Why now: {str(strat.whyNow)}</p>
              <p className="text-slate-400">Confidence: {num(strat.confidence).toFixed(0)}</p>
            </div>
          ) : <p className="text-sm text-slate-400">No strategy yet — run Research → Trends → Ideas, then generate a strategy.</p>}
        </Card>
      </div>
      <Card title="🔁 Pipeline — Research → Idea → Script → Production → QA → Published → Learning">
        <div className="flex gap-2 flex-wrap text-sm font-bold">
          {[`🔍 Research ${num(pipe.research)}`, `💡 Ideas ${num(pipe.ideas)}`, `📝 Scripts ${num(pipe.scripts)}`, `🎬 Production ${num(pipe.inProduction)}`, `✅ QA ${num(pipe.inQA)}`, `🚀 Published ${num(pipe.published)}`].map((s) => (
            <span key={s} className="bg-slate-800 px-3 py-2 rounded-lg">{s}</span>
          ))}
        </div>
      </Card>
      <div className="grid md:grid-cols-2 gap-4">
        <Card title="🔥 Top opportunities">{arr<AnyRec>(dash.opportunities).map((o) => (
          <div key={str(o.id)} className="text-sm py-1.5 border-b border-slate-800 flex justify-between gap-2"><span>{str(o.topic)}</span><Score v={num(o.opportunityScore)} /></div>
        ))}{arr(dash.opportunities).length === 0 && <p className="text-sm text-slate-400">None yet.</p>}</Card>
        <Card title="📦 Projects">{arr<AnyRec>(dash.projects).slice(0, 8).map((p) => (
          <div key={str(p.id)} className="text-sm py-1.5 border-b border-slate-800 flex justify-between gap-2"><span className="truncate">{str(p.title)}</span><span className="text-slate-400 shrink-0">{str(p.stage)} · {str(p.status)}</span></div>
        ))}{arr(dash.projects).length === 0 && <p className="text-sm text-slate-400">None yet.</p>}</Card>
      </div>
      <Card title="🕒 Recent jobs">{arr<AnyRec>(dash.jobs).map((j) => (
        <div key={str(j.id)} className="text-sm py-1 border-b border-slate-800 flex justify-between"><span>{str(j.type)}</span><span className={str(j.status) === "done" ? "text-green-400" : str(j.status) === "failed" ? "text-red-400" : "text-amber-300"}>{str(j.status)} {num(j.progress)}%</span></div>
      ))}</Card>
    </div>
  );
}

// ─── Research ───
function ResearchTab({ nicheId, say, runBusy, busy }: TabProps & { nicheId: string }) {
  const [data, setData] = useState<AnyRec | null>(null);
  const [profile, setProfile] = useState<AnyRec | null>(null);
  const load = useCallback(async () => {
    const d = await api(`/api/v1/content?action=references&id=${nicheId}`);
    setData(d);
    const n = await api(`/api/v1/content?action=niche&id=${nicheId}`);
    setProfile(n.profile as AnyRec);
  }, [nicheId]);
  useEffect(() => { load().catch((e) => say("err", e.message)); }, [load, say]);
  return (
    <div className="space-y-4">
      <Card title="🧠 Niche intelligence profile" right={<Btn tone="bg-slate-700" onClick={() => runBusy("Refreshing profile…", async () => { await api("/api/v1/content?action=niche-profile-refresh", { body: { nicheId } }); await load(); say("ok", "Profile refreshed from live data."); })}>Refresh from data</Btn>}>
        {profile ? (
          <div className="text-sm space-y-2">
            <p><b>Audience:</b> <span className="text-slate-300">{str(profile.audience)}</span></p>
            <p><b>Subtopics:</b> <span className="text-slate-300">{arr<string>(profile.subtopics).join(", ")}</span></p>
            <p><b>Evergreen:</b> <span className="text-slate-300">{arr<string>(profile.evergreenTopics).join(" · ")}</span></p>
            <p><b>Breaking:</b> <span className="text-red-300">{arr<string>(profile.breakingTopics).join(" · ") || "—"}</span></p>
            <p><b>Content gaps:</b> <span className="text-green-300">{arr<string>(profile.contentGaps).join(" · ") || "—"}</span></p>
            <p><b>Keywords:</b> <span className="text-slate-300">{arr<string>(profile.keywords).join(", ")}</span></p>
            <p><b>Formats:</b> <span className="text-slate-300">{arr<string>(profile.successfulFormats).join(" · ")}</span></p>
            <p><b>Hooks:</b> <span className="text-slate-300">{arr<string>(profile.successfulHooks).join(" · ")}</span></p>
          </div>
        ) : <p className="text-sm text-slate-400">No profile.</p>}
      </Card>
      <Card title="🔍 YouTube research" right={<div className="flex gap-2">
        <Btn tone="bg-slate-700" onClick={() => runBusy("Seeding sample references…", async () => { await api("/api/v1/ops?action=quick-research-seed", { body: { nicheId } }); await load(); say("ok", "Sample references seeded (labeled as seed)."); })}>Seed samples</Btn>
        <Btn onClick={() => runBusy("Researching YouTube…", async () => { const d = await api("/api/v1/content?action=run-job", { body: { type: "RESEARCH", nicheId } }); say(str((d.job as AnyRec)?.status) === "done" ? "ok" : "err", `Research ${(d.job as AnyRec)?.status}`); await load(); })}>Run research</Btn>
      </div>}>
        <div className="space-y-3">
          {arr<AnyRec>(data?.references).map((r) => {
            const a = (r.analysis as AnyRec) ?? {};
            return (
              <div key={str(r.id)} className="bg-slate-800 rounded-lg p-3 text-sm">
                <div className="flex justify-between gap-2 flex-wrap">
                  <b>{str(r.title)}</b>
                  <span className="text-slate-400 shrink-0">{num(r.viewCount).toLocaleString()} views · {Math.round(num(r.viewsPerDay)).toLocaleString()}/day · vel <Score v={num(r.velocityScore)} /></span>
                </div>
                <p className="text-slate-400 text-xs mt-1">{str(r.channelName)} · {(r.publishedAt as string)?.slice(0, 10)} · {Math.round(num(r.durationSec) / 60)} min · 👍 {num(r.likeCount).toLocaleString()} · 💬 {num(r.commentCount).toLocaleString()}</p>
                {Boolean(a.hook) && <p className="text-xs mt-2 text-slate-300"><b>Hook:</b> {str(a.hook)} · <b>Pacing:</b> {str(a.pacing)} · <b>Structure:</b> {arr<string>(a.structure).join(" → ")}</p>}
                {arr<string>(a.whyItWorked).length > 0 && <p className="text-xs mt-1 text-green-300">Why it worked: {arr<string>(a.whyItWorked).join(" / ")}</p>}
              </div>
            );
          })}
          {arr(data?.references).length === 0 && <p className="text-sm text-slate-400">No reference videos yet. Connect YOUTUBE_API_KEY for live research, or seed samples to test the pipeline.</p>}
        </div>
      </Card>
    </div>
  );
}

// ─── Trends ───
function TrendsTab({ nicheId, say, runBusy, busy }: TabProps & { nicheId: string }) {
  const [trends, setTrends] = useState<AnyRec[]>([]);
  const load = useCallback(async () => {
    const d = await api(`/api/v1/content?action=trends&id=${nicheId}`);
    setTrends(arr<AnyRec>(d.trends));
  }, [nicheId]);
  useEffect(() => { load().catch((e) => say("err", e.message)); }, [load, say]);
  return (
    <Card title="📈 Trend engine" right={<Btn onClick={() => runBusy("Detecting trends…", async () => { await api("/api/v1/content?action=run-job", { body: { type: "TREND", nicheId } }); await load(); say("ok", "Trends updated."); })}>Detect trends</Btn>}>
      <div className="space-y-2">
        {trends.map((t) => (
          <div key={str(t.id)} className="bg-slate-800 rounded-lg p-3 text-sm flex justify-between gap-3 flex-wrap">
            <div>
              <b>{str(t.topic)}</b>
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${str(t.classification) === "breaking" ? "bg-red-600" : str(t.classification) === "rising" ? "bg-green-700" : str(t.classification) === "evergreen" ? "bg-blue-700" : "bg-slate-700"}`}>{str(t.classification)}</span>
              <p className="text-xs text-slate-400 mt-1">fresh {num(t.freshness).toFixed(0)} · interest {num(t.audienceInterest).toFixed(0)} · velocity {num(t.velocity).toFixed(0)} · open-lane {num(t.competition).toFixed(0)} · gap {num(t.contentGap).toFixed(0)}</p>
            </div>
            <div className="text-right"><div className="text-xs text-slate-400">TREND SCORE</div><span className="text-2xl"><Score v={num(t.trendScore)} /></span></div>
          </div>
        ))}
        {trends.length === 0 && <p className="text-sm text-slate-400">No trends yet — run Research first, then Detect trends.</p>}
      </div>
    </Card>
  );
}

// ─── Ideas ───
function IdeasTab({ nicheId, say, runBusy, busy, refresh }: TabProps & { nicheId: string; refresh: () => Promise<void> }) {
  const [opps, setOpps] = useState<AnyRec[]>([]);
  const [ideas, setIdeas] = useState<AnyRec[]>([]);
  const load = useCallback(async () => {
    const o = await api(`/api/v1/content?action=opportunities&id=${nicheId}`);
    setOpps(arr<AnyRec>(o.opportunities));
    const i = await api(`/api/v1/content?action=ideas&id=${nicheId}`);
    setIdeas(arr<AnyRec>(i.ideas));
  }, [nicheId]);
  useEffect(() => { load().catch((e) => say("err", e.message)); }, [load, say]);
  return (
    <div className="space-y-4">
      <Card title="🎯 Opportunity engine" right={<Btn onClick={() => runBusy("Generating opportunities + ideas…", async () => { await api("/api/v1/content?action=run-job", { body: { type: "IDEA", nicheId } }); await load(); say("ok", "Opportunities + ideas generated."); })}>Generate</Btn>}>
        {opps.map((o) => (
          <div key={str(o.id)} className="text-sm py-2 border-b border-slate-800 flex justify-between gap-2">
            <span><b>{str(o.topic)}</b> <span className="text-slate-400 text-xs">· demand {num(o.demand).toFixed(0)} · vel {num(o.trendVelocity).toFixed(0)} · fit {num(o.channelFit).toFixed(0)} · gap {num(o.gapScore).toFixed(0)}</span></span>
            <Score v={num(o.opportunityScore)} />
          </div>
        ))}
        {opps.length === 0 && <p className="text-sm text-slate-400">None yet.</p>}
      </Card>
      <Card title="💡 Content ideas (ranked)">
        <div className="space-y-3">
          {ideas.map((c) => (
            <div key={str(c.id)} className="bg-slate-800 rounded-lg p-4 text-sm">
              <div className="flex justify-between gap-2 flex-wrap"><b className="text-base">{str(c.title)}</b><span>Score <Score v={num(c.score)} /> · <span className="text-slate-400">{str(c.status)} · {str(c.format)} · {Math.round(num(c.durationSec) / 60)} min</span></span></div>
              <p className="mt-1 text-slate-300"><b>Hook:</b> {str(c.hook)}</p>
              <p className="text-slate-400"><b>Angle:</b> {str(c.angle)} · <b>Structure:</b> {str(c.narrativeStructure)}</p>
              <p className="text-slate-400"><b>Visual:</b> {str(c.visualConcept)}</p>
              <p className="text-slate-400"><b>Thumbnail:</b> {str(c.thumbnailConcept)}</p>
              <p className="text-green-300"><b>Why:</b> {str(c.whyItMayWork)}</p>
              <p className="text-amber-300"><b>Risks:</b> {str(c.risks)}</p>
              <div className="flex gap-2 mt-2">
                <Btn onClick={() => runBusy("Selecting idea…", async () => { const d = await api("/api/v1/content?action=select-idea", { body: { ideaId: c.id } }); say("ok", `Selected — project ${str(d.projectId).slice(0, 8)} created.`); await load(); })}>Select → project</Btn>
                <Btn tone="bg-slate-700" onClick={() => runBusy("Writing script…", async () => { await api("/api/v1/content?action=run-job", { body: { type: "SCRIPT", ideaId: c.id } }); say("ok", "Script generated — see Scripts tab."); })}>Generate script</Btn>
              </div>
            </div>
          ))}
          {ideas.length === 0 && <p className="text-sm text-slate-400">No ideas yet — generate opportunities first.</p>}
        </div>
      </Card>
    </div>
  );
}

// ─── Scripts ───
function ScriptsTab({ nicheId, say, runBusy, busy }: TabProps & { nicheId: string }) {
  const [scripts, setScripts] = useState<AnyRec[]>([]);
  const [sel, setSel] = useState<AnyRec | null>(null);
  const [facts, setFacts] = useState<AnyRec[]>([]);
  const [edit, setEdit] = useState("");
  const load = useCallback(async () => {
    const d = await api(`/api/v1/content?action=scripts&id=${nicheId}`);
    setScripts(arr<AnyRec>(d.scripts));
  }, [nicheId]);
  useEffect(() => { load().catch((e) => say("err", e.message)); }, [load, say]);
  const openScript = async (id: string) => {
    const d = await api(`/api/v1/content?action=script&id=${id}`);
    setSel(d.script as AnyRec); setFacts(arr<AnyRec>(d.facts)); setEdit(str((d.script as AnyRec)?.body));
  };
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card title="📝 Scripts">
        {scripts.map((sc) => (
          <button key={str(sc.id)} onClick={() => void openScript(str(sc.id))} className="block w-full text-left text-sm py-2 border-b border-slate-800 hover:text-red-300">
            <b>{str(sc.title).slice(0, 60)}</b><br /><span className="text-slate-400 text-xs">{num(sc.wordCount)} words · ~{Math.round(num(sc.estimatedDurationSec) / 60)} min · {str(sc.status)}</span>
          </button>
        ))}
        {scripts.length === 0 && <p className="text-sm text-slate-400">No scripts yet.</p>}
      </Card>
      <div className="md:col-span-2 space-y-4">
        {sel ? (
          <>
            <Card title={`✍️ ${str(sel.title)}`} right={<Btn tone="bg-slate-700" onClick={() => runBusy("Fact-checking…", async () => { await api("/api/v1/content?action=run-job", { body: { type: "FACT_CHECK", scriptId: sel.id } }); await openScript(str(sel.id)); say("ok", "Fact-check complete."); })}>Run fact-check</Btn>}>
              <textarea className="w-full h-80 bg-slate-800 rounded-lg p-3 text-sm font-mono" value={edit} onChange={(e) => setEdit(e.target.value)} />
              <div className="mt-2"><Btn onClick={() => runBusy("Saving…", async () => { await api("/api/v1/content?action=update-script", { body: { scriptId: sel.id, body: edit } }); say("ok", "Script saved."); })}>Save script</Btn></div>
            </Card>
            <Card title="🔎 Fact-check results">
              {facts.map((f) => (
                <div key={str(f.id)} className="text-sm py-2 border-b border-slate-800">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${str(f.status) === "VERIFIED" ? "bg-green-700" : str(f.status) === "LIKELY" ? "bg-blue-700" : str(f.status) === "CONTRADICTED" ? "bg-red-600" : "bg-amber-700"}`}>{str(f.status)} {num(f.confidence).toFixed(0)}%</span>
                  {Boolean(f.isCritical) && <span className="ml-2 text-xs text-red-300 font-bold">CRITICAL</span>}
                  <p className="mt-1">{str(f.claim)}</p>
                  <p className="text-xs text-slate-400">Source: {str(f.source)} {str(f.url) && <a className="text-blue-400 underline" href={str(f.url)} target="_blank" rel="noreferrer">{str(f.url).slice(0, 60)}</a>} · {str(f.notes)}</p>
                </div>
              ))}
              {facts.length === 0 && <p className="text-sm text-slate-400">Not fact-checked yet.</p>}
            </Card>
          </>
        ) : <Card title="Script editor"><p className="text-sm text-slate-400">Select a script to edit, fact-check, and review sources.</p></Card>}
      </div>
    </div>
  );
}

// ─── Studio (projects) ───
function StudioTab({ nicheId, say, runBusy, busy }: TabProps & { nicheId: string }) {
  const [projects, setProjects] = useState<AnyRec[]>([]);
  const [sel, setSel] = useState<AnyRec | null>(null);
  const load = useCallback(async () => {
    const d = await api(`/api/v1/production?action=projects&id=${nicheId}`);
    setProjects(arr<AnyRec>(d.projects));
  }, [nicheId]);
  useEffect(() => { load().catch((e) => say("err", e.message)); }, [load, say]);
  const openProject = async (id: string) => {
    const d = await api(`/api/v1/production?action=project&id=${id}`);
    setSel(d);
  };
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card title="🎬 Video projects">
        {projects.map((p) => (
          <button key={str(p.id)} onClick={() => void openProject(str(p.id))} className="block w-full text-left text-sm py-2 border-b border-slate-800 hover:text-red-300">
            <b>{str(p.title).slice(0, 55)}</b><br /><span className="text-slate-400 text-xs">{str(p.format)} · {str(p.aspectRatio)} · stage {str(p.stage)} · {str(p.status)}</span>
          </button>
        ))}
        {projects.length === 0 && <p className="text-sm text-slate-400">Select an idea to create a project.</p>}
      </Card>
      <div className="md:col-span-2">
        {!sel ? <Card title="Studio"><p className="text-sm text-slate-400">Select a project: storyboard, EDL, assets, voice, render.</p></Card> : (
          <ProjectView data={sel} say={say} runBusy={runBusy} busy={busy} reload={() => openProject(str((sel.project as AnyRec)?.id))} />
        )}
      </div>
    </div>
  );
}

function ProjectView({ data, say, runBusy, busy, reload }: TabProps & { data: AnyRec; reload: () => Promise<void> }) {
  const p = data.project as AnyRec;
  const scenes = arr<AnyRec>(data.scenes);
  const renders = arr<AnyRec>(data.renders);
  const edl = data.edl as AnyRec | null;
  const [uploadFile, setUploadFile] = useState("");
  const [uploadName, setUploadName] = useState("");
  const latest = renders[0] as AnyRec | undefined;
  return (
    <div className="space-y-4">
      <Card title={`🎥 ${str(p.title)}`}>
        <p className="text-xs text-slate-400">{str(p.format)} · {str(p.aspectRatio)} · {str(p.resolution)} · stage {str(p.stage)} · {str(p.status)} · cost ${num(data.totalCost).toFixed(3)}</p>
        <div className="flex gap-2 mt-3 flex-wrap">
          <Btn tone="bg-slate-700" onClick={() => runBusy("Building storyboard+EDL…", async () => { await api("/api/v1/content?action=build-storyboard", { body: { projectId: p.id, scriptId: p.scriptId } }); await reload(); say("ok", "Storyboard + EDL built."); })}>Storyboard + EDL</Btn>
          <Btn tone="bg-slate-700" onClick={() => runBusy("Generating assets…", async () => { await api("/api/v1/content?action=run-job", { body: { type: "ASSET", projectId: p.id } }); await reload(); say("ok", "Assets generated."); })}>Assets</Btn>
          <Btn tone="bg-slate-700" onClick={() => runBusy("Generating voice…", async () => { await api("/api/v1/content?action=run-job", { body: { type: "VOICE", projectId: p.id } }); await reload(); say("ok", "Voice generated."); })}>Voice</Btn>
          <Btn onClick={() => runBusy("Rendering video…", async () => { await api("/api/v1/content?action=run-job", { body: { type: "RENDER", projectId: p.id } }); await reload(); say("ok", "Render finished."); })}>🎞 Render</Btn>
          <Btn tone="bg-green-700" onClick={() => runBusy("Quality gate…", async () => { const d = await api("/api/v1/content?action=run-job", { body: { type: "QUALITY", projectId: p.id } }); await reload(); say("ok", `Gate: ${JSON.stringify((d.job as AnyRec)?.result).slice(0, 300)}`); })}>Quality gate</Btn>
        </div>
        {latest && (
          <div className="mt-3 text-sm bg-slate-800 rounded-lg p-3">
            <b>Latest render:</b> {str(latest.status)} via {str(latest.renderer)} · {num(latest.durationSec).toFixed(1)}s · {(num(latest.fileSize) / 1024 / 1024).toFixed(2)} MB
            <div className="flex gap-3 mt-1">
              {str(latest.outputPath) && <a className="text-blue-400 underline" href={str(latest.outputPath)} target="_blank" rel="noreferrer">⬇ MP4</a>}
              {str(latest.previewHtml) && <a className="text-blue-400 underline" href={str(latest.previewHtml)} target="_blank" rel="noreferrer">▶ Timed preview</a>}
            </div>
            {str(latest.outputPath).endsWith(".mp4") && <video className="mt-2 w-full max-w-lg rounded-lg" controls src={str(latest.outputPath)} />}
          </div>
        )}
      </Card>
      <Card title={`🎞 Storyboard (${scenes.length} scenes, editable)`}>
        <div className="space-y-2 max-h-96 overflow-auto">
          {scenes.map((sc) => (
            <SceneEditor key={str(sc.id)} scene={sc} say={say} runBusy={runBusy} busy={busy} />
          ))}
          {scenes.length === 0 && <p className="text-sm text-slate-400">No storyboard yet — build it after the script exists.</p>}
        </div>
      </Card>
      <div className="grid md:grid-cols-2 gap-4">
        <Card title={`🖼 Assets (${arr(data.assets).length})`}>
          {arr<AnyRec>(data.assets).map((a) => (
            <div key={str(a.id)} className="text-xs py-1 border-b border-slate-800">
              {str(a.kind)} · {str(a.fileName)} · {str(a.license)} · {str(a.rights)} {str(a.storagePath) && <a className="text-blue-400 underline ml-1" href={str(a.storagePath)} target="_blank" rel="noreferrer">open</a>}
            </div>
          ))}
          <div className="mt-2 text-xs space-y-1">
            <p className="text-slate-400">Upload licensed asset:</p>
            <input className="w-full bg-slate-800 rounded p-1.5" placeholder="file name" value={uploadName} onChange={(e) => setUploadName(e.target.value)} />
            <input type="file" className="w-full text-xs" onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setUploadName(f.name);
              const r = new FileReader();
              r.onload = () => setUploadFile(str(r.result).split(",")[1] ?? "");
              r.readAsDataURL(f);
            }} />
            <Btn tone="bg-slate-700" onClick={() => runBusy("Uploading…", async () => { await api("/api/v1/production?action=upload-asset", { body: { projectId: p.id, fileName: uploadName, dataBase64: uploadFile } }); await reload(); say("ok", "Asset uploaded with rights tracked."); })}>Upload</Btn>
          </div>
        </Card>
        <Card title={`🎙 Voice (${arr(data.voiceClips).length} clips)`}>
          {arr<AnyRec>(data.voiceClips).map((v) => (
            <div key={str(v.id)} className="text-xs py-1 border-b border-slate-800">
              {str(v.provider)} · {str(v.voiceName)} · {num(v.durationSec).toFixed(1)}s · {str(v.status)}
              {str(v.audioPath) && <audio className="w-full mt-1" controls src={str(v.audioPath)} />}
            </div>
          ))}
          {arr(data.voiceClips).length === 0 && <p className="text-xs text-slate-400">No voice clips yet.</p>}
        </Card>
      </div>
      {edl && <Card title="📋 Edit Decision List"><pre className="text-xs bg-slate-800 rounded-lg p-3 overflow-auto max-h-64">{JSON.stringify(edl.edl, null, 1).slice(0, 6000)}</pre></Card>}
    </div>
  );
}

function SceneEditor({ scene, say, runBusy, busy }: TabProps & { scene: AnyRec }) {
  const [f, setF] = useState({ narration: str(scene.narration), visual: str(scene.visual), caption: str(scene.caption), textOverlay: str(scene.textOverlay) });
  return (
    <div className="bg-slate-800 rounded-lg p-2 text-xs">
      <b>Scene {num(scene.sceneIndex) + 1}</b> <span className="text-slate-400">{num(scene.startSec).toFixed(1)}s → {num(scene.endSec).toFixed(1)}s · {str(scene.transition)} · 🎵 {str(scene.music)} · 🔊 {str(scene.sfx)}</span>
      <textarea className="w-full bg-slate-900 rounded p-1.5 mt-1" rows={2} value={f.narration} onChange={(e) => setF({ ...f, narration: e.target.value })} />
      <div className="grid grid-cols-3 gap-1 mt-1">
        <input className="bg-slate-900 rounded p-1.5" placeholder="visual" value={f.visual} onChange={(e) => setF({ ...f, visual: e.target.value })} />
        <input className="bg-slate-900 rounded p-1.5" placeholder="caption" value={f.caption} onChange={(e) => setF({ ...f, caption: e.target.value })} />
        <input className="bg-slate-900 rounded p-1.5" placeholder="overlay" value={f.textOverlay} onChange={(e) => setF({ ...f, textOverlay: e.target.value })} />
      </div>
      <button className="mt-1 bg-slate-700 px-2 py-1 rounded text-xs font-bold" onClick={() => runBusy("Saving scene…", async () => { await api("/api/v1/content?action=update-scene", { body: { sceneId: scene.id, ...f } }); say("ok", "Scene saved."); })}>Save scene</button>
    </div>
  );
}

// ─── Packaging ───
function PackagingTab({ nicheId, say, runBusy, busy }: TabProps & { nicheId: string }) {
  const [projects, setProjects] = useState<AnyRec[]>([]);
  const [sel, setSel] = useState<AnyRec | null>(null);
  const load = useCallback(async () => {
    const d = await api(`/api/v1/production?action=projects&id=${nicheId}`);
    setProjects(arr<AnyRec>(d.projects));
  }, [nicheId]);
  useEffect(() => { load().catch((e) => say("err", e.message)); }, [load, say]);
  const open = async (id: string) => setSel(await api(`/api/v1/production?action=project&id=${id}`));
  return (
    <div className="space-y-4">
      <Card title="📦 Select project">
        <div className="flex gap-2 flex-wrap">
          {projects.map((p) => <button key={str(p.id)} onClick={() => void open(str(p.id))} className="bg-slate-800 px-3 py-1.5 rounded-lg text-sm hover:bg-slate-700">{str(p.title).slice(0, 40)}</button>)}
          {projects.length === 0 && <p className="text-sm text-slate-400">No projects.</p>}
        </div>
        {sel && <div className="mt-3"><Btn onClick={() => runBusy("Generating packaging…", async () => { await api("/api/v1/production?action=packaging", { body: { projectId: (sel.project as AnyRec)?.id } }); await open(str((sel.project as AnyRec)?.id)); say("ok", "Titles + thumbnails + SEO generated."); })}>✨ Generate titles + thumbnails + SEO</Btn></div>}
      </Card>
      {sel && (
        <>
          <Card title="🏷 Titles (scored — click to select)">
            {arr<AnyRec>(sel.titles).map((t) => (
              <button key={str(t.id)} onClick={() => runBusy("Selecting title…", async () => { await api("/api/v1/production?action=select-title", { body: { projectId: (sel.project as AnyRec)?.id, titleId: t.id } }); await open(str((sel.project as AnyRec)?.id)); })} className={`block w-full text-left text-sm py-2 border-b border-slate-800 ${t.selected ? "text-green-300 font-bold" : ""}`}>
                {Boolean(t.selected) && "✓ "}{str(t.title)} — <Score v={num(t.totalScore)} /> <span className="text-xs text-slate-400">(cur {num(t.curiosity).toFixed(0)} · clr {num(t.clarity).toFixed(0)} · rel {num(t.relevance).toFixed(0)} · risk {num(t.clickbaitRisk).toFixed(0)})</span>
              </button>
            ))}
          </Card>
          <Card title="🖼 Thumbnails (scored — click to select)">
            <div className="grid md:grid-cols-3 gap-3">
              {arr<AnyRec>(sel.thumbs).map((t) => (
                <button key={str(t.id)} onClick={() => runBusy("Selecting…", async () => { await api("/api/v1/production?action=select-thumbnail", { body: { projectId: (sel.project as AnyRec)?.id, thumbId: t.id } }); await open(str((sel.project as AnyRec)?.id)); })} className={`text-left bg-slate-800 rounded-lg p-2 ${t.selected ? "ring-2 ring-green-500" : ""}`}>
                  {str(t.imagePath) && <Image src={str(t.imagePath)} alt="thumb" width={640} height={360} className="rounded-lg w-full" />}
                  <p className="text-xs mt-1">{str(t.concept)} — <Score v={num(t.totalScore)} /></p>
                </button>
              ))}
            </div>
          </Card>
          <SeoEditor sel={sel} say={say} runBusy={runBusy} busy={busy} reload={() => open(str((sel.project as AnyRec)?.id))} />
        </>
      )}
    </div>
  );
}

function SeoEditor({ sel, say, runBusy, busy, reload }: TabProps & { sel: AnyRec; reload: () => Promise<void> }) {
  const seo = (sel.seo as AnyRec) ?? {};
  const [f, setF] = useState({ title: str(seo.title), description: str(seo.description), categoryId: str(seo.categoryId, "27") });
  useEffect(() => { setF({ title: str(seo.title), description: str(seo.description), categoryId: str(seo.categoryId, "27") }); }, [sel, seo.title, seo.description, seo.categoryId]);
  return (
    <Card title="🔍 SEO / metadata">
      <div className="space-y-2 text-sm">
        <input className="w-full bg-slate-800 rounded-lg p-2" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <textarea className="w-full bg-slate-800 rounded-lg p-2 h-40 font-mono text-xs" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <p className="text-xs text-slate-400">Tags: {arr<string>(seo.tags).join(", ")}</p>
        <p className="text-xs text-slate-400">Hashtags: {arr<string>(seo.hashtags).join(" ")}</p>
        <div className="flex gap-2 items-center">
          <input className="bg-slate-800 rounded-lg p-2 w-32" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} />
          <Btn tone="bg-slate-700" onClick={() => runBusy("Saving SEO…", async () => { await api("/api/v1/production?action=update-seo", { body: { projectId: (sel.project as AnyRec)?.id, ...f } }); await reload(); say("ok", "SEO saved."); })}>Save</Btn>
        </div>
      </div>
    </Card>
  );
}

// ─── Publish ───
function PublishTab({ nicheId, channelId, say, runBusy, busy }: TabProps & { nicheId: string; channelId: string }) {
  const [projects, setProjects] = useState<AnyRec[]>([]);
  const [sel, setSel] = useState<AnyRec | null>(null);
  const [oauth, setOauth] = useState<AnyRec | null>(null);
  const [privacy, setPrivacy] = useState("private");
  const load = useCallback(async () => {
    const d = await api(`/api/v1/production?action=projects&id=${nicheId}`);
    setProjects(arr<AnyRec>(d.projects));
    setOauth(await api(`/api/v1/production?action=oauth-status&id=${channelId}`));
  }, [nicheId, channelId]);
  useEffect(() => { load().catch((e) => say("err", e.message)); }, [load, say]);
  const open = async (id: string) => setSel(await api(`/api/v1/production?action=project&id=${id}`));
  const gates = arr<AnyRec>(sel?.gates);
  const uploads = arr<AnyRec>(sel?.uploads);
  return (
    <div className="space-y-4">
      <Card title="🔑 YouTube connection">
        {!oauth?.configured ? <p className="text-sm text-amber-300">Integration not configured — set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REDIRECT_URI to enable real uploads.</p>
          : oauth?.connected ? <div className="flex gap-2 items-center text-sm"><span className="text-green-300">✓ YouTube connected</span><Btn tone="bg-slate-700" onClick={() => runBusy("Disconnecting…", async () => { await api("/api/v1/production?action=disconnect-oauth", { body: { channelId } }); await load(); })}>Disconnect</Btn></div>
          : <Btn onClick={() => runBusy("Getting OAuth URL…", async () => { const d = await api(`/api/v1/production?action=oauth-url&id=${channelId}`); window.location.href = str(d.url); })}>Connect YouTube</Btn>}
      </Card>
      <Card title="🚀 Publish a project">
        <div className="flex gap-2 flex-wrap mb-3">
          {projects.map((p) => <button key={str(p.id)} onClick={() => void open(str(p.id))} className="bg-slate-800 px-3 py-1.5 rounded-lg text-sm">{str(p.title).slice(0, 40)}</button>)}
        </div>
        {sel && (
          <div className="text-sm space-y-3">
            <div className="bg-slate-800 rounded-lg p-3">
              <b>Quality gates</b>
              {gates.map((g) => (
                <div key={str(g.id)} className="mt-1">
                  <span className={`font-black ${str(g.verdict) === "PASS" ? "text-green-400" : "text-red-400"}`}>{str(g.verdict)}</span>
                  <span className="text-xs text-slate-400 ml-2">facts:{str(g.facts)} orig:{str(g.originality)} rights:{str(g.rights)} policy:{str(g.policyRisk)} audio:{str(g.audio)} video:{str(g.video)} caps:{str(g.captions)} thumb:{str(g.thumbnail)} title:{str(g.title)} meta:{str(g.metadata)}</span>
                  {arr<string>(g.reasons).map((r) => <p key={r} className="text-red-300 text-xs">⛔ {r}</p>)}
                </div>
              ))}
              {gates.length === 0 && <p className="text-slate-400">No gate run yet.</p>}
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <select value={privacy} onChange={(e) => setPrivacy(e.target.value)} className="bg-slate-800 rounded-lg p-2">
                <option value="private">Private</option><option value="unlisted">Unlisted</option><option value="public">Public</option>
              </select>
              <Btn onClick={() => runBusy("Preparing upload…", async () => {
                try {
                  await api("/api/v1/production?action=prepare-upload", { body: { projectId: (sel.project as AnyRec)?.id, privacy } });
                  say("ok", "Upload prepared — quality PASS.");
                } catch (e) { say("err", e instanceof Error ? e.message : "Blocked"); }
                await open(str((sel.project as AnyRec)?.id));
              })}>1. Quality check + prepare</Btn>
              <Btn tone="bg-green-700" onClick={() => runBusy("Uploading to YouTube…", async () => {
                const up = uploads.find((u) => str(u.status) === "prepared") ?? uploads[0];
                if (!up) { say("err", "Prepare the upload first."); return; }
                const d = await api("/api/v1/content?action=run-job", { body: { type: "UPLOAD", uploadId: up.id } });
                say(str((d.job as AnyRec)?.status) === "done" ? "ok" : "err", `Upload ${(d.job as AnyRec)?.status}: ${JSON.stringify((d.job as AnyRec)?.result ?? (d.job as AnyRec)?.error).slice(0, 300)}`);
                await open(str((sel.project as AnyRec)?.id));
              })}>2. Upload to YouTube</Btn>
            </div>
            {uploads.map((u) => (
              <p key={str(u.id)} className="text-xs text-slate-300">Upload {str(u.status)} · {str(u.privacy)} · {num(u.progress)}% {str(u.youtubeVideoId) && <a className="text-blue-400 underline" href={`https://youtu.be/${str(u.youtubeVideoId)}`} target="_blank" rel="noreferrer">youtu.be/{str(u.youtubeVideoId)}</a>} {str(u.lastError) && <span className="text-red-300">· {str(u.lastError).slice(0, 200)}</span>}</p>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Analytics ───
function AnalyticsTab({ channelId, nicheId, say, runBusy, busy }: TabProps & { channelId: string; nicheId: string }) {
  const [data, setData] = useState<AnyRec | null>(null);
  const [projects, setProjects] = useState<AnyRec[]>([]);
  const [pa, setPa] = useState<AnyRec | null>(null);
  const load = useCallback(async () => {
    setData(await api(`/api/v1/ops?action=analytics&id=${channelId}`));
    const d = await api(`/api/v1/production?action=projects&id=${nicheId}`);
    setProjects(arr<AnyRec>(d.projects));
  }, [channelId, nicheId]);
  useEffect(() => { load().catch((e) => say("err", e.message)); }, [load, say]);
  return (
    <div className="space-y-4">
      <Card title="📊 Channel analytics (real collected snapshots)">
        <div className="overflow-auto">
          <table className="text-xs w-full">
            <thead><tr className="text-slate-400 text-left"><th className="p-1">Video</th><th className="p-1">Views</th><th className="p-1">Impr</th><th className="p-1">CTR</th><th className="p-1">Likes</th><th className="p-1">Comments</th><th className="p-1">Subs</th><th className="p-1">Source</th></tr></thead>
            <tbody>
              {arr<AnyRec>(data?.snapshots).map((sn, i) => (
                <tr key={i} className="border-t border-slate-800"><td className="p-1">{str(sn.youtubeVideoId) || str(sn.projectId).slice(0, 8)}</td><td className="p-1">{num(sn.views).toLocaleString()}</td><td className="p-1">{num(sn.impressions).toLocaleString()}</td><td className="p-1">{num(sn.ctr)}%</td><td className="p-1">{num(sn.likes)}</td><td className="p-1">{num(sn.comments)}</td><td className="p-1">{num(sn.subsGained)}</td><td className="p-1">{str(sn.source)}</td></tr>
              ))}
            </tbody>
          </table>
          {arr(data?.snapshots).length === 0 && <p className="text-sm text-slate-400 mt-2">No snapshots yet. Publish a video, then collect analytics. No fake numbers are shown here.</p>}
        </div>
      </Card>
      <Card title="🔬 Video autopsy">
        <div className="flex gap-2 flex-wrap mb-3">
          {projects.map((p) => <button key={str(p.id)} onClick={() => runBusy("Loading…", async () => {
            const d = await api("/api/v1/content?action=run-job", { body: { type: "ANALYTICS", projectId: p.id } });
            setPa(await api(`/api/v1/ops?action=project-analytics&id=${str(p.id)}`));
            say("ok", `Analytics job ${(d.job as AnyRec)?.status}`);
          })} className="bg-slate-800 px-3 py-1.5 rounded-lg text-sm">Collect: {str(p.title).slice(0, 30)}</button>)}
        </div>
        {pa && (pa.performance as AnyRec | null) && (
          <div className="text-sm space-y-2">
            <p className="text-green-300"><b>WHAT WORKED:</b> {arr<string>((pa.performance as AnyRec).whatWorked).join(" / ")}</p>
            <p className="text-red-300"><b>WHAT FAILED:</b> {arr<string>((pa.performance as AnyRec).whatFailed).join(" / ")}</p>
            <p className="text-amber-300"><b>NEXT ACTIONS:</b> {arr<string>((pa.performance as AnyRec).nextActions).join(" / ")}</p>
          </div>
        )}
        {pa && !(pa.performance as AnyRec | null) && <Btn onClick={() => say("err", "No snapshot with data — autopsy needs real analytics first.")}>Generate autopsy</Btn>}
        <AutopsyRunner projects={projects} say={say} runBusy={runBusy} busy={busy} setPa={setPa} />
      </Card>
    </div>
  );
}

function AutopsyRunner({ projects, say, runBusy, busy, setPa }: TabProps & { projects: AnyRec[]; setPa: (v: AnyRec) => void }) {
  const [pid, setPid] = useState("");
  return (
    <div className="flex gap-2 mt-3 flex-wrap">
      <select value={pid} onChange={(e) => setPid(e.target.value)} className="bg-slate-800 rounded-lg p-2 text-sm">
        <option value="">Select project…</option>
        {projects.map((p) => <option key={str(p.id)} value={str(p.id)}>{str(p.title).slice(0, 50)}</option>)}
      </select>
      <Btn tone="bg-slate-700" onClick={() => runBusy("Autopsy…", async () => {
        if (!pid) { say("err", "Select a project."); return; }
        const d = await api("/api/v1/ops?action=autopsy", { body: { projectId: pid } });
        setPa(await api(`/api/v1/ops?action=project-analytics&id=${pid}`));
        say("ok", `Autopsy done — outperformed=${str((d as AnyRec).outperformed)}; channel memory updated.`);
      })}>Generate autopsy + update memory</Btn>
    </div>
  );
}

// ─── Strategy ───
function StrategyTab({ nicheId, say, runBusy, busy }: TabProps & { nicheId: string }) {
  const [strats, setStrats] = useState<AnyRec[]>([]);
  const [cal, setCal] = useState<AnyRec[]>([]);
  const [mem, setMem] = useState<AnyRec | null>(null);
  const load = useCallback(async () => {
    const s = await api(`/api/v1/content?action=strategies&id=${nicheId}`);
    setStrats(arr<AnyRec>(s.strategies));
    const c = await api(`/api/v1/content?action=calendar&id=${nicheId}`);
    setCal(arr<AnyRec>(c.calendar));
    const n = await api(`/api/v1/content?action=niche&id=${nicheId}`);
    setMem(n as AnyRec);
  }, [nicheId]);
  useEffect(() => { load().catch((e) => say("err", e.message)); }, [load, say]);
  const latest = strats[0];
  return (
    <div className="space-y-4">
      <Card title="🧭 Strategy agent — WHAT SHOULD THIS CHANNEL MAKE NEXT?" right={<Btn onClick={() => runBusy("Strategizing…", async () => { await api("/api/v1/content?action=strategy", { body: { nicheId } }); await load(); say("ok", "Strategy generated."); })}>Ask agent</Btn>}>
        {latest ? (
          <div className="text-sm space-y-1.5">
            <p className="text-lg font-bold text-green-300">{str(latest.recommendation)}</p>
            <p><b>WHY NOW?</b> {str(latest.whyNow)}</p>
            <p><b>WHY THIS TOPIC?</b> {str(latest.whyTopic)}</p>
            <p><b>WHY THIS FORMAT?</b> {str(latest.whyFormat)}</p>
            <p><b>WHY THIS HOOK?</b> {str(latest.whyHook)}</p>
            <p><b>WHY THIS LENGTH?</b> {str(latest.whyLength)}</p>
            <p className="text-slate-400">Plan: {str(latest.plannedTopic)} · {str(latest.plannedFormat)} · {str(latest.plannedHook)} · {Math.round(num(latest.plannedLengthSec) / 60)} min · confidence {num(latest.confidence).toFixed(0)}</p>
          </div>
        ) : <p className="text-sm text-slate-400">No strategy yet.</p>}
      </Card>
      <Card title="🗓 Content calendar" right={<Btn tone="bg-slate-700" onClick={() => runBusy("Planning…", async () => { await api("/api/v1/content?action=plan-calendar", { body: { nicheId, weeks: 2 } }); await load(); say("ok", "Calendar planned."); })}>Auto-plan 2 weeks</Btn>}>
        {cal.map((c) => (
          <div key={str(c.id)} className="text-sm py-1.5 border-b border-slate-800 flex justify-between gap-2 flex-wrap">
            <span><b>{(c.scheduledDate as string)?.slice(0, 10)}</b> · {str(c.topic)} <span className="text-slate-400">({str(c.format)} — {str(c.status)})</span></span>
          </div>
        ))}
        {cal.length === 0 && <p className="text-sm text-slate-400">Empty — auto-plan from opportunities.</p>}
      </Card>
    </div>
  );
}

// ─── Jobs ───
function JobsTab({ say, runBusy, busy }: TabProps) {
  const [jobs, setJobs] = useState<AnyRec[]>([]);
  const [sel, setSel] = useState<AnyRec | null>(null);
  const load = useCallback(async () => {
    const d = await api("/api/v1/ops?action=jobs");
    setJobs(arr<AnyRec>(d.jobs));
  }, []);
  useEffect(() => { load().catch((e) => say("err", e.message)); const t = setInterval(load, 5000); return () => clearInterval(t); }, [load, say]);
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="⚙️ Jobs" right={<Btn tone="bg-slate-700" onClick={() => void load()}>Refresh</Btn>}>
        {jobs.map((j) => (
          <button key={str(j.id)} onClick={() => setSel(j)} className="block w-full text-left text-sm py-1.5 border-b border-slate-800">
            <span className="font-bold">{str(j.type)}</span> <span className={str(j.status) === "done" ? "text-green-400" : str(j.status) === "failed" ? "text-red-400" : "text-amber-300"}>{str(j.status)} {num(j.progress)}%</span>
            <span className="text-slate-500 text-xs ml-2">{(j.createdAt as string)?.slice(0, 19).replace("T", " ")} · retries {num(j.retryCount)}</span>
          </button>
        ))}
        {jobs.length === 0 && <p className="text-sm text-slate-400">No jobs yet.</p>}
      </Card>
      <Card title="📜 Job detail">
        {!sel ? <p className="text-sm text-slate-400">Select a job.</p> : (
          <div className="text-sm space-y-2">
            <p><b>{str(sel.type)}</b> — {str(sel.status)} ({num(sel.progress)}%)</p>
            {str(sel.error) && <p className="text-red-300">Error: {str(sel.error)}</p>}
            <pre className="bg-slate-800 rounded-lg p-2 text-xs overflow-auto max-h-64">{arr<string>(sel.logs).join("\n") || "No logs."}</pre>
            <pre className="bg-slate-800 rounded-lg p-2 text-xs overflow-auto max-h-32">result: {JSON.stringify(sel.result, null, 1)}</pre>
            {(str(sel.status) === "failed" || str(sel.status) === "queued") && (
              <Btn onClick={() => runBusy("Retrying…", async () => { await api("/api/v1/ops?action=retry-job", { body: { jobId: sel.id } }); await load(); say("ok", "Job retried."); })}>Retry job</Btn>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Tests ───
function TestsTab({ say, runBusy, busy }: TabProps) {
  const [e2e, setE2e] = useState<AnyRec | null>(null);
  const [drill, setDrill] = useState<AnyRec[]>([]);
  return (
    <div className="space-y-4">
      <Card title="🧪 Critical end-to-end test — Niche = Football" right={<Btn onClick={() => runBusy("Running E2E pipeline…", async () => {
        const d = await api("/api/v1/ops?action=e2e");
        setE2e(d);
        say(Boolean(d.pass) ? "ok" : "err", (d as AnyRec).pass ? "E2E PIPELINE: ALL CHECKS PASSED" : "E2E PIPELINE: SOME CHECKS FAILED");
      })}>Run E2E test</Btn>}>
        {!e2e ? <p className="text-sm text-slate-400">Runs the full pipeline: niche → profile → research → trends → opportunities → ideas → script → facts → originality → storyboard → assets → voice → EDL → render → packaging → quality → upload-prep → analytics → autopsy → memory → strategy.</p> : (
          <div className="space-y-1 text-sm">
            <p className={`font-black ${(e2e as AnyRec).pass ? "text-green-400" : "text-red-400"}`}>{(e2e as AnyRec).pass ? "✓ ALL CHECKS PASSED" : "✗ FAILURES PRESENT"}</p>
            {arr<AnyRec>((e2e as AnyRec).checks).map((c) => (
              <div key={str(c.name)} className="flex justify-between gap-2 border-b border-slate-800 py-1">
                <span>{c.pass ? "✓" : "✗"} <b>{str(c.name)}</b></span><span className="text-slate-400 text-xs">{str(c.detail).slice(0, 120)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Card title="🔥 Failure drill" right={<Btn tone="bg-slate-700" onClick={() => runBusy("Running drill…", async () => { const d = await api("/api/v1/ops?action=failure-drill"); setDrill(arr<AnyRec>(d.drills)); say("ok", "Drill complete."); })}>Run drill</Btn>}>
        {drill.map((r) => (
          <div key={str(r.name)} className="text-sm py-1 border-b border-slate-800"><span className={r.handled ? "text-green-400" : "text-red-400"}>{r.handled ? "✓" : "✗"}</span> <b>{str(r.name)}</b> — <span className="text-slate-400">{str(r.detail)}</span></div>
        ))}
        {drill.length === 0 && <p className="text-sm text-slate-400">Tests missing keys, OAuth, quota, job retry, render fallback, quality blocking.</p>}
      </Card>
    </div>
  );
}

// ─── Settings ───
function SettingsTab({ channelId, nicheId, providers, say, runBusy, busy, refresh }: TabProps & { channelId: string; nicheId: string; providers: AnyRec | null; refresh: () => Promise<void> }) {
  const [auto, setAuto] = useState<AnyRec | null>(null);
  const [costs, setCosts] = useState<AnyRec | null>(null);
  const [quota, setQuota] = useState<AnyRec | null>(null);
  const load = useCallback(async () => {
    const c = await api(`/api/v1/content?action=channel&id=${channelId}`);
    setAuto((c.automation as AnyRec) ?? null);
    setCosts(await api("/api/v1/ops?action=costs"));
    setQuota(await api("/api/v1/ops?action=quota"));
  }, [channelId]);
  useEffect(() => { load().catch((e) => say("err", e.message)); }, [load, say]);
  const save = (patch: AnyRec) => runBusy("Saving…", async () => { await api("/api/v1/content?action=automation", { body: { channelId, ...patch } }); await load(); say("ok", "Automation saved."); });
  return (
    <div className="space-y-4">
      <Card title="🔌 Provider integrations">
        {providers ? Object.entries(providers).map(([k, v]) => {
          const p = v as AnyRec;
          return (
            <div key={k} className="text-sm py-2 border-b border-slate-800 flex justify-between gap-2 flex-wrap">
              <span><b>{k}</b> <span className="text-slate-400">({str(p.name)})</span><br /><span className="text-xs text-slate-400">{str(p.detail)}</span></span>
              <span className={`text-xs font-bold px-2 py-1 rounded-full h-fit ${str(p.status) === "ready" ? "bg-green-800" : "bg-amber-800"}`}>{str(p.status) === "ready" ? "✓ READY" : "⚠ NOT CONFIGURED"}</span>
            </div>
          );
        }) : <p className="text-sm text-slate-400">Loading…</p>}
        <p className="text-xs text-slate-500 mt-2">Env vars: YOUTUBE_API_KEY · YOUTUBE_CLIENT_ID · YOUTUBE_CLIENT_SECRET · YOUTUBE_REDIRECT_URI · LLM_API_KEY (+LLM_BASE_URL, LLM_MODEL) · TTS_API_KEY · IMAGE_API_KEY · TAVILY_API_KEY</p>
      </Card>
      <Card title="🤖 Automation mode & gates">
        {auto ? (
          <div className="text-sm space-y-2">
            <div className="flex gap-2 items-center">Mode:
              <select value={str(auto.mode)} onChange={(e) => save({ mode: e.target.value })} className="bg-slate-800 rounded-lg p-2">
                <option value="manual">Manual</option><option value="semi">Semi-automatic</option><option value="autopilot">Autopilot</option>
              </select>
            </div>
            <div className="grid md:grid-cols-4 gap-2">
              {(["autoResearch", "autoIdeas", "autoScript", "autoProduction", "autoUpload", "autoPublishing", "autoAnalytics", "autoStrategy"] as const).map((k) => (
                <label key={k} className="bg-slate-800 rounded-lg p-2 flex items-center gap-2 text-xs"><input type="checkbox" checked={Boolean(auto[k])} onChange={(e) => save({ [k]: e.target.checked })} /> {k}</label>
              ))}
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <span>Max $/video:</span><input type="number" step="0.5" defaultValue={num(auto.maxCostPerVideo)} onBlur={(e) => save({ maxCostPerVideo: Number(e.target.value) })} className="bg-slate-800 rounded-lg p-1.5 w-24" />
              <span>Max/week:</span><input type="number" defaultValue={num(auto.maxVideosPerWeek)} onBlur={(e) => save({ maxVideosPerWeek: Number(e.target.value) })} className="bg-slate-800 rounded-lg p-1.5 w-20" />
            </div>
          </div>
        ) : <p className="text-sm text-slate-400">No automation settings.</p>}
      </Card>
      <div className="grid md:grid-cols-2 gap-4">
        <Card title={`💰 Costs (total $${num(costs?.total).toFixed(4)})`}>
          <div className="max-h-64 overflow-auto">
            {arr<AnyRec>(costs?.costs).slice(0, 30).map((c, i) => (
              <div key={i} className="text-xs py-1 border-b border-slate-800">{str(c.category)} · ${num(c.amountUsd).toFixed(4)} · {str(c.detail).slice(0, 60)}</div>
            ))}
          </div>
        </Card>
        <Card title="📊 YouTube quota">
          <p className="text-sm">Today: <b>{num((quota?.quota as AnyRec)?.used)} / {num((quota?.quota as AnyRec)?.limit, 10000)}</b> units</p>
          <p className="text-xs text-slate-400 mt-1">Search costs ~100 units; the app throttles automatically when the daily limit is near.</p>
        </Card>
      </div>
    </div>
  );
}
