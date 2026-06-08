# Ragas sidecar

Real [Ragas](https://docs.ragas.io) metrics over HTTP. Lets the TypeScript
engine promote its evaluator from the deterministic *Ragas-shaped* stub to
**real Ragas** — without putting Python in the Next.js runtime.

```
Next.js engine ──POST /evaluate──▶ ragas-sidecar (FastAPI) ──▶ Ragas ──▶ OpenAI
   (RAGAS_URL set)                                    faithfulness, answer_relevancy,
                                                      context_precision/recall
```

## Run locally

```bash
cd ragas-sidecar
pip install -r requirements.txt
OPENAI_API_KEY=sk-... uvicorn main:app --port 8000
```

Or with Docker:

```bash
docker build -t ragas-sidecar .
docker run -p 8000:8000 -e OPENAI_API_KEY=sk-... ragas-sidecar
```

Then point the engine at it:

```
# .env.local (Next.js app)
RAGAS_URL=http://localhost:8000
```

With `RAGAS_URL` set and `FRAMEWORK_MODE=real`, the engine's evaluator reports
`mode: real` / framework `ragas (python sidecar)`. Unset it and the engine
falls back to the deterministic stub (honestly reported in `providerStatus`).

## API

`GET /health` → `{ ok, openai_key, model }`

`POST /evaluate`

```json
{
  "question": "...",
  "answer": "...",
  "contexts": ["retrieved chunk 1", "retrieved chunk 2"],
  "ground_truth": "optional reference answer"
}
```

→

```json
{
  "metrics": {
    "faithfulness":      { "score": 0.83, "explanation": "..." },
    "answer_relevancy":  { "score": 0.91, "explanation": "..." }
  },
  "skipped": { "context_precision": "no ground_truth provided" },
  "model": "gpt-4o-mini"
}
```

`context_precision` and `context_recall` are computed only when `ground_truth`
is supplied. Each metric is computed defensively — a single metric failure is
reported under `skipped`, never 500s the engine.

## Hosting

Vercel serverless cannot run Ragas (heavy native deps). Deploy this sidecar to
a container host (Railway, Render, Fly.io) and set `RAGAS_URL` in the Next.js
app's environment to its URL.
