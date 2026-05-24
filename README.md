# AI Shopping Search Agent MVP

一個以 **Next.js + Tailwind CSS + TypeScript** 打造的極簡購物搜尋 MVP。
使用者輸入模糊描述後，後端會先透過 OpenAI 解析描述（商品特徵 / 搜尋關鍵字 / 英文搜尋詞 / 搜尋查詢詞），再透過 SerpAPI 抓取真實圖片搜尋結果並顯示候選商品圖片牆。

## 功能概覽

- Google-like 單一大型搜尋框（mobile friendly）
- `/api/search` 解析自然語言描述
- 回傳 AI 結果欄位：
  - 商品特徵
  - 搜尋關鍵字
  - 英文搜尋詞
  - searchQueries
- 候選圖片牆
  - 優先使用 SerpAPI 真實圖片結果
  - 若未設定 SerpAPI，使用 mock data fallback

## 專案技術

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- npm
- 可直接部署至 Vercel

---

## 本機開發

### 1) 安裝套件

```bash
npm install
```

### 2) 設定環境變數

```bash
cp .env.example .env.local
```

請在 `.env.local` 設定：

- `OPENAI_API_KEY`：OpenAI API Key（建議設定，啟用描述解析）
- `OPENAI_MODEL`：可選，預設 `gpt-4.1-mini`
- `SERPAPI_API_KEY`：SerpAPI Key（建議設定，啟用真實圖片搜尋）

> 若沒有設定 `OPENAI_API_KEY`，系統會使用 fallback intent。
>
> 若沒有設定 `SERPAPI_API_KEY`，系統會自動改用 `mockData` 作為候選圖片牆。

### 3) 啟動開發伺服器

```bash
npm run dev
```

打開 `http://localhost:3000`。

---

## Vercel Deploy 教學

### 方式 A：使用 Vercel CLI

1. 安裝 Vercel CLI

```bash
npm i -g vercel
```

2. 在專案目錄執行

```bash
vercel
```

3. 依提示完成專案建立，並在 Vercel 後台設定環境變數：

- `OPENAI_API_KEY`
- `OPENAI_MODEL`（可選）
- `SERPAPI_API_KEY`

4. 正式部署

```bash
vercel --prod
```

### 方式 B：連接 GitHub 自動部署

1. Push 專案到 GitHub
2. 到 [vercel.com](https://vercel.com) 匯入該 repo
3. Framework Preset 選 Next.js（通常自動偵測）
4. 在 Project Settings → Environment Variables 設定：
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL`（可選）
   - `SERPAPI_API_KEY`
5. 點擊 Deploy
