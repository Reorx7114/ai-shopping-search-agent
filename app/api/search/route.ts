import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { mockProducts } from "@/mockData";

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

type RefinementAction = {
  label: string;
  refinementHint: string;
  refinementType: RefinementType;
};

type ParsedIntent = {
  productType?: string;
  category?: string;
  travelPurpose?: string;
  coreClues?: string[];
  negativeTerms?: string[];
  inferredMode?: IntentMode;
  confidence?: number;
};

type SearchIntent = {
  features: string[];
  keywords: string[];
  englishKeywords: string[];
  importantClues: string[];
  excludedTerms: string[];
  searchQueries: string[];
  parsedIntent: ParsedIntent;
};

type SearchRequest = {
  query?: string;
  intentMode?: IntentMode;
  excludedTerms?: string[];
  feedback?: "none_match";
  selectedCandidate?: Candidate;
  previousQueries?: string[];
  previousFailedQueries?: string[];
  refinementHint?: string;
  refinementType?: RefinementType;
  originalPrompt?: string;
  currentParsedIntent?: ParsedIntent;
  currentCandidates?: Candidate[];
};

type SearchResponse = SearchIntent & {
  candidates: Candidate[];
  message: string;
  isFallback: boolean;
  intentMode: IntentMode;
  refinementActions: RefinementAction[];
  previousQueries: string[];
  previousFailedQueries: string[];
};

type SerpApiImageResult = { title?: string; original?: string; thumbnail?: string; source?: string; link?: string; position?: number };

type SerpApiResponse = { images_results?: SerpApiImageResult[] };

const blockedDomains = ["instagram.com", "facebook.com", "threads.net", "pinterest.com"];

const isValidHttpUrl = (value?: string): value is string => {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
};

const hostname = (url?: string) => (isValidHttpUrl(url) ? new URL(url).hostname.toLowerCase() : "");

const classifyPenalty = (mode: IntentMode, url?: string): number => {
  const h = hostname(url);
  if (!h) return -50;
  const isBlocked = blockedDomains.some((d) => h.includes(d));
  if (mode === "inspiration") return isBlocked ? -8 : 4;
  if (mode === "travel") {
    if (h.includes("booking") || h.includes("agoda") || h.includes("trip") || h.includes("google")) return 10;
    if (h.includes("wikipedia") || h.includes("blog")) return -8;
    return isBlocked ? -20 : 2;
  }
  if (mode === "shopping" || mode === "unsure") {
    if (h.includes("shopee") || h.includes("momo") || h.includes("pchome") || h.includes("amazon")) return 10;
    if (h.includes("wikipedia") || h.includes("blog")) return -12;
    return isBlocked ? -24 : 2;
  }
  return 0;
};

const fallbackCandidates: Candidate[] = mockProducts.map((m) => ({ id: m.id, title: m.name, source: m.platform, image: m.imageUrl, link: m.url, querySource: "mock", score: 1 }));

const fallbackIntent: SearchIntent = {
  features: ["商品搜尋"], keywords: ["候選商品"], englishKeywords: ["shopping candidates"], importantClues: [], excludedTerms: [],
  searchQueries: ["shopping toy"], parsedIntent: { productType: "unknown", category: "general", coreClues: [], negativeTerms: [] }
};

const getActions = (mode: IntentMode, parsed: ParsedIntent): RefinementAction[] => {
  if (mode === "travel") return [
    { label: "交通方便", refinementHint: "near transport", refinementType: "local" },
    { label: "更便宜", refinementHint: "lower budget", refinementType: "local" },
    { label: "更安靜", refinementHint: "quieter area", refinementType: "local" },
    { label: "附近要有吃的", refinementHint: "near food options", refinementType: "local" },
    { label: "換住宿區域", refinementHint: "change area", refinementType: "restart" }
  ];
  if (mode === "inspiration") return [
    { label: "更可愛", refinementHint: "more cute", refinementType: "local" },
    { label: "更高級", refinementHint: "more premium", refinementType: "local" },
    { label: "更復古", refinementHint: "more vintage", refinementType: "local" },
    { label: "更極簡", refinementHint: "more minimal", refinementType: "local" },
    { label: "換風格", refinementHint: "change style direction", refinementType: "restart" }
  ];
  const category = `${parsed.category ?? ""} ${parsed.productType ?? ""}`.toLowerCase();
  if (category.includes("fashion") || category.includes("accessory")) return [
    { label: "更可愛", refinementHint: "more cute", refinementType: "local" },
    { label: "更簡約", refinementHint: "more minimalist", refinementType: "local" },
    { label: "更韓系", refinementHint: "more korean style", refinementType: "local" },
    { label: "更正式", refinementHint: "more formal", refinementType: "local" },
    { label: "換方向", refinementHint: "change direction", refinementType: "restart" }
  ];
  return [
    { label: "更便宜", refinementHint: "cheaper", refinementType: "local" },
    { label: "更高級", refinementHint: "more premium", refinementType: "local" },
    { label: "更有質感", refinementHint: "better texture quality", refinementType: "local" },
    { label: "更接近這個", refinementHint: "closer to current branch", refinementType: "local" },
    { label: "不要這種", refinementHint: "avoid current direction", refinementType: "restart" },
    { label: "換方向", refinementHint: "change direction", refinementType: "restart" }
  ].slice(0, 6);
};

