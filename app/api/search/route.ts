import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { mockProducts } from "@/mockData";

type Candidate = {
  id: string;
  title: string;
  source: string;
  image: string;
  link: string;
  querySource?: string;
  score?: number;
};

type SelectedCandidate = {
  title?: string;
  source?: string;
  image?: string;
  link?: string;
  querySource?: string;
};

type SearchRequest = {
  query?: string;
  feedback?: "none_match";
  excludedTerms?: string[];
  coreClues?: string[];
  negativeTerms?: string[];
  previousIntent?: Partial<SearchIntent>;
  selectedCandidate?: SelectedCandidate;
};

type SearchIntent = {
  features: string[];
  keywords: string[];
  englishKeywords: string[];
  importantClues: string[];
  excludedTerms: string[];
  searchQueries: string[];
};

type SearchResponse = SearchIntent & {
  candidates: Candidate[];
  message: string;
  isFallback: boolean;
};

type SerpApiImageResult = {
  title?: string;
  original?: string;
  thumbnail?: string;
  source?: string;
  link?: string;
  position?: number;
};

type SerpApiResponse = {
  images_results?: SerpApiImageResult[];
};

const blockedDomains = ["instagram.com", "facebook.com", "threads.net", "pinterest.com"];
const imitationSignals = ["仿", "不是正版", "不是原廠", "類似", "山寨", "平替"];
const autoNegativeKeywords = ["official", "original", "authentic", "LEGO official", "正版", "原廠"];

const fallbackIntent: SearchIntent = {
  features: ["玩具", "可夾取機構", "手持式設計"],
  keywords: ["藍色 夾取 玩具", "手持 夾夾槍"],
  englishKeywords: ["blue grabber toy", "toy claw gun"],
  importantClues: ["夜市", "藍色"],
  excludedTerms: [],
  searchQueries: ["藍色 夾取 玩具 夜市", "blue grabber toy night market"]
};

const isValidHttpUrl = (value?: string): value is string => {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
};

const domainPenalty = (url?: string): number => {
  if (!url || !isValidHttpUrl(url)) return -100;
  const host = new URL(url).hostname.toLowerCase();
  return blockedDomains.some((domain) => host.includes(domain)) ? -30 : 0;
};

const findQuotedClues = (text: string): string[] => {
  const regex = /[「『"]([^「」『』"]+)[」』"]/g;
  const clues: string[] = [];
  let match = regex.exec(text);
  while (match) {
    clues.push(match[1]);
    match = regex.exec(text);
  }
  return Array.from(new Set(clues));
};

const normalizeExcludedTerms = (query: string, excludedTerms: string[]): string[] => {
  const merged = [...excludedTerms];
  const lowerQuery = query.toLowerCase();
  if (imitationSignals.some((signal) => query.includes(signal) || lowerQuery.includes(signal))) {
    merged.push(...autoNegativeKeywords);
  }
  return Array.from(new Set(merged.map((t) => t.trim()).filter(Boolean)));
};

const parseIntent = (raw: string, normalizedExcludedTerms: string[], quotedClues: string[]): SearchIntent => {
  const parsed = JSON.parse(raw) as Partial<SearchIntent>;
  const importantClues = Array.from(new Set([...(parsed.importantClues ?? []), ...quotedClues]));
  return {
    features: Array.isArray(parsed.features) ? parsed.features : fallbackIntent.features,
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : fallbackIntent.keywords,
    englishKeywords: Array.isArray(parsed.englishKeywords) ? parsed.englishKeywords : fallbackIntent.englishKeywords,
    importantClues: importantClues.length ? importantClues : fallbackIntent.importantClues,
    excludedTerms: Array.from(new Set([...(parsed.excludedTerms ?? []), ...normalizedExcludedTerms])),
    searchQueries: Array.isArray(parsed.searchQueries) ? parsed.searchQueries : fallbackIntent.searchQueries
  };
};

const toCandidate = (item: SerpApiImageResult, idx: number, querySource: string): Candidate | null => {
  const image = item.original || item.thumbnail || "";
  const link = item.link || "";
  if (!isValidHttpUrl(link)) return null;

  const positionBonus = Math.max(0, 30 - ((item.position ?? idx + 1) - 1));
  const imageValidity = isValidHttpUrl(image) ? 10 : -20;
  const score = positionBonus + imageValidity + domainPenalty(link) + domainPenalty(image);

  return {
    id: `${querySource}-${idx}`,
    title: item.title || "未命名商品",
    source: item.source || "Unknown Source",
    image,
    link,
    querySource,
    score
  };
};

