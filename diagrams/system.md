# System Diagram

```mermaid
flowchart LR
    U[User] --> UI[Next.js UI]
    UI --> ORC[Orchestrator API\nNode + tRPC]
    ORC <--> DB[(Postgres\n+ pgvector)]
    ORC <--> OBJ[(Object Store)]
    ORC --> RUN[Python Runner\nFastAPI]
    RUN --> LLM[LiteLLM Gateway]
    RUN --> EMB[Embedder host\nModal/Replicate]
    RUN --> RRK[Reranker host\nCohere/BGE]
    ORC --> EVALW[Eval Workers]
    EVALW --> LLM
```

## Sequence: Side-by-side run

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant UI
    participant API as Orchestrator
    participant R as Python Runner
    participant DB as Postgres
    participant E as Eval Workers

    U->>UI: select 3 pipelines + GT set "support-qa v1.1"
    UI->>API: POST /runs (pipeline_ids, gt_set_id)
    API->>DB: create Run + 3×25 pending RunResults
    par for each pipeline
      API->>R: execute pipeline on all 25 queries
      R->>DB: persist retrieved chunks, context, output, cost, latency
    end
    API->>E: enqueue eval jobs (faithfulness, recall, judge)
    E->>DB: persist metric scores
    API-->>UI: stream progress; render comparison view
```

## Pipeline execution detail

```mermaid
flowchart LR
    Q[Query] --> CHK[Chunk cache lookup]
    CHK -->|miss| CHUNK[Chunker]
    CHK -->|hit| RET
    CHUNK --> EMB[Embedder cache lookup]
    EMB -->|miss| EMBED[Embedder]
    EMB -->|hit| RET
    EMBED --> RET[Retriever]
    RET --> RR{Reranker?}
    RR -->|yes| RRK[Reranker] --> CTX
    RR -->|no| CTX[Final context]
    CTX --> GEN[Generator]
    GEN --> OUT[Output + trace]
```