const parseIntent = (raw: string): SearchIntent => {
  const p = JSON.parse(raw) as Partial<SearchIntent>;
  return {
    features: p.features ?? fallbackIntent.features,
    keywords: p.keywords ?? fallbackIntent.keywords,
    englishKeywords: p.englishKeywords ?? fallbackIntent.englishKeywords,
    importantClues: p.importantClues ?? [],
    excludedTerms: p.excludedTerms ?? [],
    searchQueries: p.searchQueries ?? fallbackIntent.searchQueries,
    parsedIntent: p.parsedIntent ?? fallbackIntent.parsedIntent
  };
};

const searchSerp = async (q: string, mode: IntentMode): Promise<Candidate[]> => {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) return [];
  const params = new URLSearchParams({ engine: "google_images", q, api_key: key, hl: "zh-tw", gl: "tw" });
  const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`serp ${res.status}`);
  const data = (await res.json()) as SerpApiResponse;
  return (data.images_results ?? []).map((r, i) => {
    const image = r.original || r.thumbnail || "";
    const link = r.link || "";
    if (!isValidHttpUrl(link)) return null;
    const score = Math.max(0, 40 - i) + (isValidHttpUrl(image) ? 10 : -20) + classifyPenalty(mode, link) + classifyPenalty(mode, image);
    return { id: `${q}-${i}`, title: r.title || "未命名", source: r.source || "Unknown", image, link, querySource: q, score };
  }).filter((x): x is Candidate => !!x);
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SearchRequest;
    const query = body.query?.trim();
    if (!query) return NextResponse.json({ message: "請輸入描述文字" }, { status: 400 });

    const intentMode = body.intentMode ?? "unsure";
    const originalPrompt = body.originalPrompt || query;

    const basePrompt = {
      intentMode,
      originalPrompt,
      currentQuery: query,
      refinementHint: body.refinementHint ?? null,
      refinementType: body.refinementType ?? null,
      selectedCandidate: body.selectedCandidate ?? null,
      currentParsedIntent: body.currentParsedIntent ?? null,
      currentCandidates: body.currentCandidates?.slice(0, 8) ?? [],
      previousQueries: body.previousQueries ?? [],
      previousFailedQueries: body.previousFailedQueries ?? [],
      excludedTerms: body.excludedTerms ?? [],
      feedback: body.feedback ?? null,
      instructions: {
        local: "Preserve branch direction/category/core clues and generate narrower queries.",
        restart: "Keep original prompt and important clues, avoid previous failed queries, reconstruct direction with extra negative terms.",
        shopping: "prioritize commercial/product pages",
        travel: "prioritize booking/map/hotel/location relevance",
        inspiration: "prioritize visual style references",
        unsure: "infer mode and confidence"
      }
    };

    let intent = fallbackIntent;
    if (process.env.OPENAI_API_KEY) {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        temperature: 0.25,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return strict JSON with keys: features, keywords, englishKeywords, importantClues, excludedTerms, searchQueries, parsedIntent{productType,category,travelPurpose,coreClues,negativeTerms,inferredMode,confidence}." },
          { role: "user", content: JSON.stringify(basePrompt) }
        ]
      });
      const content = completion.choices[0]?.message?.content;
      if (content) intent = parseIntent(content);
    }

    const inferred = intent.parsedIntent.inferredMode;
    const effectiveMode: IntentMode = intentMode === "unsure" && inferred ? inferred : intentMode;

    const queryPool = (intent.searchQueries.length ? intent.searchQueries : [query]).slice(0, 5);
    let pool: Candidate[] = [];
    for (const q of queryPool) {
      const found = await searchSerp(q, effectiveMode);
      pool = [...pool, ...found];
    }

    const prevFailed = body.previousFailedQueries ?? [];
    if (body.refinementType === "restart") {
      const failSet = new Set(prevFailed);
      pool = pool.filter((c) => !failSet.has(c.querySource || ""));
    }

    const dedup = Array.from(new Map(pool.map((p) => [p.link, p])).values()).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    let candidates = dedup.slice(0, 12);
    const tooManyLikelyBadImages = candidates.filter((c) => !isValidHttpUrl(c.image)).length >= 6;
    if (tooManyLikelyBadImages) {
      const good = dedup.filter((c) => isValidHttpUrl(c.image));
      const relevant = candidates.filter((c) => (c.score ?? 0) >= 10);
      candidates = Array.from(new Map([...good.slice(0, 10), ...relevant].map((c) => [c.link, c])).values()).slice(0, 12);
    }

    const isFallback = candidates.length === 0;
    const finalCandidates = isFallback ? fallbackCandidates : candidates;
    const message = isFallback ? "這次搜尋沒有找到合適結果，請換個描述或加入排除條件。" : "已為你找到候選結果。";

    return NextResponse.json({
      ...intent,
      intentMode: effectiveMode,
      candidates: finalCandidates,
      message,
      isFallback,
      refinementActions: getActions(effectiveMode, intent.parsedIntent),
      previousQueries: [...(body.previousQueries ?? []), ...queryPool].slice(-20),
      previousFailedQueries: isFallback ? [...(body.previousFailedQueries ?? []), ...queryPool].slice(-20) : body.previousFailedQueries ?? []
    } satisfies SearchResponse);
  } catch (error) {
    console.error("/api/search error", error);
    return NextResponse.json({
      ...fallbackIntent,
      intentMode: "unsure",
      candidates: fallbackCandidates,
      message: "這次搜尋沒有找到合適結果，請換個描述或加入排除條件。",
      isFallback: true,
      refinementActions: getActions("shopping", fallbackIntent.parsedIntent),
      previousQueries: [],
      previousFailedQueries: []
    } satisfies SearchResponse);
  }
}
