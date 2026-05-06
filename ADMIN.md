# 194964 Customer Support AI Chatbot Admin Panel
Admin Panel for Manage System Prompt , Knowledge Base, Report

## 🌟 Features

### Login
### Dashboard
    - Show Today statistic about 
        -- no of question
        -- no of isThumbUp==true
        -- no of isThumbUp==false
        -- no of pendingReview

    - Show This Month statistic about 
        -- no of question
        -- no of isThumbUp==true
        -- no of isThumbUp==false
        -- no of pendingReview
### Admin User Management
### System Setting
    - systemPromptTemplate
    - unknownAnswerCleanText
### Knowledge Base Management    
    - List all (Can Filter by Category)
    - Add / Edit / Delete / set isActive
### Conversations / Interaction Management
    - List all with filter by 
        -- AI model
        -- Question
        -- isThumbUp
        -- Date (From-To)
### Pending Review Management
    - List all (Can Group By Question)
    - Copy to KnowledgeBase
    - Set status (PENDING, PROCESSING, COMPLETED)
### AI model report
    - Filter By Date (From-To)     
    - Show 
        -- No. of answer
        -- No. of miss answer
        -- % of miss answer
        -- No. of isThumbUp==true
        -- % of isThumbUp==true
        -- No. of isThumbUp==false
        -- % of isThumbUp==false
        -- Avg. Latency
        -- Avg. InputTokens
        -- Avg. OutputTokens
        -- Total InputTokens
        -- Total OutputTokens

### User Experience
- **PC Responsive design**: 
- **Sortable table**: Sort by Model / InputTokens / OutputTokens / ResponseTime / createdAt / Question
- **Error handling**: Graceful fallbacks and user-friendly error messages

---

## 🌟 Technology Stack

### Backend
- **Next.js**
- **Shadcn/ui** 
- **TanStack Table**
- **Prisma**
- **Fastify APIs**

### API
- **Fastify 5** : in /api directory with authentication (seperate with frontend that no authen required)

### Data Management
- Prisma 

---

## 📁 Folder Structure
create in backend folder
194_ai_chatbot/
├── api/
└── frontend/
└── backend/