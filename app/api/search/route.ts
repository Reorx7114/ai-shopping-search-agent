import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { mockProducts } from "@/mockData";

type Candidate = {
  id: string;
  title: string;
  source: string;
  image: string;
  link: string;
};

type SelectedCandidate = {
  title?: string;
  source?: string;
  image?: string;
  link?: string;
};

type SearchRequest = {
  query?: string;
  feedback?: "none_match";
  excludedTerms?: string[];
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
};

type SerpApiResponse = {
  images_results?: SerpApiImageResult[];
};


const isValidHttpImageUrl = (value?: string): value is string => {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname.length > 0;
  } catch {
    return false;
  }
};

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

  return Array.from(new Set(merged.filter(Boolean).map((term) => term.trim()).filter(Boolean)));
};

const parseIntent = (raw: string, normalizedExcludedTerms: string[], quotedClues: string[]): SearchIntent => {
  const parsed = JSON.parse(raw) as Partial<SearchIntent>;

  const importantClues = Array.from(
    new Set([
      ...(Array.isArray(parsed.importantClues) ? parsed.importantClues : []),
      ...quotedClues
    ])
  );

  return {
    features: Array.isArray(parsed.features) ? parsed.features : fallbackIntent.features,
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : fallbackIntent.keywords,
    englishKeywords: Array.isArray(parsed.englishKeywords)
      ? parsed.englishKeywords
      : fallbackIntent.englishKeywords,
    importantClues: importantClues.length > 0 ? importantClues : fallbackIntent.importantClues,
    excludedTerms:
      Array.isArray(parsed.excludedTerms) && parsed.excludedTerms.length > 0
        ? Array.from(new Set([...parsed.excludedTerms, ...normalizedExcludedTerms]))
        : normalizedExcludedTerms,
    searchQueries: Array.isArray(parsed.searchQueries) ? parsed.searchQueries : fallbackIntent.searchQueries
  };
};

const toCandidate = (item: SerpApiImageResult, index: number): Candidate | null => {
  const image = item.original || item.thumbnail;
  if (!isValidHttpImageUrl(image) || !isValidHttpImageUrl(item.link)) {
    return null;
  }

  return {
    id: `serp-${index}`,
    title: item.title || "未命名商品",
    source: item.source || "Unknown Source",
    image,
    link: item.link
  };
};

const fallbackCandidates: Candidate[] = mockProducts.map((product) => ({
  id: product.id,
  title: product.name,
  source: product.platform,
  image: product.imageUrl,
  link: product.url
}));

const searchSerpApi = async (query: string): Promise<Candidate[]> => {
  const apiKey = process.env.SERPAPI_API_KEY;
  if (!apiKey) {
    return [];
  }

  const params = new URLSearchParams({
    engine: "google_images",
    q: query,
    api_key: apiKey,
    hl: "zh-tw",
    gl: "tw"
  });

  const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
    method: "GET",
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`SerpAPI request failed: ${response.status}`);
  }

  const data = (await response.json()) as SerpApiResponse;
  return (data.images_results ?? []).map(toCandidate).filter((item): item is Candidate => item !== null).slice(0, 12);
};

const buildOpenAIPrompt = (payload: {
  query: string;
  feedback?: "none_match";
  previousIntent?: Partial<SearchIntent>;
  selectedCandidate?: SelectedCandidate;
  excludedTerms: string[];
  quotedClues: string[];
}) => {
  const { query, feedback, previousIntent, selectedCandidate, excludedTerms, quotedClues } = payload;

  return JSON.stringify(
    {
      query,
      feedback: feedback || null,
      previousIntent: previousIntent || null,
      selectedCandidate: selectedCandidate || null,
      excludedTerms,
      quotedClues,
      instructions: {
        goal: "Generate shopping intent and multi-query image search plan.",
        mustAvoidRepeatingWhenNoneMatch: feedback === "none_match",
        prioritizeImportantClues: true,
        avoidExcludedTerms: true,
        outputSchema: [
          "features:string[]",
          "keywords:string[]",
          "englishKeywords:string[]",
          "importantClues:string[]",
          "excludedTerms:string[]",
          "searchQueries:string[]"
        ]
      }
    },
    null,
    2
  );
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as SearchRequest;
    const query = body.query?.trim();

    if (!query) {
      return NextResponse.json({ message: "請輸入描述文字" }, { status: 400 });
    }

    const quotedClues = findQuotedClues(query);
    const normalizedExcludedTerms = normalizeExcludedTerms(query, body.excludedTerms ?? []);

    let intent: SearchIntent = {
      ...fallbackIntent,
      importantClues: quotedClues.length > 0 ? quotedClues : fallbackIntent.importantClues,
      excludedTerms: normalizedExcludedTerms
    };

    if (process.env.OPENAI_API_KEY) {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        temperature: 0.25,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a shopping search optimizer. Return strict JSON only with: features, keywords, englishKeywords, importantClues, excludedTerms, searchQueries. searchQueries must prioritize important clues and avoid excluded terms. If feedback is none_match, produce materially different queries from previousIntent.searchQueries."
          },
          {
            role: "user",
            content: buildOpenAIPrompt({
              query,
              feedback: body.feedback,
              previousIntent: body.previousIntent,
              selectedCandidate: body.selectedCandidate,
              excludedTerms: normalizedExcludedTerms,
              quotedClues
            })
          }
        ]
      });

      const content = completion.choices[0]?.message?.content;
      if (content) {
        intent = parseIntent(content, normalizedExcludedTerms, quotedClues);
      }
    }

    const queryPool = intent.searchQueries.length > 0 ? intent.searchQueries : [query];

    let candidates: Candidate[] = [];
    let isFallback = false;
    let message = "已為你找到候選商品。";

    if (process.env.SERPAPI_API_KEY) {
      for (const searchQuery of queryPool.slice(0, 3)) {
        const found = await searchSerpApi(searchQuery);
        candidates = [...candidates, ...found].slice(0, 12);
        if (candidates.length >= 8) {
          break;
        }
      }
    }

    if (candidates.length === 0) {
      isFallback = true;
      candidates = fallbackCandidates;
      message = "這次搜尋沒有找到合適結果，請換個描述或加入排除條件。"
    }

    const response: SearchResponse = {
      ...intent,
      candidates,
      message,
      isFallback
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("/api/search error", error);
    return NextResponse.json({
      ...fallbackIntent,
      excludedTerms: fallbackIntent.excludedTerms,
      candidates: fallbackCandidates,
      message: "這次搜尋沒有找到合適結果，請換個描述或加入排除條件。",
      isFallback: true
    } satisfies SearchResponse);
  }
}
