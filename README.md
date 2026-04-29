# 194964 Customer Support AI Chatbot
194964 Customer Support AI Chatbot - Web App for Automated Customer Support Using AI 

## 🌟 Features

### Welcome Screen
- Alway show welcome text => 
私は194964のスマートアシスタントです。
ご質問があれば、お気軽にご入力ください。

### Automatic response
Automatic response by using faq.json with the following rule.

#### Rule
━━━━━━━━━━━━━━━━━━━━
■ LANGUAGE RULE
━━━━━━━━━━━━━━━━━━━━
Chatbot MUST reply in the language specified by:Japanese , English .
Can using faq.json that in japanse and then reponse translate in english.
 
━━━━━━━━━━━━━━━━━━━━
■ BEHAVIOR RULES
━━━━━━━━━━━━━━━━━━━━
1) If the question is not in the FAQ, please respond with 
"申し訳ございませんが、この情報についてはLINE（@194964）を通じて弊社スタッフに直接お問い合わせいただくことをお勧めします。"
2) Respond politely and in a friendly manner.
3) If the price is unclear, we recommend checking the website or asking a staff member , with
"ウェブサイトを確認するか、スタッフに尋ねることをお勧めします。"
4) Always respond as if talking to a real person.
 
### User Experience
- **Touch-friendly interface**:
- **Mobile-first design**: Optimized for thumb-friendly interactions

### Technical Features
- **Data Storage**: Using JSON file
- **Responsive design**: Mobile-optimized with prevent zoom on double-tap
- **Session management**: Optional localStorage for data persistence
- **Error handling**: Graceful fallbacks and user-friendly error messages
- **Chat**: Using Gemini 1.5 Flash model for chat response

---
## 🌟 Technology Stack

### Frontend
- **HTML**: Semantic structure with accessibility features
- **CSS3 + TailwindCSS**: Utility-first styling with custom animations
- **REACT**
- **VITE**
- **Responsive Design**: Mobile-first approach with touch optimization
- **Chatbot API** : call api 

### API
- **Fastify** : 
- **Chat API*** : Using @platformatic/fastify-ai connect to Gemini 1.5 Flash model and using faq.json for chat response

### Data Management
- **JSON Configuration**: FAQ data
- **LocalStorage**: Optional session persistence
- **Client-side State**: Real-time data management without backend

### Architecture
- **Cross-platform**: Compatible with all modern browsers

---

## 🌟 User Journey

### 1. Show welcome screen

### 2. Chat 
- click from chat button on chat list
- using api that code with Fastify