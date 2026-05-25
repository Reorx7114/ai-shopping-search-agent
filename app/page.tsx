"use client";

import { FormEvent, useMemo, useState } from "react";

type IntentMode = "shopping" | "travel" | "inspiration" | "unsure";
type RefinementType = "local" | "restart";

type Candidate = {
  id: string;
  title: string;
  source: string;
  image: string;
  link: string;
  querySource?: string;
  score?: number;
};

type RefinementAction = { label: string; refinementHint: string; refinementType: RefinementType };
type ParsedIntent = { productType?: string; category?: string; travelPurpose?: string; coreClues?: string[]; negativeTerms?: string[]; inferredMode?: IntentMode; confidence?: number };

type SearchResponse = {
  features: string[]; keywords: string[]; englishKeywords: string[]; importantClues: string[]; excludedTerms: string[]; searchQueries: string[];
  parsedIntent: ParsedIntent; candidates: Candidate[]; message: string; isFallback: boolean; intentMode: IntentMode;
  refinementActions: RefinementAction[]; previousQueries: string[]; previousFailedQueries: string[];
};

const isValidHttpUrl = (value?: string): value is string => {
  if (!value) return false;
  try { const u = new URL(value); return u.protocol === "http:" || u.protocol === "https:"; } catch { return false; }
};

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [intentMode, setIntentMode] = useState<IntentMode>("shopping");
  const [excludedInput, setExcludedInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");
  const [imageLoadStatus, setImageLoadStatus] = useState<Record<string, "loaded" | "failed">>({});

  const parseTerms = (text: string) => text.split(/[，,、]/g).map((t) => t.trim()).filter(Boolean);

  const runSearch = async (payload: Record<string, unknown>) => {
    setLoading(true); setError("");
    try {
      console.log("[search/refine] payload", payload);
      const res = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = (await res.json()) as SearchResponse | { message?: string };
      console.log("[search/refine] response", json);
      if (!res.ok) throw new Error((json as { message?: string }).message || "搜尋失敗");
      setImageLoadStatus({});
      setData(json as SearchResponse);
    } catch (e) {
      console.error("[search/refine] error", e);
      setError("這次搜尋沒有找到合適結果，請換個描述或加入排除條件。");
    } finally { setLoading(false); }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await runSearch({ query, originalPrompt: query, intentMode, excludedTerms: parseTerms(excludedInput), previousQueries: data?.previousQueries ?? [], previousFailedQueries: data?.previousFailedQueries ?? [] });
  };

  const sortedCandidates = useMemo(() => {
    if (!data) return [];
    return [...data.candidates].sort((a, b) => {
      const ab = imageLoadStatus[a.id] === "loaded" ? 15 : imageLoadStatus[a.id] === "failed" ? -20 : 0;
      const bb = imageLoadStatus[b.id] === "loaded" ? 15 : imageLoadStatus[b.id] === "failed" ? -20 : 0;
      return (b.score ?? 0) + bb - ((a.score ?? 0) + ab);
    });
  }, [data, imageLoadStatus]);

  const onRefineByCandidate = async (c: Candidate) => {
    if (!data) return;
    console.log("[refine] selected candidate", c);
    await runSearch({
      query,
      originalPrompt: query,
      intentMode,
      selectedCandidate: c,
      refinementHint: "find more results similar to selected candidate",
      refinementType: "local",
      currentParsedIntent: data.parsedIntent,
      currentCandidates: data.candidates,
      previousQueries: data.previousQueries,
      previousFailedQueries: data.previousFailedQueries,
      excludedTerms: parseTerms(excludedInput)
    });
  };

  const onRefineAction = async (a: RefinementAction) => {
    if (!data) return;
    await runSearch({
      query,
      originalPrompt: query,
      intentMode,
      refinementHint: a.refinementHint,
      refinementType: a.refinementType,
      currentParsedIntent: data.parsedIntent,
      currentCandidates: data.candidates,
      previousQueries: data.previousQueries,
      previousFailedQueries: data.previousFailedQueries,
      excludedTerms: parseTerms(excludedInput)
    });
  };

  return <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-10 sm:px-6">
    <section className="mx-auto flex max-w-3xl flex-col items-center pt-8 sm:pt-16">
      <h1 className="mb-8 text-center text-3xl font-semibold tracking-tight text-slate-800 sm:text-5xl">AI Shopping Search</h1>
      <form className="w-full" onSubmit={onSubmit}>
        <div className="mb-3 flex flex-wrap gap-2">
          {([
            ["shopping", "找商品"], ["travel", "找旅遊"], ["inspiration", "找靈感"], ["unsure", "我不確定"]
          ] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setIntentMode(value)} aria-pressed={intentMode === value} className={`rounded-full border px-3 py-1 text-sm transition ${intentMode === value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}>{label}</button>)}
        </div>
        <div className="rounded-full border border-slate-200 bg-white px-5 py-3 shadow-sm"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="描述你看到的東西…" className="w-full bg-transparent text-base outline-none placeholder:text-slate-400 sm:text-lg" /></div>
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"><input value={excludedInput} onChange={(e) => setExcludedInput(e.target.value)} placeholder="不要出現什麼？例如：正版 LEGO、太貴、塑膠" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 sm:text-base" /></div>
        <div className="mt-4 flex justify-center"><button type="submit" disabled={loading} className="rounded-full bg-slate-900 px-6 py-2 text-sm font-medium text-white disabled:opacity-50">{loading ? "搜尋中..." : "開始搜尋"}</button></div>
      </form>
      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
    </section>

    {data && <section className="mx-auto mt-10 w-full max-w-5xl">
      <div className="mb-6 rounded-2xl border border-slate-200 p-4 sm:p-6"><h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">AI 解析結果</h2>
        <div className="space-y-2 text-sm sm:text-base"><p><span className="font-medium">模式：</span>{data.intentMode}</p><p><span className="font-medium">重要線索：</span>{data.importantClues.join("、") || "無"}</p><p><span className="font-medium">搜尋查詢：</span>{data.searchQueries.join("、")}</p></div>
        <p className={`mt-2 text-xs ${data.isFallback ? "text-amber-600" : "text-slate-500"}`}>{data.message}</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {data.refinementActions.slice(0, 6).map((a) => <button key={`${a.label}-${a.refinementType}`} type="button" onClick={() => onRefineAction(a)} disabled={loading} className="rounded-full border border-slate-300 px-3 py-1 text-sm text-slate-700 disabled:opacity-50">{a.label}</button>)}
      </div>

      <h3 className="mb-4 text-lg font-semibold text-slate-800">候選圖片牆</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sortedCandidates.map((item) => <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
          <img src={isValidHttpUrl(item.image) ? item.image : ""} alt={item.title} className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" onLoad={() => setImageLoadStatus((p) => ({ ...p, [item.id]: "loaded" }))} onError={() => setImageLoadStatus((p) => ({ ...p, [item.id]: "failed" }))} />
          {(imageLoadStatus[item.id] === "failed" || !isValidHttpUrl(item.image)) && <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center bg-slate-100 px-3 text-center text-sm text-slate-500"><span>圖片無法載入</span><span className="mt-1 text-xs text-slate-400">來源可能限制圖片載入</span></div>}
        </div><div className="space-y-2 p-4"><p className="line-clamp-2 min-h-12 font-medium text-slate-800">{item.title}</p><p className="text-sm text-slate-500">{item.source}</p><div className="flex flex-wrap gap-2"><a href={item.link} target="_blank" className="rounded-full border border-slate-300 px-3 py-1 text-sm" rel="noreferrer">查看連結</a><button type="button" onClick={() => onRefineByCandidate(item)} disabled={loading} className="rounded-full bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50">比較像這個</button></div></div></article>)}
      </div>
    </section>}
  </main>;
}