const fallbackCandidates: Candidate[] = mockProducts.map((p) => ({ id: p.id, title: p.name, source: p.platform, image: p.imageUrl, link: p.url, querySource: "mock", score: 1 }));

const searchSerpApi = async (query: string): Promise<Candidate[]> => {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) return [];

  const params = new URLSearchParams({ engine: "google_images", q: query, api_key: apiKey, hl: "zh-tw", gl: "tw" });
  const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`, { method: "GET", cache: "no-store" });
  if (!response.ok) throw new Error(`SerpAPI request failed: ${response.status}`);

  const data = (await response.json()) as SerpApiResponse;
  return (data.images_results ?? []).map((x, i) => toCandidate(x, i, query)).filter((x): x is Candidate => x !== null);
};

const buildPrompt = (payload: { query: string; body: SearchRequest; excludedTerms: string[]; quotedClues: string[] }) =>
  JSON.stringify(
    {
      originalPrompt: payload.query,
      selectedCandidate: payload.body.selectedCandidate ?? null,
      querySource: payload.body.selectedCandidate?.querySource ?? null,
      coreClues: payload.body.coreClues ?? payload.body.previousIntent?.importantClues ?? [],
      negativeTerms: payload.body.negativeTerms ?? payload.excludedTerms,
      feedback: payload.body.feedback ?? null,
      previousIntent: payload.body.previousIntent ?? null,
      quotedClues: payload.quotedClues,
      instruction: "Preserve semantic intent, narrow product category, avoid generic keyword pollution, strengthen useful clues from selectedCandidate/coreClues, return strict JSON schema fields only."
    },
    null,
    2
  );

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SearchRequest;
    const query = body.query?.trim();
    if (!query) return NextResponse.json({ message: "請輸入描述文字" }, { status: 400 });

    const quotedClues = findQuotedClues(query);
    const normalizedExcludedTerms = normalizeExcludedTerms(query, [...(body.excludedTerms ?? []), ...(body.negativeTerms ?? [])]);

    let intent: SearchIntent = { ...fallbackIntent, importantClues: quotedClues.length ? quotedClues : fallbackIntent.importantClues, excludedTerms: normalizedExcludedTerms };

    if (process.env.OPENAI_API_KEY) {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        temperature: 0.25,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are a shopping refinement optimizer. Return strict JSON only with: features, keywords, englishKeywords, importantClues, excludedTerms, searchQueries." },
          { role: "user", content: buildPrompt({ query, body, excludedTerms: normalizedExcludedTerms, quotedClues }) }
        ]
      });
      const content = completion.choices[0]?.message?.content;
      if (content) intent = parseIntent(content, normalizedExcludedTerms, quotedClues);
    }

    const queryPool = intent.searchQueries.length ? intent.searchQueries.slice(0, 4) : [query];
    let pool: Candidate[] = [];

    if (process.env.SERPAPI_API_KEY) {
      for (const q of queryPool) {
        const found = await searchSerpApi(q);
        pool = [...pool, ...found];
      }
    }

    const deduped = Array.from(new Map(pool.map((c) => [c.link, c])).values());
    const sorted = deduped.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    let candidates = sorted.slice(0, 12);

    // backfill: if top selection has too many invalid-image candidates, prefer lower ranked with valid image urls
    const failedLikely = candidates.filter((c) => !isValidHttpUrl(c.image)).length;
    if (failedLikely >= 6) {
      const validImageBackfill = sorted.filter((c) => isValidHttpUrl(c.image));
      const keepRelevant = candidates.filter((c) => (c.score ?? 0) >= 10);
      candidates = Array.from(new Map([...validImageBackfill.slice(0, 10), ...keepRelevant].map((c) => [c.link, c])).values()).slice(0, 12);
    }

    let isFallback = false;
    let message = "已為你找到候選商品。";
    if (!candidates.length) {
      isFallback = true;
      candidates = fallbackCandidates;
      message = "這次搜尋沒有找到合適結果，請換個描述或加入排除條件。";
    }

    return NextResponse.json({ ...intent, candidates, message, isFallback } satisfies SearchResponse);
  } catch (error) {
    console.error("/api/search error", error);
    return NextResponse.json({ ...fallbackIntent, candidates: fallbackCandidates, message: "這次搜尋沒有找到合適結果，請換個描述或加入排除條件。", isFallback: true } satisfies SearchResponse);
  }
}
