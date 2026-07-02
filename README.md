# Sentinel AI — Predictive DevOps & Deployment Guardian

> The intelligent pre-deployment guardian that predicts outages and release risks *before* they affect production. Built with the **MERN Stack** (MongoDB, Express, React, Node.js) for the **Slack Agent Builder Challenge**.

---

## 📽️ Project Presentation PowerPoint (PPT)
The project includes a comprehensive pitch deck explaining the business value, technical architecture, and implementation details:
- **Presentation File:** [SentinelAI_Presentation.pptx](SentinelAI_Presentation.pptx) (Located in the root of this repository)
- **What it covers:**
  - The problem: Outages costing millions due to post-deployment alert fatigue.
  - The solution: Sentinel AI's "Grammarly-like" proactive guardrail system.
  - Core scoring formula weights and AI RAG (Retrieval-Augmented Generation) lookup.
  - Real-world integration mapping (CI/CD Pipelines, GitHub Webhooks, and Slack Command Simulators).

---

## 🚀 Vision

**From:** Reacting to out-of-memory and latency spike alerts *after* outages hit production.  
**To:** Blocking risky releases *before* they are compiled or deployed to your clusters.

Sentinel AI acts as a **Pre-Deployment Guardrail**. Instead of waiting for Grafana or Datadog alerts to notify you that production is down, Sentinel integrates directly into your git branches and Slack channels to predict outage risks beforehand.

---

## 🏗️ System Architecture

```text
                        ┌─────────────────────────┐
                        │      Slack Client       │
                        └────────────┬────────────┘
                                     │
                                     ▼
                        ┌─────────────────────────┐
                        │   Sentinel AI Backend   │ (Node.js & Express)
                        └────────────┬────────────┘
                                     │
             ┌───────────────────────┼───────────────────────┐
             ▼                       ▼                       ▼
       GitHub API / MCP        Jira API / MCP        Prometheus Telemetry
     (Commits, diffs, PRs)   (Open bug backlogs)     (CPU/Memory/Latency)
             │                       │                       │
             └───────────────────────┼───────────────────────┘
                                     │
                                     ▼
                         ┌────────────────────────┐
                         │    Gemini AI Engine    │ (Flash/Pro Model Rotation)
                         └───────────┬────────────┘
                                     │
                                     ▼
                         ┌────────────────────────┐
                         │  Risk Score Calculator │ (Weight Analytics Formula)
                         └───────────┬────────────┘
                                     │
                                     ▼
                         ┌────────────────────────┐
                         │ MongoDB Atlas Cluster  │ (Incident RAG & Runbooks)
                         └────────────────────────┘
```

---

## ⚡ Core Features

1. **Pre-Deployment Risk Analyzer (`/analyze-release`)**
   - Automatically cross-references PR commits with active system loads (CPU, Memory, Latency) and open Jira bug logs.
   - Computes an interactive risk coefficient metric showing low, medium, or high outage probability.

2. **Incident Time Machine (`/explain-outage`)**
   - Reconstructs step-by-step chronology timelines of previous outages.
   - Leverages AI to explain cascading errors and auto-generate prevention autopsies.

3. **Canary Release Advisor (`/deployment-advice`)**
   - Evaluates microservice vulnerabilities and provides custom traffic split schedules (e.g. 10% → 25% → 50% → 100%) and health checks.

4. **Root Cause Analysis Scanner (`/investigate`)**
   - Simulates cluster log inspections, matching live Prometheus metrics with open blockers to identify the exact code trigger.

5. **Slack Agent Block Kit Simulator**
   - A real-time chat interface showing exactly how Sentinel interacts inside Slack using interactive message layouts, attachment cards, and custom action buttons.

---

## 🔒 Security & Data Masking Proxy Layer
Sentinel AI prioritizes data privacy. All outgoing metrics and inputs pass through a regex-based **Security Masker Proxy** that redacts:
- Secrets, passwords, and private auth tokens.
- IPv4 addresses and cluster subnets.
- Webhooks and Slack integration endpoints.

---

## 🧠 AI Workflow & Risk Score Formula

Sentinel AI computes release safety metrics using a weighted metric:

$$\text{Risk Score} = \text{Memory Load (25)} + \text{Jira Bugs (25)} + \text{Cluster Latency (25)} + \text{Historical Similarity (25)}$$

### Rotation Queue & Hackathon Fallback
To maximize uptime and handle API rate limits on free tiers:
- **Model Rotation:** Sequential pipeline connection attempting `gemini-2.5-flash` → `gemini-1.5-flash` → `gemini-1.5-pro`.
- **Integrated Fallback Key:** If no primary API key is specified, the server automatically injects the fallback API key configured in your environment variables.

---

## 📁 Directory Structure

