# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Architecture

This is a 194964 Customer Support AI Chatbot with three main components:

### 1. API (`api/`)
- **Fastify 5** server with multi-model AI routing
- Supports 5 AI providers: Gemini (via Google GenAI), OpenAI, Groq, DeepSeek, Anthropic
- **Prisma ORM** with PostgreSQL for data persistence
- Smart FAQ matching with exact-match-first logic before AI fallback
- Context caching for Gemini models (1-hour TTL)
- Rate limiting and CORS enabled

### 2. Frontend (`frontend/`)
- **React 18 + Vite 6** mobile-first chat interface
- **TailwindCSS 3** for styling
- Chat history persisted in `localStorage`
- Session management with UUID generation
- Automatic language detection (Japanese/English)

### 3. Admin Panel (`backend/`)
- **Next.js 15** App Router with admin dashboard
- Knowledge Base management with categories
- Prompt Playground for model comparison
- Interaction analytics and pending review system
- **@tanstack/react-table** for data tables

## Key Development Commands

### API Server
```bash
cd api
npm run dev          # Start with --watch (auto-restart)
npm run db:migrate   # Deploy Prisma migrations
npm run db:push      # Push schema changes to DB
npm run db:studio    # Open Prisma Studio
npm run seed         # Seed database
```

### Frontend
```bash
cd frontend
npm run dev          # Vite dev server (localhost:5173)
npm run build        # Production build
```

### Admin Panel
```bash
cd backend
npm run dev          # Next.js dev server (localhost:3100)
npm run build        # Production build
npm run lint         # Next.js linting
```

## Database Schema (Prisma)

Core models:
- **KnowledgeBase**: FAQ entries with categories, soft delete support
- **Interaction**: Chat logs with feedback, token usage, cost tracking
- **PendingReview**: Failed/negative interactions for admin review
- **SystemSetting**: Configurable system prompts and settings
- **AdminUser**: Admin authentication with soft delete

## AI Model Configuration

Models configured in `api/ai-model.json`:
- Provider routing logic in `api/server.js`
- Default model selection managed via admin panel
- Cost tracking with token-based pricing
- Model rating system for playground recommendations

## Important Patterns

### FAQ System
- Exact matching with text normalization (trim, lowercase, punctuation cleanup)
- Japanese KB with English translation on demand
- Fallback to configurable "unknown answer" response

### Session Management
- UUID-based user identification
- localStorage for chat persistence
- Session restoration on page reload

### Admin Workflows
- Soft delete pattern for KB and AdminUser
- Flash messages for CRUD operations
- Pagination defaults to 20 records/page
- Audit logging for all admin actions

## Environment Variables

Required in `api/.env`:
```
DATABASE_URL=postgresql://...
GEMINI_API_KEY=...
OPENAI_API_KEY=...
GROQ_API_KEY=...
DEEPSEEK_API_KEY=...
ANTHROPIC_API_KEY=...
PORT=3001
```

Optional in `backend/.env`:
```
API_BASE_URL=http://localhost:3001
ADMIN_API_KEY=...
```

## Testing Strategy

No test framework currently configured. When adding tests:
- Check existing package.json scripts first
- Consider separate test configs for each component
- Focus on API endpoints and data transformations