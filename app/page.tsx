"use client";

import { FormEvent, useMemo, useState } from "react";

type Candidate = {
  id: string;
  title: string;
  source: string;
  image: string;
  link: string;
  querySource?: string;
  score?: number;
};

type SearchResponse = {
  features: string[];
  keywords: string[];
  englishKeywords: string[];
  importantClues: string[];
  excludedTerms: string[];
  searchQueries: string[];
  candidates: Candidate[];
  message: string;
  isFallback: boolean;
};

type SearchPayload = {
  query: string;
  excludedTerms: string[];
  negativeTerms: string[];
  coreClues: string[];
  feedback?: "none_match";
  previousIntent?: Pick<
    SearchResponse,
    "features" | "keywords" | "englishKeywords" | "importantClues" | "excludedTerms" | "searchQueries"
  >;
  selectedCandidate?: {
    title: string;
    source: string;
    link: string;
    image: string;
    querySource?: string;
  };
};

const isValidHttpUrl = (value?: string): value is string => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

function CandidateImage({ src, alt }: { src?: string; alt: string }) {
  const [broken, setBroken] = useState(!isValidHttpUrl(src));

  if (broken || !src) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-slate-100 px-3 text-center text-sm text-slate-500">
        <span>圖片無法載入</span>
        <span className="mt-1 text-xs text-slate-400">來源可能限制圖片載入</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className="h-full w-full object-cover"
      loading="lazy"
      onError={() => setBroken(true)}
      referrerPolicy="no-referrer"
    />
  );
}

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [excludedInput, setExcludedInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");
  const [imageLoadStatus, setImageLoadStatus] = useState<Record<string, "loaded" | "failed">>({});

  const parseTerms = (text: string) =>
    text
      .split(/[，,、]/g)
      .map((term) => term.trim())
      .filter(Boolean);

  const runSearch = async (payload: SearchPayload) => {
    setError("");
    setLoading(true);

    try {
      console.log("[search] payload", payload);
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const result = (await response.json()) as SearchResponse | { message?: string };
      console.log("[search] response", result);

      if (!response.ok) {
        setError((result as { message?: string }).message || "這次搜尋沒有找到合適結果，請換個描述或加入排除條件。");
        return;
      }

      setImageLoadStatus({});
      setData(result as SearchResponse);
    } catch (err) {
      console.error("[search] error", err);
      setError("這次搜尋沒有找到合適結果，請換個描述或加入排除條件。");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await runSearch({ query, excludedTerms: parseTerms(excludedInput), negativeTerms: parseTerms(excludedInput), coreClues: data?.importantClues ?? [] });
  };

  const previousIntent = useMemo(
    () =>
      data
        ? {
            features: data.features,
            keywords: data.keywords,
            englishKeywords: data.englishKeywords,
            importantClues: data.importantClues,
            excludedTerms: data.excludedTerms,
            searchQueries: data.searchQueries
          }
        : undefined,
    [data]
  );

  const sortedCandidates = useMemo(() => {
    if (!data) return [];
    return [...data.candidates].sort((a, b) => {
      const aStatus = imageLoadStatus[a.id];
      const bStatus = imageLoadStatus[b.id];
      const aBoost = aStatus === "loaded" ? 25 : aStatus === "failed" ? -25 : 0;
      const bBoost = bStatus === "loaded" ? 25 : bStatus === "failed" ? -25 : 0;
      return (b.score ?? 0) + bBoost - ((a.score ?? 0) + aBoost);
    });
  }, [data, imageLoadStatus]);

  const onRefineByCandidate = async (candidate: Candidate) => {
    if (!previousIntent) return;
    console.log("[refine] selected candidate", candidate);

    const payload: SearchPayload = {
      query,
      excludedTerms: parseTerms(excludedInput),
      negativeTerms: parseTerms(excludedInput),
      coreClues: previousIntent.importantClues,
      selectedCandidate: {
        title: candidate.title,
        source: candidate.source,
        link: candidate.link,
        image: candidate.image,
        querySource: candidate.querySource
      },
      previousIntent
    };

    console.log("[refine] payload", payload);
    await runSearch(payload);
  };

  const onNoneMatch = async () => {
    if (!previousIntent) return;

    await runSearch({
      query,
      excludedTerms: parseTerms(excludedInput),
      negativeTerms: parseTerms(excludedInput),
      coreClues: previousIntent.importantClues,
      feedback: "none_match",
      previousIntent
    });
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-10 sm:px-6">
      <section className="mx-auto flex max-w-3xl flex-col items-center pt-8 sm:pt-16">
        <h1 className="mb-8 text-center text-3xl font-semibold tracking-tight text-slate-800 sm:text-5xl">AI Shopping Search</h1>
        <form className="w-full" onSubmit={onSubmit}>
          <div className="rounded-full border border-slate-200 bg-white px-5 py-3 shadow-sm transition focus-within:shadow-md">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="描述你看到的東西…" className="w-full bg-transparent text-base outline-none placeholder:text-slate-400 sm:text-lg" />
          </div>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
            <input value={excludedInput} onChange={(event) => setExcludedInput(event.target.value)} placeholder="不要出現什麼？例如：正版 LEGO、太貴、塑膠" className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 sm:text-base" />
          </div>
          <div className="mt-4 flex justify-center">
            <button type="submit" disabled={loading} className="rounded-full bg-slate-900 px-6 py-2 text-sm font-medium text-white disabled:opacity-50">{loading ? "搜尋中..." : "開始搜尋"}</button>
          </div>
        </form>
        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
      </section>

      {data && (
        <section className="mx-auto mt-10 w-full max-w-5xl">
          <div className="mb-6 rounded-2xl border border-slate-200 p-4 sm:p-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">AI 解析結果</h2>
            <div className="space-y-2 text-sm sm:text-base">
              <p><span className="font-medium">商品特徵：</span>{data.features.join("、")}</p>
              <p><span className="font-medium">搜尋關鍵字：</span>{data.keywords.join("、")}</p>
              <p><span className="font-medium">英文搜尋詞：</span>{data.englishKeywords.join("、")}</p>
              <p><span className="font-medium">重要線索：</span>{data.importantClues.join("、") || "無"}</p>
              <p><span className="font-medium">排除條件：</span>{data.excludedTerms.join("、") || "無"}</p>
              <p><span className="font-medium">搜尋查詢：</span>{data.searchQueries.join("、")}</p>
            </div>
            <p className={`mt-2 text-xs ${data.isFallback ? "text-amber-600" : "text-slate-500"}`}>{data.message}</p>
          </div>

          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-lg font-semibold text-slate-800">候選圖片牆</h3>
            <button type="button" onClick={onNoneMatch} disabled={loading} className="rounded-full border border-slate-300 px-4 py-1.5 text-sm text-slate-700 disabled:opacity-50">這些都不像</button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sortedCandidates.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100">
                  <img
                    src={isValidHttpUrl(item.image) ? item.image : ""}
                    alt={item.title}
                    className="h-full w-full object-cover"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onLoad={() => setImageLoadStatus((prev) => ({ ...prev, [item.id]: "loaded" }))}
                    onError={() => setImageLoadStatus((prev) => ({ ...prev, [item.id]: "failed" }))}
                  />
                  {(imageLoadStatus[item.id] === "failed" || !isValidHttpUrl(item.image)) && (
                    <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center bg-slate-100 px-3 text-center text-sm text-slate-500">
                      <span>圖片無法載入</span>
                      <span className="mt-1 text-xs text-slate-400">來源可能限制圖片載入</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <p className="line-clamp-2 min-h-12 font-medium text-slate-800">{item.title}</p>
                  <p className="text-sm text-slate-500">{item.source}</p>
                  <a href={item.link} target="_blank" className="line-clamp-1 text-xs text-slate-500 underline" rel="noreferrer">{item.link}</a>
                  <div className="flex flex-wrap gap-2">
                    <a href={item.link} target="_blank" className="rounded-full border border-slate-300 px-3 py-1 text-sm" rel="noreferrer">查看連結</a>
                    <button type="button" onClick={() => onRefineByCandidate(item)} disabled={loading} className="rounded-full bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-50">比較像這個</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