```text
sentinel-ai/
├── dist/                   # Compiled backend Node/Express JavaScript
├── src/                    # Backend Source (TypeScript)
│   ├── server.ts           # Express endpoints, Slack middleware, & API routing
│   ├── slack.ts            # Slack Bolt events, slash commands, & GitHub MCP integrations
│   ├── database/
│   │   ├── mongo.ts        # MongoDB Atlas connector & collection seed scripts
│   │   ├── mockDb.ts       # Fallback local mock database
│   │   └── mockData.json   # Base seeder records
│   ├── ai/
│   │   └── geminiService.ts# Gemini LLM connection handling and API key rotation
│   └── utils/
│       ├── masking.ts      # Regex PII & Credentials redaction middleware
│       └── helpers.ts      # Analytical risk score calculator
├── frontend/               # Frontend Client SPA (Vite + React + TypeScript)
│   ├── src/
│   │   ├── App.tsx         # Central React application layout
│   │   ├── index.css       # Styling definitions & dark theme layout
│   │   └── main.tsx        # React entrypoint
│   ├── vite.config.ts      # Vite server configuration containing backend API proxies
│   └── package.json        # Frontend node packages
├── render.yaml             # Render cloud service deployment blueprint
├── .npmrc                  # Global npm configurations for peer-dependency handling
└── package.json            # Backend node packages
```

---

## 💬 Slack Bot Setup & Configuration

This project contains a fully operational Slack Bot that integrates directly into your workspace. It supports both **Socket Mode** and **HTTP Event Subscriptions** (via `/slack/events` routing).

### 1. Bot Scopes Required
In your [Slack App Dashboard](https://api.slack.com/apps), navigate to **OAuth & Permissions** -> **Bot Token Scopes** and add:
- `app_mentions:read` — Read channel mentions (`@Sentinel AI ...`)
- `channels:history` — Read public channel messages
- `chat:write` — Post messages and replies to threads
- `groups:history` — Read private channel messages
- `im:history` — Read direct messages (DMs)
- `im:write` — Send direct messages
- `mpim:history` — Read group direct messages

### 2. Event Subscriptions & Interactivity
- Enable **Event Subscriptions** and set the **Request URL** to:
  `https://your-render-app-url.onrender.com/slack/events`
  - Under **Subscribe to Bot Events**, select `app_mention`.
- Enable **Interactivity & Shortcuts** and set the **Request URL** to:
  `https://your-render-app-url.onrender.com/slack/events`

### 3. Register Slash Commands
Create the following commands in the Slack App Dashboard:

| Command | Usage Hint | Description |
| :--- | :--- | :--- |
| `/connect-repo` | `[owner/repo]` | Connect a GitHub repository to the Slack channel |
| `/ask-repo` | `[owner/repo] [question]` | Ask questions about any GitHub codebase |
| `/analyze-release` | `[version] [service=...]` | Run pre-deployment risk analyzer on connected repo |
| `/explain-outage` | `[query]` | Reconstruct timeline of previous incidents |
| `/deployment-advice`| `[service]` | Get canary split schedule recommendations |
| `/investigate` | `[service]` | Run root cause analysis diagnostics |

---

## 🔒 Mandatory Per-Channel Repository Connection (MCP Flow)

Sentinel AI requires a codebase context to run analysis and answer questions. It enforces a strict repository connection workflow:

1. **Connect First:** You must link a repository to the Slack channel before asking questions:
   - **Mention:** `@Sentinel AI connect repo owner/repo`
   - **Command:** `/connect-repo owner/repo`
2. **Context-Aware Answers:** Once connected, **every general query or chat** sent to the bot (e.g. `@Sentinel AI explain server.ts`) will automatically search the connected repository, read relevant source files using the GitHub API, and pass them as context to the Gemini AI.

---

## ⚙️ Local Development Setup

### Prerequisites
- Node.js (v18+)
- MongoDB Atlas cluster URL (or set local credentials)

### Environment Setup
Create a `.env` file in the root workspace folder:
```env
PORT=3000
MONGO_URI=your_mongodb_connection_string_here
FALLBACK_GEMINI_API_KEY=your_fallback_gemini_api_key_here
SLACK_BOT_TOKEN=your_slack_bot_token_here (starts with xoxb-)
SLACK_SIGNING_SECRET=your_slack_signing_secret_here
SLACK_APP_TOKEN=your_slack_app_token_here (starts with xapp-, optional for Socket Mode)
```

### Installation & Execution
1. Install dependencies for both project folders:
   ```bash
   # Install root backend dependencies (legacy peer deps required for Bolt Express compatibility)
   npm install --legacy-peer-deps
   
   # Install frontend dependencies
   cd frontend
   npm install
   cd ..
   ```
2. Build the React frontend SPA:
   ```bash
   npm run build
   ```
3. Run the development environment:
   - For backend hot-reload: `npm run dev`
   - For frontend dev server: `cd frontend && npm run dev`
4. Open `http://localhost:3000` to access the console.

---

## 🧪 Testing Demo vs Live Mode
- **Demo Mode (Default):** Runs metrics, git commit reviews, and timelines directly off the preloaded seeded databases inside MongoDB.
- **Live Mode:** Connect a public repository to fetch real commit history from GitHub. You can enter a custom Gemini API key or leave it blank to run queries through the internal fallback key structure.
