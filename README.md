# AnalyticsForge 📊

> AI-powered SQL & Python analytics practice platform — LeetCode-style, running 100% locally on your Mac.

## Features

### Python Practice (NEW)

- SQL | Python mode switch with distinct UI themes (amber SQL / blue Python)
- Function-based Python problems with hidden test cases
- Topics: Python Basics, Data Analysis, Analytics Engineering, Data Science
- Sandboxed execution (stdlib + pandas + numpy, 30s timeout)
- Same generation, analytics, hints, and editorial flows as SQL

### Problem Generation

- Single, batch (up to 50), and adaptive SQL problem generation
- Asynchronous generation jobs with live progress and elapsed time
- Topic, difficulty, SQL dialect, and pinned-constraint controls
- Natural-language adaptive generation requests (for targeted practice)
- Dataset-aware generation with bundled dataset context
- Automatic problem self-vetting with hidden-test and expected-output auto-fixes
- QC audit to validate editorial solutions across visible + hidden test cases
- Problem flagging workflow for review/regeneration

### LLM Orchestration

- Local + cloud LLM support: Ollama, LM Studio, Cerebras, Groq, Google AI Studio, OpenRouter
- Per-profile API key management and local model selection
- Provider health checks and local model auto-detection
- Dynamic fallback chain with cooldowns, rate-limit handling, and retries
- Live provider status (online/offline, in-use, cooldown) in the app shell
- Local-only chain for AI assistant workflows
- AI assistant sidebar with quick prompts, chat history, and recommendation-to-generation flow

### SQL Practice Experience

- Three-pane workspace: problem list, problem detail, and Monaco SQL editor
- Multi-dialect execution (MySQL, PostgreSQL, SQLite) in an isolated DuckDB sandbox
- Run vs Submit flows with hidden test-case evaluation
- Detailed per-test-case failure breakdown (expected vs actual outputs)
- Progressive hint reveal
- Editorial tab with multi-approach solutions (time/space complexity)
- Editorial lock until problem is solved
- Submission history with optional LLM wrong-answer explanation
- Personal notes with autosave
- Bookmarking and personal difficulty rating

### Analytics And Coaching

- Dashboard metrics: solved/attempted/submissions, acceptance rate, average solve time
- Difficulty breakdown and topic-level accuracy
- Weak-area and strong-area analysis
- Submission activity heatmap
- Weekly improvement trend
- Streak tracking (current, longest, total active days)
- Adaptive generation guided by weakness analysis
- Cross-profile leaderboard (rank, solved count, streak, accuracy)

### Profiles, Settings, And Integrations

- Local-only multi-profile onboarding (no passwords)
- Profile switching, creation, deletion, and analytics reset
- Theme toggle (dark/light)
- Configurable notification time and streak reminders
- LLM settings management per profile
- Optional Kaggle credentials + dataset search endpoint
- Bundled dataset catalog endpoint + CSV upload-to-schema endpoint
- Problem export to Markdown and PDF (with optional submission + notes)
- FastAPI docs and health endpoints (`/api/docs`, `/api/health`)

## Tech Stack

- **Backend**: Python 3.11+ / FastAPI / DuckDB / SQLite
- **Frontend**: React 18 / TypeScript / Monaco Editor / Tailwind CSS
- **LLM**: Ollama + LM Studio (local) / Cerebras / Groq / Google AI Studio / OpenRouter

---

## Installation

### Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| Python | 3.11 | [python.org](https://www.python.org/downloads/) |
| Node.js | 18 | [nodejs.org](https://nodejs.org/) |
| npm | 9 | bundled with Node.js |

At least one LLM provider is required to generate problems:

- **Local (free)**: [Ollama](https://ollama.ai) or [LM Studio](https://lmstudio.ai)
- **Cloud**: API key from [Cerebras](https://cloud.cerebras.ai), [Groq](https://console.groq.com/keys), [Google AI Studio](https://aistudio.google.com/app/apikey), or [OpenRouter](https://openrouter.ai/keys)

---

### Quick Start (recommended)

The launcher script handles everything — virtualenv, dependencies, frontend build, and server startup.

```bash
git clone https://github.com/bondalavishal/queryforge.git
cd queryforge
python start.py
```

On first run this will:
1. Create a Python virtual environment (`venv/`)
2. Install backend dependencies from `requirements.txt`
3. Install frontend npm packages
4. Build the frontend into `backend/static/`
5. Start the FastAPI server at **http://localhost:8000**

The browser opens automatically when the server is ready.

---

### Manual Setup

If you prefer to run the frontend dev server separately (e.g. for hot-reload during development):

**1. Backend**

```bash
cd queryforge

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# Install dependencies
pip install -r backend/requirements.txt

# Start the API server
cd backend
uvicorn app.main:app --reload --port 8000
```

**2. Frontend** (new terminal)

```bash
cd queryforge/frontend

# Install packages
npm install

# Dev server with hot-reload (proxies API to localhost:8000)
npm run dev
```

Open **http://localhost:5173** for the dev frontend, or **http://localhost:8000** for the production build served by FastAPI.

**3. Build frontend for production**

```bash
cd queryforge/frontend
npm run build          # outputs to ../backend/static/
```

---

### LLM Configuration

After the app starts, go to **Settings → LLM Configuration**:

- **Cloud providers** — paste your API key and click *Save API Keys*
- **Ollama** — click *Auto-detect & test Ollama*; select a model from the dropdown that appears
- **LM Studio** — start LM Studio with a model loaded, then click *Auto-detect & test LM Studio*

Provider selection is dynamic at runtime: QueryForge prefers the most recently successful provider (or starts with OpenRouter), then falls back through the configured list while honoring provider cooldowns.

#### Recommended free setup (fully local)

```bash
# Install Ollama
brew install ollama          # macOS
ollama pull llama3.2        # or any model >= 7B
ollama serve
```

Then open QueryForge Settings and auto-detect Ollama.

---

### Optional: Kaggle Integration

To search and import Kaggle datasets as problem schemas:

1. Go to [kaggle.com/settings](https://www.kaggle.com/settings) → API → *Create New Token*
2. In QueryForge Settings → Kaggle Integration, enter your username and API key

---

## Project Structure

```
queryforge/
├── backend/
│   ├── app/
│   │   ├── routers/        # FastAPI route handlers
│   │   ├── services/       # LLM, SQL execution, analytics
│   │   ├── db/             # SQLAlchemy models
│   │   ├── llm/            # Provider clients + fallback chain
│   │   └── core/           # Config, database session
│   ├── data/               # Bundled datasets
│   ├── static/             # Built frontend (generated)
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── pages/          # Top-level page components
│   │   ├── store/          # Zustand state
│   │   ├── types/          # TypeScript interfaces
│   │   └── utils/          # API client
│   └── package.json
├── start.py                # One-command launcher
└── queryforge.db           # SQLite database (auto-created)
```

---

## Troubleshooting

**Port 8000 already in use**
```bash
lsof -ti:8000 | xargs kill -9
python start.py
```

**`npm: command not found`**
Install Node.js from [nodejs.org](https://nodejs.org/) and restart your terminal.

**Ollama models not showing**
Make sure `ollama serve` is running before clicking *Auto-detect* in Settings.

**Problems not generating**
Check Settings → LLM Configuration — at least one provider must show a green checkmark or "Saved" status.
