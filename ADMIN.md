# 194964 Customer Support AI Chatbot Admin Panel

Admin panel for monitoring, operations, and content management.

## Features

### Login
- Session-based admin login for protected pages.

### Dashboard
- Today and month KPI cards:
    - Questions
    - Thumb Up / Thumb Down
    - Pending reviews
- Cost analytics:
    - Daily cost
    - Monthly cost
    - Cost per conversation
    - Cost per model
    - Cost per positive feedback
- Model routing table:
    - Thumb up rate
    - Average cost
    - Average latency
    - Unknown answer rate
- Daily trend chart from `/api/admin/dashboard/trends` with multiple lines:
    - Questions
    - Thumb Down
    - Missed (UNKNOWN_ANSWER)

### Alert Threshold Settings
- Dedicated page for alert thresholds and notification target.
- Values are loaded from and persisted to `api/ai-model.json`.

### Admin User Management
- List, create, update, and delete admin users.
- Delete action uses soft delete by setting `isDelete=true`.
- Recycle Bin filter supports `Active Only`, `Deleted Only`, and `All`.
- Deleted users can be restored from the list with **Restore** action.

### System Setting
- Manage versioned prompt settings:
    - `systemPromptTemplate`
    - `unknownAnswerCleanText`
    - `version`, `createdBy`, `createdAt`, `isActive`
- Copy older versions into new drafts.

### Knowledge Base Management
- List with category filter.
- Add, edit, delete, and toggle `isActive`.
- CSV/JSON import support through admin API.
- Delete action uses soft delete by setting `isDelete=true` (records are kept for audit/history).
- Recycle Bin filter supports `Active Only`, `Deleted Only`, and `All`.
- Deleted KB entries can be restored from the list with **Restore** action.

### Interactions Management
- List with filters:
    - Model
    - Question text
    - Thumb up/down
    - Source (`Chat`, `Prompt Playground`, `All`)
    - Date range
- Default source filter is `Chat` when no source query is provided.
- Sorting options for key columns.
- Detail page with prompt version and user chat history.

### Prompt Playground
- Compare multiple models against the same:
    - Question
    - Prompt template (editable)
- Model table includes:
    - Cost (`In` / `Out` / `Cache`)
    - Ratings (`Accuracy` / `Speed` / `Helpfulness`)
    - Sortable columns with remembered last sort.
    - Remembered selected models.
- Prompt Playground test history:
    - Stores `question`, `promptTemplate`, and `result` per run.
    - Click history item to open detail later.
    - Supports history pagination.
- Set default AI model for end-user frontend chat from admin page.

### Pending Review Management
- List mode or group-by-question mode.
- Default status filter is `PENDING` when no status query is provided.
- Status filter options: `PENDING`, `RESOLVED`, `IGNORED`.
- Draft KB generation and promote-to-KB flow.
- Promote to KB modal includes **Ask AI Suggestion**:
    - Model list restricted to `helpfulness >= 4`
    - `ASK AI` button aligned at top with model selector
    - Optional Advanced section (hidden by default) for Prompt and Answer Style (`Short`/`Long`)
    - Suggestion panel is scrollable to prevent overflow

### Reports
- Model report by date range with sortable metrics.
- Search analytics report:
    - Top questions
    - Unanswered questions
    - Repeated questions
    - Low satisfaction topics

### Audit Logs
- Tracks major admin actions and configuration changes.

### Flash Messages
- Success banner shown after major add/update/delete operations:
    - Knowledge Base
    - Pending Review (status update/promote)
    - Admin Users
    - System Setting
    - Alert Threshold Settings

## Prompt Behavior Notes

- Chat API now checks active KB for an **exact question match first**.
- If exact match exists, it returns KB answer immediately before calling AI provider.
- System prompt builder automatically appends FAQ block when template does not contain `{{FAQ_DATA}}`.

## Pagination Standard

- All list pages use pagination.
- Default page size is **20 records per page**.
- API list endpoints accept:
    - `page` (default `1`)
    - `pageSize` (default `20`)
- Standard API response fields for list endpoints:
    - `items`
    - `page`
    - `pageSize`
    - `total`
    - `totalPages`

## Technology Stack

### Admin App (`backend/`)
- Next.js App Router
- Server Actions
- TailwindCSS

### API (`api/`)
- Fastify 5
- Prisma
- Admin routes with `x-admin-key` protection (when configured)

## Folder Structure

```text
194_ai_chatbot/
├── backend/                     # Next.js admin panel
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (dashboard)/dashboard/
│   │   ├── alert-threshold-settings/
│   │   ├── admin-users/
│   │   ├── audit-logs/
│   │   ├── interactions/
│   │   ├── knowledge-base/
│   │   ├── pending/
│   │   ├── prompt-playground/
│   │   ├── reports/model/
│   │   ├── reports/search/
│   │   └── system-setting/
│   ├── components/
│   ├── actions/
│   └── lib/
├── api/                         # Fastify chat + admin API
├── frontend/                    # React + Vite end-user chat UI
└── faq.json
```