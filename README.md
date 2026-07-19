# AI Knowledge Hub

Upload documents, ask questions about them, and trace every answer back to the exact
passage it came from. Retrieval-augmented generation over Postgres + pgvector.

## How it works

```
upload → extract text → chunk → embed → store in pgvector
                                              ↓
question → embed → cosine search (HNSW) → top-k passages → LLM → answer + citations
```

Every answer carries the passages that produced it, each with its cosine similarity.
Expanding a citation shows the passage verbatim — the same text the model was given —
so a claim can be checked rather than trusted.

## Accounts

Every account gets its own workspace. Documents, guides and conversations are
scoped to it — there is no ambient "current workspace", every query filters by the
signed-in user's. The first account to sign up becomes the admin and adopts any
data created before accounts existed.

Sessions are a random 256-bit token in an httpOnly cookie; the database stores only
its SHA-256, so a leaked dump can't be replayed as a live session. Passwords are
scrypt with a per-user salt. No auth dependency — it's `node:crypto`.

## Two modes

**Ask** (`/`) — strictly grounded. Answers come only from retrieved passages; if
nothing clears the distance cutoff, it says so instead of guessing.

**Learn** (`/learn`) — name a topic and get a 32-section study guide: mechanics,
worked code commented line by line, comparison tables, ASCII diagrams, interview
questions, a revision sheet, then an interactive quiz (10 MCQs with explanations,
5 short answers, a coding challenge). Where the library covers the topic the guide
teaches from it and cites the passage; the rest is general knowledge, so a guide
works on an empty library too.

### What you can upload

PDF, Word, PowerPoint, Excel, OpenDocument, RTF, CSV, HTML, EPUB, plain text and
Markdown — plus **images** (PNG, JPG, WebP, GIF). An image has no text layer, so a
vision model transcribes it: text verbatim, charts described with their values.
That transcription is chunked and embedded like any other document, which makes a
screenshot or a photographed page fully searchable and citable.

Documents are summarised on upload — 2–3 sentences, key topics, and a **point-form
breakdown** of what the document actually says, all shown in the library. Anything indexed before that feature existed can be summarised on demand
from the library list. Conversations export as Markdown or JSON, with the retrieved
passages embedded so an answer stays checkable after it leaves the app.

Admins get `/admin`: instance totals, per-account usage, recent activity, and any
failed ingestions.

## Stack

| Layer      | Choice                                          |
| ---------- | ----------------------------------------------- |
| Framework  | Next.js 16 (App Router), TypeScript             |
| Database   | Postgres + pgvector (HNSW, cosine)              |
| Embeddings | OpenAI `text-embedding-3-small` (1536 dims)     |
| Generation | OpenAI `gpt-4o-mini`, streamed as NDJSON        |
| Parsing    | `unpdf` (PDF), `mammoth` (DOCX), `officeparser` (PPTX/XLSX/CSV/RTF/ODF/HTML/EPUB), `gpt-4o` vision (images) |
| Styling    | Tailwind v4                                     |

## Setup

Requires Postgres with the pgvector extension. On macOS with Homebrew Postgres 16,
the `pgvector` bottle only ships builds for 17/18, so it has to be compiled:

```bash
git clone --branch v0.8.0 --depth 1 https://github.com/pgvector/pgvector.git
cd pgvector
PG_CONFIG=/opt/homebrew/opt/postgresql@16/bin/pg_config make
PG_CONFIG=/opt/homebrew/opt/postgresql@16/bin/pg_config make install
```

Then:

```bash
createdb ai_knowledge_hub
npm install
cp .env.example .env.local     # add your OPENAI_API_KEY
npm run db:setup               # tables, indexes, default workspace
npm run dev
```

Open http://localhost:3000, add a document, and ask it something.

## Layout

