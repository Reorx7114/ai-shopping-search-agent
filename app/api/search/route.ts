import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { mockProducts, type MockProduct } from "@/mockData";

type SearchIntent = {
  features: string[];
  keywords: string[];
  englishKeywords: string[];
  searchQueries: string[];
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

const fallbackIntent: SearchIntent = {
  features: ["玩具", "可能是可夾取的造型", "手持裝置"],
  keywords: ["藍色 夾取 玩具", "手持 夾夾槍"],
  englishKeywords: ["blue grabber toy", "toy claw gun"],
  searchQueries: ["blue toy claw grabber", "night market grabber gun toy"]
};

const parseIntent = (raw: string): SearchIntent => {
  const parsed = JSON.parse(raw) as Partial<SearchIntent>;
  return {
    features: Array.isArray(parsed.features) ? parsed.features : fallbackIntent.features,
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords : fallbackIntent.keywords,
    englishKeywords: Array.isArray(parsed.englishKeywords)
      ? parsed.englishKeywords
      : fallbackIntent.englishKeywords,
    searchQueries: Array.isArray(parsed.searchQueries)
      ? parsed.searchQueries
      : fallbackIntent.searchQueries
  };
};

const toMockProduct = (item: SerpApiImageResult, index: number): MockProduct | null => {
  const imageUrl = item.original || item.thumbnail;
  const link = item.link;

  if (!imageUrl || !link) {
    return null;
  }

  return {
    id: `serp-${index}`,
    name: item.title || "未命名商品",
    platform: item.source || "Unknown Source",
    imageUrl,
    url: link
  };
};

const searchSerpApi = async (query: string): Promise<MockProduct[]> => {
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
  const items = data.images_results ?? [];

  return items.map(toMockProduct).filter((item): item is MockProduct => item !== null).slice(0, 12);
};

export async function POST(req: NextRequest) {
  try {
    const { query } = (await req.json()) as { query?: string };

    if (!query || !query.trim()) {
      return NextResponse.json({ error: "請輸入描述文字" }, { status: 400 });
    }

    let intent = fallbackIntent;

    if (process.env.OPENAI_API_KEY) {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const completion = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Convert the user's fuzzy shopping description into JSON with fields: features, keywords, englishKeywords, searchQueries. Every field must be an array of short strings, and searchQueries should be optimized for image shopping search."
          },
          { role: "user", content: query }
        ]
      });

      const content = completion.choices[0]?.message?.content;
      if (content) {
        intent = parseIntent(content);
      }
    }

    let results = mockProducts;
    let warning: string | undefined;

    if (process.env.SERPAPI_API_KEY) {
      const searchQuery = intent.searchQueries[0] || intent.englishKeywords[0] || query;
      const serpResults = await searchSerpApi(searchQuery);
      if (serpResults.length > 0) {
        results = serpResults;
      } else {
        warning = "找不到即時圖片結果，已改用預設候選資料。";
      }
    } else {
      warning = "尚未設定 SERPAPI_API_KEY，已使用 mockData。";
    }

    return NextResponse.json({ intent, results, warning });
  } catch (error) {
    console.error("/api/search error", error);
    return NextResponse.json(
      {
        intent: fallbackIntent,
        results: mockProducts,
        warning: "AI 或搜尋流程發生錯誤，已使用預設結果。"
      },
      { status: 200 }
    );
  }
}
