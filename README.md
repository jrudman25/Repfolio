# Repfolio

A full-stack, AI-powered GitHub portfolio manager. Repfolio automatically syncs your GitHub repositories, uses Google's Gemini AI to generate insightful project summaries, extracts your tech stack automatically, and provides a RAG-powered chatbot to let you converse with your codebase context.

## What It Does

1. **Connect with GitHub** — Sign in via GitHub OAuth using Supabase to grant access to your repositories.
2. **Auto-Sync Repositories** — Fetches your repositories via GitHub API (with Upstash Redis caching) and supports real-time sync via GitHub Webhooks.
3. **AI Project Summarization** — Uses Gemini 3.5 Flash (falling back to Gemini 3.1 Flash Lite) to analyze your README files, extract the core technologies used, and generate concise project summaries.
4. **Vector Knowledge Base** — Uses Gemini's `text-embedding-004` to generate vector embeddings for your repositories and stores them in Supabase `pgvector`.
5. **RAG Chatbot** — An integrated Chat UI powered by Gemini 3.1 Pro that can answer complex questions about your projects using vector similarity search.
6. **Task & Milestone Tracking** — Keep track of your individual project to-dos and milestones directly in the Repfolio dashboard.
7. **Rich Dashboard** — Sort by stars, recent updates, or alphabetical order. Easily visualize your tech stack with Devicons.

## Tech Stack

- **Frontend**: Next.js 15 (App Router), React 19, Tailwind CSS 4, Shadcn UI
- **Backend**: Next.js API Routes / Server Actions
- **Database**: Supabase (PostgreSQL + `pgvector`)
- **Authentication**: Supabase Auth (GitHub Provider)
- **AI Models**: Google Gemini (3.5 Flash, 3.1 Flash Lite, 3.1 Pro, text-embedding-004)
- **Caching**: Upstash Redis
- **Testing**: Vitest

## Getting Started

### Prerequisites

- A Supabase Project (with `vector` extension enabled)
- A Google Gemini API Key
- An Upstash Redis REST URL and Token
- A GitHub OAuth App (configured in Supabase)

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy the environment variables:
   ```bash
   cp .env.local.example .env.local
   ```
   Fill in your API keys in `.env.local`.

3. Setup the Database Schema:
   Execute the `supabase/setup.sql` and `supabase/functions.sql` files in your Supabase SQL Editor.

4. Start the development server:
   ```bash
   npm run dev
   ```

## Testing

Repfolio uses [Vitest](https://vitest.dev/) for unit testing.
To run the test suite:

```bash
npm run test
```

## License
MIT
