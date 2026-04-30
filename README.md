# 194964 Customer Support AI Chatbot
Web App for Automated Customer Support Using AI

## 🌟 Features

### Welcome Screen
Always shows welcome text:
> 私は194964のスマートアシスタントです。ご質問があれば、お気軽にご入力ください。

### Automatic Response
Responses are generated using `faq.json` with the following rules:

#### Language Rule
Chatbot replies in the same language as the user — Japanese or English.
FAQ data is in Japanese; answers are translated to English when needed.

#### Behavior Rules
1. If the question is not in the FAQ, respond with:
   > 申し訳ございませんが、この情報についてはLINE（@194964）を通じて弊社スタッフに直接お問い合わせいただくことをお勧めします。
2. Respond politely and in a friendly manner.
3. If pricing is unclear, recommend the website or staff:
   > ウェブサイトを確認するか、スタッフに尋ねることをお勧めします。
4. Always respond as if talking to a real person.

### AI Model Selection
Users can switch between models in the chat UI:

| Model | Provider | API Key |
|---|---|---|
| Gemini 2.5 Flash | Google Gemini | `GEMINI_API_KEY` |
| GPT-5 Mini | OpenAI | `OPENAI_API_KEY` |
| GPT-5 Nano | OpenAI | `OPENAI_API_KEY` |
| Llama 3.1 8B Instant | Groq | `GROQ_API_KEY` |

### User Experience
- **Mobile-first design**: Optimized for thumb-friendly interactions
- **Chat history**: Persisted in `localStorage` — survives page reload
- **Session persistence**: Session ID stored in `localStorage`
- **Model preference**: Last selected model saved in `localStorage`
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
- **`openai` npm package** — unified OpenAI-compatible client for all providers
- Routes requests to the correct provider based on selected model:
  - **Gemini** via `https://generativelanguage.googleapis.com/v1beta/openai/`
  - **OpenAI** via default OpenAI endpoint
  - **Groq** via `https://api.groq.com/openai/v1`
- `GET /api/models` — returns the list of available models to the frontend
- `POST /api/chat` — accepts `message` + `model`, returns `reply`

### Data Management
- **`faq.json`** — FAQ source data (Japanese)
- **`localStorage`** — chat history, session ID, selected model

---

## 📁 Project Structure

```
194_ai_chatbot/
├── faq.json                  # FAQ data
├── api/
│   ├── package.json
│   ├── server.js             # Fastify API (multi-model routing)
│   ├── .env                  # API keys (not committed)
│   └── .env.example          # Template
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

---

## 🌟 User Journey

1. **Welcome screen** — assistant greeting shown on first load
2. **Model selection** — choose AI model from pill buttons below the header
3. **Chat** — type a message, press Enter to send
4. **History** — chat is saved and restored on reload
5. **Reset** — trash icon in header clears chat and session
