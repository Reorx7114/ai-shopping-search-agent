# AI Shopping Search Agent MVP

一個以 **Next.js + Tailwind CSS + TypeScript** 打造的極簡購物搜尋 MVP。
使用者輸入模糊描述後，後端會先透過 OpenAI 解析描述（商品特徵 / 搜尋關鍵字 / 英文搜尋詞），再回傳 mock 候選商品圖片牆。

## 功能概覽

- Google-like 單一大型搜尋框（mobile friendly）
- `/api/search` 解析自然語言描述
- 回傳 AI 結果欄位：
  - 商品特徵
  - 搜尋關鍵字
  - 英文搜尋詞
- 候選圖片牆（目前使用 mock data）
  - 商品圖片
  - 商品名稱
  - 平台名稱
  - 比較像這個按鈕

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

填入：

- `OPENAI_API_KEY`：你的 OpenAI API Key
- `OPENAI_MODEL`：可選，預設 `gpt-4.1-mini`

> 若未設定 API Key，系統仍會使用 fallback intent + mock results 正常展示流程。

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
5. 點擊 Deploy

---

## 後續可擴充（目前尚未實作）

- 串接 Google Shopping / SerpAPI / 電商平台搜尋 API
- 點「比較像這個」做二次查詢與重排序
- 價格比對、來源可信度評分
