"""
Ragas evaluation sidecar.

A small FastAPI service that runs real Ragas metrics so the TypeScript engine
can promote its evaluator from the deterministic Ragas-shaped stub to real
Ragas. The engine calls POST /evaluate when RAGAS_URL is set.

Metrics:
  - faithfulness        (no ground truth needed)
  - answer_relevancy    (no ground truth needed)
  - context_precision   (only when ground_truth is provided)
  - context_recall      (only when ground_truth is provided)

Ragas uses an OpenAI model under the hood, so OPENAI_API_KEY must be set in
the sidecar environment. Each metric is computed defensively: if one fails or
is unavailable for the given inputs, it is skipped rather than failing the
whole request.

Run locally:
    pip install -r requirements.txt
    OPENAI_API_KEY=sk-... uvicorn main:app --port 8000
"""

from __future__ import annotations

import os
from typing import Optional

from fastapi import FastAPI
from pydantic import BaseModel, Field

app = FastAPI(title="ragas-sidecar", version="0.1.0")


class EvaluateRequest(BaseModel):
    question: str
    answer: str
    contexts: list[str] = Field(default_factory=list)
    ground_truth: Optional[str] = None


class MetricResult(BaseModel):
    score: float
    explanation: str


class EvaluateResponse(BaseModel):
    metrics: dict[str, MetricResult]
    skipped: dict[str, str]
    model: str


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        "service": "ragas-sidecar",
        "openai_key": bool(os.environ.get("OPENAI_API_KEY")),
        "model": os.environ.get("RAGAS_LLM_MODEL", "gpt-4o-mini"),
    }


@app.post("/evaluate", response_model=EvaluateResponse)
def evaluate(req: EvaluateRequest) -> EvaluateResponse:
    # Imported lazily so /health works even if ragas is mid-install.
    from datasets import Dataset
    from ragas import evaluate as ragas_evaluate
    from ragas.metrics import answer_relevancy, faithfulness

    model = os.environ.get("RAGAS_LLM_MODEL", "gpt-4o-mini")
    contexts = req.contexts or [""]

    row: dict[str, object] = {
        "question": [req.question],
        "answer": [req.answer],
        "contexts": [contexts],
    }
    metrics = [faithfulness, answer_relevancy]
    skipped: dict[str, str] = {}

    # Ground-truth-dependent metrics only when ground_truth is present.
    if req.ground_truth:
        row["ground_truth"] = [req.ground_truth]
        try:
            from ragas.metrics import context_precision, context_recall

            metrics.extend([context_precision, context_recall])
        except Exception as exc:  # noqa: BLE001
            skipped["context_precision"] = f"import failed: {exc}"
            skipped["context_recall"] = f"import failed: {exc}"
    else:
        skipped["context_precision"] = "no ground_truth provided"
        skipped["context_recall"] = "no ground_truth provided"

    dataset = Dataset.from_dict(row)

    try:
        result = ragas_evaluate(dataset, metrics=metrics)
    except Exception as exc:  # noqa: BLE001
        # Surface a clean error per metric rather than 500ing the engine.
        return EvaluateResponse(
            metrics={},
            skipped={m.name: f"ragas error: {exc}" for m in metrics},
            model=model,
        )

    scores = result.to_pandas().iloc[0].to_dict()
    out: dict[str, MetricResult] = {}
    explanations = {
        "faithfulness": "Real Ragas: fraction of answer claims entailed by retrieved context.",
        "answer_relevancy": "Real Ragas: how directly the answer addresses the question.",
        "context_precision": "Real Ragas: signal-to-noise of retrieved context vs ground truth.",
        "context_recall": "Real Ragas: fraction of ground-truth covered by retrieved context.",
    }
    for key, explanation in explanations.items():
        value = scores.get(key)
        if value is None:
            skipped.setdefault(key, "not returned by ragas")
            continue
        try:
            out[key] = MetricResult(score=float(value), explanation=explanation)
        except (TypeError, ValueError):
            skipped.setdefault(key, f"non-numeric score: {value!r}")

    return EvaluateResponse(metrics=out, skipped=skipped, model=model)