```
db/schema.sql                  tables, HNSW index, default workspace
db/002_auth.sql                accounts, sessions, workspace ownership, summaries
src/proxy.ts                   signed-out redirect (Next 16 renamed Middleware to Proxy)
src/lib/auth.ts                scrypt hashing, hashed session tokens, getCurrentUser
src/lib/extract.ts             file bytes → text segments (PDF keeps page numbers)
src/lib/chunk.ts               paragraph-aware chunking, 1400 chars with 200 overlap
src/lib/openai.ts              lazy client, batched embeddings
src/lib/ingest.ts              the write path, transactional
src/lib/retrieve.ts            vector search with a distance cutoff
src/app/api/documents/         upload, list, delete
src/app/api/chat/              retrieve → stream answer → persist with citations
src/app/api/conversations/     chat history
src/lib/learn.ts               the 32-section guide prompt, quiz schema, answer shuffle
src/app/api/learn/             three-pass guide generation, then the quiz
src/app/api/guides/            saved guides
src/app/learn/page.tsx         Learn mode
src/components/SourceStrip.tsx citations with similarity scores
src/components/QuizView.tsx    interactive quiz
scripts/check-pipeline.ts      extract + chunk a file without calling OpenAI
```

## Design notes

**Chunking.** 1400 characters (~350 tokens) on paragraph boundaries, with 200
characters of overlap so a fact split across a seam still lands in one chunk whole.

**Global questions don't come from vector search.** Top-k retrieval answers local
questions ("what happened to Kestrel-7") but fails on global ones ("what is this
document about", "summarise it"): a global question has no topical content to match,
so it either clears no chunk at all or returns arbitrary fragments. Every chat turn
therefore gets two things — the retrieved passages *and* a library overview built
from the summaries written at ingest time. Detailed questions cite passages with a
similarity score; overview answers cite the document and show no score, because they
came from a stored summary rather than a vector match.

**The distance cutoff matters.** Retrieval discards anything past 0.75 cosine
distance. Without it, an off-topic question still returns the eight least-bad chunks
and the model tries to answer from noise. With it, the app says it doesn't know —
the correct answer, and a better demo than a confident wrong one.

**HNSW over IVFFlat.** IVFFlat needs training against an existing corpus and degrades
as the table grows past what it was trained on. HNSW needs no training, which suits a
library built one upload at a time.

**A study guide is written in three passes, not one.** Asked for all 32 sections in
a single call, the model rations its effort and every section lands at two thin
sentences — the token ceiling is never the binding constraint, terseness is. Three
focused calls roughly doubled the depth on the same topic (11.5k → 27k characters).
They run sequentially: launching them together and consuming them in order leaves
the later streams idle until the connection is terminated, and draining them
concurrently needs a polling forwarder to keep reading order — a lot of machinery
to save ~20s on a request that already takes ~50s.

**Quiz answer positions are shuffled server-side.** Models cluster the correct
option near the top; one generated set never marked the last option correct at all,
which teaches "never pick D" instead of the subject. A Fisher–Yates shuffle after
generation makes position carry no information.

**officeparser needs an explicit `fileType` hint.** CSV, HTML and RTF have no magic
bytes, so buffer auto-detection throws on exactly the formats a user is most likely
to paste in. The extension is passed through on every call.

**Formulas are plain Unicode, not LaTeX.** There is no math renderer, so `\frac`
and `\text` reach the page as literal backslashes. The prompt requires
`cos(θ) = (A · B) / (||A|| × ||B||)` inside a text fence instead.

**Auth checks live in route handlers, not the proxy.** `src/proxy.ts` only tests
that a session cookie exists, and redirects signed-out visitors to `/login`. Every
API route independently resolves the user against the database and filters by their
workspace, so a forged cookie gets nothing — the Next docs are explicit that Proxy
is for optimistic checks, not session management. Cross-account reads and deletes
return 404 rather than 403, so an id probe can't confirm a record exists.

**Ingestion is awaited, not backgrounded.** Serverless runtimes freeze the instance
once a response is sent, which would strand a job mid-embedding. The `documents.status`
column still tracks `processing` / `ready` / `failed`, so moving to a queue later is a
localized change.

## Not built yet

Multiple workspaces per account — the schema supports it (workspaces have an owner
and everything hangs off a workspace id), but the UI only ever uses a user's first
one. Also: password reset, email verification, and admin actions beyond viewing
(no promoting or removing accounts from `/admin` yet).

The conversation history API exists (`GET /api/conversations`), but the UI doesn't
load past threads yet — each page load starts a new one.
