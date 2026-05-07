# 194964 Customer Support AI Chatbot
Web App for Automated Customer Support Using AI

This repository contains 3 parts:
- `frontend/` - End-user chat UI (React + Vite)
- `api/` - Fastify API for chat and admin endpoints
- `backend/` - Admin panel (Next.js)

## 🌟 Features

### Welcome Screen
Always shows welcome text:
> 私は194964のスマートアシスタントです。ご質問があれば、お気軽にご入力ください。

### Automatic Response
Responses are generated using KnowledgeBase store in Prisma with the following rules:

- **Exact FAQ-first matching**: if user question exactly matches an active Knowledge Base question (normalized), API returns the KB answer directly before calling any AI provider.

#### Language Rule
Chatbot replies in the same language as the user — Japanese or English.
KnowledgeBase is in Japanese; answers are translated to English when needed.

#### Behavior Rules
1. If the question is not in the KnowledgeBase, respond with:
   > 申し訳ございませんが、この情報についてはLINE（@194964）を通じて弊社スタッフに直接お問い合わせいただくことをお勧めします。
2. Respond politely and in a friendly manner.
3. Always respond as if talking to a real person.

### AI Model Selection
Users can switch between models in the chat UI:

| Provider | API Key |
|---|---|
| Gemini | `GEMINI_API_KEY` |
| OpenAI | `OPENAI_API_KEY` |
| Groq | `GROQ_API_KEY` |
| DeepSeek | `DEEPSEEK_API_KEY` |
| Anthropic | `ANTHROPIC_API_KEY` |

Model entries are configured in `api/ai-model.json` and returned by `GET /api/models`.
Each model can define:
- `id` (frontend/internal ID)
- `apiModel` (optional provider-specific real model name)
- `provider`
- `temperature`
- `cost.token_1m` (input/output/cache pricing for UI display)

Current configured models include Gemini, OpenAI, Groq, Anthropic, and DeepSeek variants.

### User Experience
- **Mobile-first design**: Optimized for thumb-friendly interactions
- **Chat history**: Persisted in `localStorage` — survives page reload
- **Session persistence**: Session ID stored in `localStorage`
- **Model preference**: Last selected model saved in `localStorage`
- **Cost panel (desktop)**: Right-side model cost table (USD per 1M tokens)
- **Sortable costs**: Sort by Model / In / Out / Cache from table header
- **Error handling**: Graceful fallbacks and user-friendly error messages
- **Restore chat**: Previous conversation restored on page reload

---

## 🌟 Technology Stack

### Frontend
- **React 18** + **Vite 6**
- **TailwindCSS 3** — utility-first styling with custom animations
- **Mobile-first** responsive design, prevent zoom on double-tap
- Calls `POST /api/chat` with selected model

### API
- **Fastify 5** — fast Node.js web framework
- **`openai` npm package** — OpenAI-compatible providers (OpenAI, Groq, DeepSeek, etc.)
- **`@google/genai`** — native Gemini path with context caching support
- **`@anthropic-ai/sdk`** — native Anthropic path for Claude models
- Routes requests to the correct provider based on selected model:
  - **Gemini** via `https://generativelanguage.googleapis.com/v1beta/openai/`
  - **OpenAI** via default OpenAI endpoint
  - **Groq** via `https://api.groq.com/openai/v1`
   - **DeepSeek** via `https://api.deepseek.com/v1`
   - **Anthropic** via native Anthropic SDK
- **Gemini context caching**:
   - Cache stored per model ID
   - TTL 1 hour, refreshed early
   - Specific models can bypass cache
- `GET /api/models` — returns the list of available models to the frontend
- `POST /api/chat` — accepts `message` + `model`, returns `reply`
- Runtime prompt is built from active System Setting + active Knowledge Base entries.
- If `{{FAQ_DATA}}` placeholder is missing in a custom template, FAQ block is automatically appended.

