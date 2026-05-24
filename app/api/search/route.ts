import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { mockProducts } from "@/mockData";

type SearchIntent = {
  features: string[];
  keywords: string[];
  englishKeywords: string[];
};

const fallbackIntent: SearchIntent = {
  features: ["玩具", "可能是可夾取的造型", "手持裝置"],
  keywords: ["藍色 夾取 玩具", "手持 夾夾槍"],
  englishKeywords: ["blue grabber toy", "toy claw gun"]
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
              "You convert fuzzy shopping descriptions into JSON with fields: features, keywords, englishKeywords. Keep each field as an array of short strings."
          },
          { role: "user", content: query }
        ]
      });

      const content = completion.choices[0]?.message?.content;
      if (content) {
        intent = JSON.parse(content) as SearchIntent;
      }
    }

    return NextResponse.json({
      intent,
      results: mockProducts
    });
  } catch (error) {
    console.error("/api/search error", error);
    return NextResponse.json(
      {
        intent: fallbackIntent,
        results: mockProducts,
        warning: "AI 解析失敗，已使用預設結果。"
      },
      { status: 200 }
    );
  }
}
