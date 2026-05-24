"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import type { MockProduct } from "@/mockData";

type SearchResponse = {
  intent: {
    features: string[];
    keywords: string[];
    englishKeywords: string[];
    searchQueries?: string[];
  };
  results: MockProduct[];
  warning?: string;
};

export default function HomePage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });

      const result = (await response.json()) as SearchResponse | { error: string };
      if (!response.ok) {
        setError((result as { error: string }).error || "搜尋失敗");
        setData(null);
      } else {
        setData(result as SearchResponse);
      }
    } catch {
      setError("系統忙碌中，請稍後再試。");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-10 sm:px-6">
      <section className="mx-auto flex max-w-3xl flex-col items-center pt-8 sm:pt-16">
        <h1 className="mb-8 text-center text-3xl font-semibold tracking-tight text-slate-800 sm:text-5xl">
          AI Shopping Search
        </h1>

        <form className="w-full" onSubmit={onSubmit}>
          <div className="rounded-full border border-slate-200 bg-white px-5 py-3 shadow-sm transition focus-within:shadow-md">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="描述你看到的東西…"
              className="w-full bg-transparent text-base outline-none placeholder:text-slate-400 sm:text-lg"
            />
          </div>
          <div className="mt-4 flex justify-center">
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-slate-900 px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {loading ? "搜尋中..." : "開始搜尋"}
            </button>
          </div>
        </form>

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
      </section>

      {data && (
        <section className="mx-auto mt-10 w-full max-w-5xl">
          <div className="mb-6 rounded-2xl border border-slate-200 p-4 sm:p-6">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">AI 解析結果</h2>
            <div className="space-y-2 text-sm sm:text-base">
              <p><span className="font-medium">商品特徵：</span>{data.intent.features.join("、")}</p>
              <p><span className="font-medium">搜尋關鍵字：</span>{data.intent.keywords.join("、")}</p>
              <p><span className="font-medium">英文搜尋詞：</span>{data.intent.englishKeywords.join("、")}</p>
            </div>
            {data.intent.searchQueries?.length ? (
              <p><span className="font-medium">搜尋查詢詞：</span>{data.intent.searchQueries.join("、")}</p>
            ) : null}
            {data.warning && <p className="mt-2 text-xs text-amber-600">{data.warning}</p>}
          </div>

          <h3 className="mb-4 text-lg font-semibold text-slate-800">候選圖片牆</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.results.map((item) => (
              <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="relative aspect-[4/3] w-full">
                  <Image src={item.imageUrl} alt={item.name} fill className="object-cover" sizes="(max-width: 640px) 100vw, 33vw"/>
                </div>
                <div className="space-y-2 p-4">
                  <p className="line-clamp-2 font-medium text-slate-800">{item.name}</p>
                  <p className="text-sm text-slate-500">{item.platform}</p>
                  <div className="flex gap-2">
                    <a href={item.url} target="_blank" className="rounded-full border border-slate-300 px-3 py-1 text-sm" rel="noreferrer">查看連結</a>
                    <button className="rounded-full bg-slate-900 px-3 py-1 text-sm text-white">比較像這個</button>
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