### Admin Panel (`backend/`)
- **Next.js 15** App Router
- Dashboard with KPI cards and multi-line daily trends chart (`questions`, `thumbDown`, `missed`) from `/api/admin/dashboard/trends`
- Admin management pages:
   - Knowledge Base
   - Interactions
   - Pending Reviews
   - Model Report
   - Search Analytics
   - Audit Logs
   - System Settings
   - Admin Users
   - Alert Threshold Settings

#### Admin UX Updates
- Flash message banner after add/update/delete actions (KB, Pending, Admin Users, System Setting, Alert Threshold Settings).
- Pending Review default filter is `status=PENDING` when no status query is provided.
- Promote to KB modal includes **Ask AI Suggestion**:
   - Model picker is restricted to models with `rating.helpfulness >= 4`
   - `ASK AI` action button
   - Optional Advanced section (hidden by default) for custom Prompt + Short/Long answer style

#### Admin List Pagination
- All admin list pages use pagination by default.
- Default page size: **20 records/page**.
- Admin list endpoints accept `page` and `pageSize` query parameters.
- Typical response includes `items`, `page`, `pageSize`, `total`, and `totalPages`.

### Data Management
- **`Prisma`** — KnowledgeBase, SystemData, Log, ...
- **`localStorage`** — chat history, session ID, selected model
- **Soft delete (`isDelete`)** — Knowledge Base and Admin Users are marked as deleted (`isDelete=true`) instead of hard-deleted.

---

## 📁 Project Structure

```
194_ai_chatbot/
├── faq.json                  # FAQ data
├── api/
│   ├── package.json
│   ├── server.js             # Fastify API (multi-model routing)
│   ├── admin-routes.js       # Admin endpoints (reports, management, audit)
│   ├── ai-model.json         # Provider/model registry + pricing metadata
│   ├── .env                  # API keys (not committed)
│   └── .env.example          # Template
├── backend/
│   ├── package.json
│   ├── app/                  # Next.js admin app routes
│   ├── components/
│   ├── actions/
│   └── lib/
└── frontend/
    ├── package.json
    ├── vite.config.js        # Dev proxy /api → localhost:3001
    ├── tailwind.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── index.css
        └── App.jsx           # Chat UI with model picker
```

---

## 🚀 Setup & Run

### 1. API

Get API keys:
- Groq (free): https://console.groq.com/keys
- Gemini: https://aistudio.google.com/app/apikey
- OpenAI: https://platform.openai.com/api-keys
- DeepSeek: https://platform.deepseek.com/api_keys
- Anthropic: https://console.anthropic.com/settings/keys

```bash
cd api
cp .env.example .env
# Edit .env and fill in your API keys
npm install
npm run dev        # runs on http://localhost:3001
```

`.env` format:
```
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
OPENAI_API_KEY=your_openai_key
DEEPSEEK_API_KEY=your_deepseek_key
ANTHROPIC_API_KEY=your_anthropic_key
PORT=3001
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev        # runs on http://localhost:5173
```

The Vite dev server proxies `/api` requests to `http://localhost:3001`.

For a custom API URL (e.g. production), set in `frontend/.env`:
```
VITE_API_URL=http://your-api-host
```

### 3. Admin Panel

```bash
cd backend
npm install
npm run dev        # runs on http://localhost:3100 (or next available port)
```

Set API URL for admin app (if needed) in `backend/.env`:

```env
API_BASE_URL=http://localhost:3001
ADMIN_API_KEY=your_admin_api_key
```

---

## 🌟 User Journey

1. **Welcome screen** — assistant greeting shown on first load
2. **Model selection** — choose AI model from pill buttons below the header
3. **Cost awareness (desktop)** — review model pricing on the right panel (sortable)
4. **Chat** — type a message, press Enter to send
5. **History** — chat is saved and restored on reload
6. **Reset** — trash icon in header clears chat and session
