# THEORY: RAG Memory Playground

> Theoretical foundation for a system combining Retrieval-Augmented Generation
> with persistent memory for LLM agents. Every claim is grounded in peer-reviewed
> papers, arXiv preprints, or authoritative technical sources. Quoted material is
> short (< 15 words) and in quotation marks to comply with fair-use citation norms.

**Project:** rag-memory-playground
**Status:** Theoretical reference (v1.0)
**Last verified:** 2026-05-22

---

## Table of Contents

1. [RAG Foundations](#1-rag-foundations)
2. [Memory Architectures for LLM Agents](#2-memory-architectures-for-llm-agents)
3. [Vector Retrieval Theory](#3-vector-retrieval-theory)
4. [Memory Taxonomies](#4-memory-taxonomies)
5. [Evaluation](#5-evaluation)
6. [Open Problems and Failure Modes](#6-open-problems-and-failure-modes)
7. [Synthesis: Design Principles for the Playground](#7-synthesis-design-principles-for-the-playground)
8. [References](#references)

---

## 1. RAG Foundations

### 1.1 The Original RAG Paper (Lewis et al., 2020)

The foundational paper that coined the "RAG" term was published by Lewis et al.
at NeurIPS 2020. The model combines a pre-trained sequence-to-sequence model
(BART) as the parametric memory with a non-parametric dense vector index of
Wikipedia (accessed via DPR) [1].

The authors argue that parametric LMs alone are limited: their goal is to build
"models which combine pre-trained parametric and non-parametric memory" [1].
Two variants are introduced: **RAG-Sequence** (one retrieved document conditions
the entire generation) and **RAG-Token** (a different document can be used per
token). RAG achieved state-of-the-art on Natural Questions, TriviaQA, and
WebQuestions at the time, "generating more specific and factual" output than
parametric-only baselines [1].

### 1.2 REALM (Guu et al., 2020)

REALM, published two months before Lewis et al., is the first work to integrate
retrieval *during pre-training*. The retriever is trained jointly with masked
language modeling — the LM's signal is a gradient back-propagated through the
top-k retrieved documents [2].

REALM "outperforms all previous methods by a significant margin (4–16% absolute
accuracy)" on Open-domain QA, "while providing qualitative benefits such as
interpretability and modularity" [2]. The key innovation is **latent retrieval**:
the retriever is a learnable component, not a frozen BM25 index.

### 1.3 DPR — Dense Passage Retrieval (Karpukhin et al., 2020)

DPR demonstrated that dense bi-encoder representations alone can outperform
strong sparse baselines for open-domain QA [3]. Two BERT encoders are trained
with in-batch negatives to map questions and passages to a shared embedding
space; relevance is cosine similarity.

The dense retriever "outperforms a strong Lucene-BM25 system by 9%–19% absolute
in terms of top-20 passage retrieval accuracy" [3]. DPR's dual-encoder framework
became the dominant template for dense retrieval components in modern RAG
pipelines, including Lewis et al.'s RAG itself.

### 1.4 Fusion-in-Decoder — FiD (Izacard & Grave, 2021)

FiD addresses how retrieved passages are consumed by the generator. Each
question-passage pair is encoded independently by the T5 encoder; the decoder
then attends jointly across the concatenated encoder outputs [4].

The key finding: "the performance of the method significantly improves when
increasing the number of retrieved passages" [4]. This decoupling — independent
encoding, joint decoding — became the standard architecture for multi-passage
RAG generation and was a precursor to later long-context techniques.

### 1.5 Atlas (Izacard et al., 2022)

Atlas extends RAG to **few-shot learning regimes**. The retriever (Contriever)
and reader (T5-based with FiD-style fusion) are pre-trained jointly using
multiple unsupervised retrieval losses [5].

Atlas "reaches over 42% accuracy on Natural Questions using only 64 examples,
outperforming a 540B parameters model by 3% despite having 50x fewer
parameters" [5]. This demonstrated that retrieval can substitute for parametric
scale — a key economic argument for RAG in resource-constrained deployments.

### 1.6 Self-RAG (Asai et al., 2023)

Self-RAG introduces **reflection tokens** that allow a single fine-tuned LM to
decide adaptively (a) whether to retrieve, (b) which passages are relevant,
and (c) whether its own generation is supported by them [6].

The model is trained on traces produced by a critic LLM. "Self-RAG (7B and 13B
parameters) significantly outperforms state-of-the-art LLMs and retrieval-
augmented models on diverse tasks" [6]. Self-RAG addresses the rigidity of fixed
top-k retrieval — sometimes retrieval hurts (when the LM already knows the
answer with high confidence).

### 1.7 Corrective RAG — CRAG (Yan et al., 2024)

CRAG adds a lightweight **retrieval evaluator** that scores the quality of
retrieved documents and triggers web search as a fallback when retrieval
quality is judged inadequate [7].

The authors note that RAG "relies heavily on the relevance of retrieved
documents" — CRAG explicitly assesses that relevance with a T5-based evaluator
and falls back to "large-scale web searches" when confidence is low [7]. The
mechanism includes a decompose-and-recompose algorithm that filters noisy
strips inside retrieved documents.

### 1.8 RAG vs. Long-Context LLMs

With context windows reaching 1M–10M tokens (Gemini 1.5/2, Claude 3.5), the
question arose: is retrieval still necessary?

Li et al. (2024) conducted a comprehensive comparison and found that "when
resourced sufficiently, LC consistently outperforms RAG in terms of average
performance" but "RAG's significantly lower cost remains a distinct
advantage" [8]. They propose **Self-Route**, routing queries to LC or RAG
based on model self-reflection.

A complementary study by Yu et al. (2025) on Long Context vs. RAG revisits the
question and finds the picture more nuanced — RAG is preferred for specific
fact-lookup, LC for synthesis across many sources [9]. The practical takeaway
for the playground: **a hybrid router is the strongest baseline**.

### 1.9 The Closed-Book Baseline (Roberts et al., 2020)

Before designing any retrieval system, it is worth knowing what the model
already knows. Roberts et al. demonstrated that "neural language models trained
on unstructured text can implicitly store and retrieve knowledge" simply by
fine-tuning — closed-book T5-11B reached competitive QA performance without
any retrieval [10]. This sets the floor: RAG is only worth its cost when its
gains exceed parametric-memory baselines.

### 1.10 Survey Reference

Gao et al. (2023) provide the most-cited survey of RAG, organising the
literature into **Naive RAG**, **Advanced RAG**, and **Modular RAG** paradigms
[11]. Useful as a top-down map of the design space.

---

## 2. Memory Architectures for LLM Agents

### 2.1 MemGPT — Virtual Context Management (Packer et al., 2023)

MemGPT explicitly draws an analogy with operating-system memory hierarchies. It
introduces "virtual context management, a technique drawing inspiration from
hierarchical memory systems in traditional operating systems" [12].

The architecture has two tiers: **main context** (in-window) and **external
context** (out-of-window archival storage). The LLM itself emits function calls
to page data between tiers. Critically, the LM can edit its own working memory
via tool calls — the foundation of the **self-editing memory** paradigm.

### 2.2 Generative Agents (Park et al., 2023)

Park et al.'s generative-agent architecture is the most influential
non-OS-inspired memory design. It has three pillars [13]:

1. **Memory stream** — append-only natural-language log of observations.
2. **Reflection** — periodic LLM-driven synthesis producing higher-level insights
   that themselves enter the memory stream.
3. **Retrieval** — weighted combination of three signals.

The retrieval scoring formula is:
```
score = α_recency · recency + α_importance · importance + α_relevance · relevance
```
where recency uses an exponential decay since last access, importance is an
LLM-assigned 1–10 score, and relevance is embedding cosine similarity. In the
paper, all three α = 1 [13].

This three-factor scoring is the most-copied memory heuristic in agent
implementations.

### 2.3 A-MEM — Agentic Memory (Xu et al., 2024/2025)

A-MEM applies the **Zettelkasten** knowledge-management method to LLM memory.
Each new memory becomes a "note" with contextual descriptions, keywords, and
tags; existing notes are linked dynamically through LLM-driven analysis [14].

This produces a graph-structured memory rather than a flat embedding store.
The system can refactor links when new observations contradict or extend old
ones — addressing one of the central failures of vector-only memory:
**memories that are semantically similar but factually contradictory**.

### 2.4 MemoryBank (Zhong et al., 2023)

MemoryBank introduces a forgetting mechanism inspired by Ebbinghaus.
"MemoryBank incorporates a memory updating mechanism inspired by the Ebbinghaus
Forgetting Curve theory" [15] — older memories decay unless reinforced through
repeated access. This bridges cognitive science (Section 4) and practical
memory engineering: memories are not just stored, they fade and reinforce.

### 2.5 HippoRAG (Gutiérrez et al., 2024)

HippoRAG draws on the **hippocampal indexing theory** of human long-term
memory. Wikipedia-scale knowledge becomes a graph; queries trigger
**Personalized PageRank** over this graph from query-anchored entities [16].

The authors describe HippoRAG as orchestrating "LLMs, knowledge graphs, and the
Personalized PageRank algorithm to mimic the different roles of neocortex and
hippocampus" [16]. Empirically, HippoRAG outperforms strong RAG baselines on
multi-hop QA (e.g., MuSiQue, 2WikiMultiHopQA) — the regime where simple
top-k retrieval fails.

### 2.6 Reflexion (Shinn et al., 2023)

Reflexion is not a memory store but a **reinforcement-via-reflection** loop.
After each task attempt, the agent generates a textual self-critique that is
stored in an **episodic memory buffer** and prepended to its next attempt [17].

"Reflexion converts binary or scalar feedback from the environment into verbal
feedback in the form of a textual summary" [17]. This is a lightweight form of
procedural memory: the agent learns *how* to handle similar tasks without any
parameter updates.

### 2.7 Letta (a.k.a. MemGPT in production)

Letta is the commercial / open-source descendant of MemGPT, productionizing
stateful agents whose context windows are managed by the LM itself [18].
Memory is split into **core memory** (fixed-size scratchpad-like blocks),
**archival memory** (vector store), and **recall memory** (conversation
history). The architecture standardises the operating-system analogy and is a
useful reference design for the playground.

### 2.8 Summary Table

| System | Key idea | Memory shape | Adaptation |
|---|---|---|---|
| MemGPT [12] | OS-inspired tiered context | Hierarchical (main/external) | Self-paging |
| Generative Agents [13] | Recency × importance × relevance | Flat stream + reflections | LLM reflection |
| A-MEM [14] | Zettelkasten note-linking | Graph | Dynamic re-linking |
| MemoryBank [15] | Forgetting curve | Flat + decay | Time-based forgetting |
| HippoRAG [16] | Hippocampal index + PageRank | Knowledge graph | Indexing pass |
| Reflexion [17] | Verbal RL | Episodic critique buffer | Per-trial critique |
| Letta [18] | Stateful agent OS | Core / archival / recall | LM-driven |

---

## 3. Vector Retrieval Theory

### 3.1 Dense Embeddings — SBERT (Reimers & Gurevych, 2019)

Sentence-BERT introduced siamese fine-tuning of BERT with cosine-similarity
loss, producing fixed-size vectors usable for fast nearest-neighbour search.
SBERT "reduces the effort for finding the most similar pair from 65 hours
with BERT/RoBERTa to about 5 seconds" [19], a four-orders-of-magnitude
improvement that made dense retrieval practical at scale.

### 3.2 E5 (Wang et al., 2022)

E5 is a family of contrastively pre-trained text embeddings. Trained on the
**CCPairs** dataset of weakly supervised text pairs, E5 was "the first model
that outperforms the strong BM25 baseline on the BEIR retrieval benchmark
without using any labeled data" [20]. The E5-base / E5-large / E5-mistral
variants are common defaults in modern RAG stacks.

### 3.3 BGE (Xiao et al., 2023)

BGE (BAAI General Embedding) and its C-Pack family are an alternative
high-quality embedding family. BGE-M3 (Xiao et al., 2023) supports dense,
multi-vector, and sparse retrieval modes in a single model and "outperform[s]
all prior Chinese text embeddings on C-MTEB by up to +10% at the time of
release" [21].

### 3.4 HNSW — Hierarchical Navigable Small World (Malkov & Yashunin, 2018)

HNSW is the dominant ANN index for production RAG systems (used by FAISS,
Qdrant, Weaviate, Pinecone variants). It builds a multi-layer proximity graph
where each layer is a navigable small-world graph over a sample of the data.

Malkov & Yashunin show HNSW achieves "logarithmic complexity scaling" of search
time with dataset size, while consistently outperforming alternatives on
recall-vs-latency Pareto fronts [22]. Key tunable parameters: `M` (max
neighbours per node), `ef_construction` (build-time beam width),
`ef_search` (query-time beam width).

### 3.5 ScaNN — Anisotropic Vector Quantisation (Guo et al., 2020)

Google's ScaNN improves on inverted-file / product-quantisation indexes by
introducing an **anisotropic quantisation loss** that more aggressively
penalises errors in the direction parallel to a vector's residual [23].
The result: "ScaNN... enables outperforming other vector similarity search
libraries by a factor of two, as measured on ann-benchmarks.com" [23].
Useful when memory budget is tight or vectors are very high-dimensional.

### 3.6 ColBERT — Late Interaction (Khattab & Zaharia, 2020)

ColBERT departs from the single-vector bi-encoder paradigm. Each document is
represented by *multiple* contextual token vectors; relevance is computed at
query time as a MaxSim operation between query tokens and document tokens
[24]. This **late interaction** preserves fine-grained matching signals lost
by single-vector pooling, at the cost of larger indexes.

ColBERTv2 / PLAID (Santhanam et al., 2022) reduce storage 6–10x via
quantisation, making late interaction practical at web scale.

### 3.7 Sparse / BM25 (Robertson & Zaragoza, 2009)

BM25 — the Okapi probabilistic ranking function — remains a strong baseline,
particularly for keyword-heavy or domain-specific corpora where dense
embeddings have not been adapted. Robertson and Zaragoza's monograph remains
the canonical reference for the probabilistic relevance framework [25].
Modern RAG systems often combine BM25 with dense retrieval (hybrid search).

### 3.8 Hybrid Retrieval and Reranking

A common pattern: top-N candidates from a fast index (dense bi-encoder + BM25)
are re-scored by a slow cross-encoder reranker (e.g., bge-reranker, Cohere
Rerank, monoT5). The cross-encoder concatenates query and document and applies
full self-attention — analogous to ColBERT's late interaction but even more
expressive (and even more expensive).

Reference patterns and tooling are described in the modular-RAG section of
Gao et al.'s survey [11] and in the empirical "best practices" study of Wang
et al. (2024) [26].

### 3.9 Chunking Strategies

Wang et al. (2024) evaluate chunking choices across whole pipelines and report
that the chunking sub-system materially affects end-to-end accuracy [26].
A systematic 2025 follow-up by the long-document community concluded that
"smaller chunks (64–128 tokens) are optimal for datasets with concise,
fact-based answers, whereas larger chunks (512–1024 tokens) improve retrieval
in datasets requiring broader contextual understanding" [27]. Overlap appears
to give little benefit at modest extra indexing cost; sentence-level and
semantic chunking are typically near-optimal at low cost [28].

Key design dials:
- **Chunk size** (tokens)
- **Overlap** (% of chunk size)
- **Boundary policy** (token / sentence / semantic / structural)
- **Multi-granularity** (small chunk for retrieval, parent for context — "small-to-big")
- **Metadata** (title, section, source, timestamp)

---

## 4. Memory Taxonomies

### 4.1 Tulving's Episodic / Semantic Distinction (1972, 1985)

Endel Tulving introduced the episodic / semantic distinction in 1972 [29] and
refined it in 1985's "Memory and Consciousness" [30]. The conventional summary:

- **Episodic memory** — autobiographical, contextualised, "I had coffee with X
  on Tuesday".
- **Semantic memory** — general knowledge, decontextualised, "coffee contains
  caffeine".

Tulving later added **procedural memory** (how to ride a bike) and developed a
multiple-memory-systems theory. The distinction maps cleanly onto agent
architectures:

| Human memory | Agent analogue |
|---|---|
| Episodic | Conversation logs, task traces (Generative Agents memory stream) |
| Semantic | Knowledge graphs, fact stores, document corpora |
| Procedural | Tool descriptions, skill / workflow memory (Reflexion-style) |
| Working | LLM context window |

### 4.2 Ebbinghaus Forgetting Curve (1885)

Hermann Ebbinghaus's 1885 monograph *Über das Gedächtnis* introduced the
**forgetting curve**: memory retention decays roughly logarithmically with
time, with the rate slowed by repeated rehearsal (the "spacing effect") [31].
MemoryBank [15] is a direct application: weight each memory by an exponential
decay term, refreshed on access.

### 4.3 Working / Short-Term / Long-Term Memory in Agents

The canonical multi-store model (Atkinson & Shiffrin, 1968) — sensory, short-
term, long-term — maps to agent systems as:

- **Sensory / observation buffer** — current tool outputs, raw inputs.
- **Working memory** — current LLM context window (limited by the model's
  token budget).
- **Long-term memory** — external vector store, knowledge graph, or
  database.

The MemGPT paper makes this explicit by analogy with the OS memory hierarchy
[12]. Zhang et al.'s 2024 survey of LLM-agent memory [32] uses a similar
short-term / long-term split and surveys how the literature instantiates each.

### 4.4 The Memory-Mechanism Survey (Zhang et al., 2024)

Zhang et al. published a comprehensive survey of memory mechanisms in
LLM-based agents in April 2024 [32]. The survey argues that memory is "the key
component to support agent-environment interactions" and organises the field
along three axes: **sources** (what is stored), **forms** (how it is stored),
and **operations** (read / write / forget / consolidate). The accompanying
repository tracks ongoing work and is a useful entry point [32].

### 4.5 Memory Consolidation

Cognitive neuroscience uses the term "consolidation" for the slow transformation
of recent memories into stable long-term representations. In LLM-agent
architectures, the analogous process is **reflection** (Generative Agents [13]),
**note synthesis** (A-MEM [14]), or **periodic summarisation** (MemGPT [12]).
The shared idea: raw episodic traces are noisy and high-volume; consolidation
extracts the durable signal.

---

## 5. Evaluation

### 5.1 RAGAS (Es et al., 2023)

RAGAS proposes a reference-free evaluation framework with three core metrics
computed by LLM judges [33]:

- **Faithfulness** — fraction of generated claims supported by the retrieved
  context.
- **Answer relevance** — how well the answer addresses the question.
- **Context relevance** — how relevant the retrieved context is to the question.

Reference-free is important because labelled ground-truth answers are scarce
in production RAG settings. RAGAS metrics correlate with human judgement well
enough to drive iteration.

### 5.2 LongMemEval (Wu et al., 2024)

LongMemEval is "a comprehensive benchmark introduced for evaluating long-term
memory capabilities of chat assistants" [34]. It evaluates five abilities:

1. Information extraction.
2. Multi-session reasoning.
3. Temporal reasoning.
4. Knowledge updates.
5. Abstention (refusing when memory is absent).

LongMemEval reports that "commercial chat assistants and long-context LLMs
show a 30% accuracy drop on memorizing information across sustained
interactions" [34]. The benchmark's three-stage decomposition — indexing,
retrieval, reading — is a useful playground evaluation harness.

### 5.3 LoCoMo (Maharana et al., 2024)

LoCoMo (Long-term Conversational Memory) provides a dataset of "very long-term
conversations, each encompassing 300 turns and 9K tokens on average, over up
to 35 sessions" [35]. Tasks: QA, event summarisation, multi-modal dialogue
generation.

Empirically, "LLMs exhibit challenges in understanding lengthy conversations
and comprehending long-range temporal and causal dynamics within dialogues"
[35]. Both long-context LLMs and RAG agents "still substantially lag behind
human performance" [35], motivating dedicated memory architectures.

### 5.4 Classical Retrieval Metrics

For the **retrieval** sub-system, standard IR metrics apply:

- **Recall@k** — fraction of gold passages in top-k.
- **MRR** (Mean Reciprocal Rank) — average of 1 / rank-of-first-relevant.
- **nDCG@k** — gain-weighted ranking quality, used in BEIR [36] and MTEB [37].

BEIR (Thakur et al., 2021) [36] is the standard heterogeneous retrieval
benchmark, and MTEB (Muennighoff et al., 2022) [37] is the standard
embedding benchmark (retrieval is one of its 8 task families).

### 5.5 Generation Quality

For the **generation** half of RAG:
- **Faithfulness / Attributability** — RAGAS faithfulness [33], attribution
  benchmarks such as TRUE (Honovich et al., 2022) and AIS (Rashkin et al., 2021).
- **Exact match / F1** — for short-answer QA (Natural Questions, TriviaQA).
- **Answer relevance** — RAGAS [33].

### 5.6 What to Measure in the Playground

Recommended minimum harness:
1. Retrieval: Recall@k, nDCG@k on a synthetic gold set.
2. Generation: RAGAS faithfulness + answer relevance.
3. Memory: a LongMemEval-style or LoCoMo-style multi-session probe.
4. Cost: tokens / query, latency p50/p95.

---

## 6. Open Problems and Failure Modes

### 6.1 Lost in the Middle (Liu et al., 2023)

Liu et al. show that "performance is often highest when relevant information
occurs at the beginning or end of the input context, and significantly degrades
when models must access relevant information in the middle of long contexts,
even for explicitly long-context models" [38].

Implications for the playground:
- More retrieved passages is not strictly better.
- **Position matters**: place the highest-confidence passages at the ends.
- A re-ranker that biases ordering can claw back accuracy lost by raw similarity
  ordering.

### 6.2 Hallucination Under Retrieval (Shi et al., 2023)

Even when correct context is retrieved, LMs sometimes ignore it in favour of
their parametric prior. Shi et al. introduce **Context-aware Decoding (CAD)** —
a contrastive decoding scheme that "amplifies the difference between the output
probabilities when a model is used with and without context" [39].

Empirically, "CAD ... significantly improves the faithfulness of different LM
families ... (e.g., 14.3% gain for LLaMA in factuality metrics)" [39] and is
especially effective when retrieved context contradicts prior knowledge.

### 6.3 Stale Memory and Knowledge Updates

LongMemEval's "knowledge updates" sub-task [34] surfaces a fundamental failure
mode: when the user's situation changes (job, address, preference), older
memories must be invalidated, not just outweighed by newer ones. Naive vector
stores have no notion of *contradiction*; A-MEM's link-refactoring [14] and
MemoryBank's decay [15] partially address this but no system today does it
robustly.

### 6.4 Contradiction Resolution

Related but distinct from stale memory: two retrieved passages may simply
disagree (different sources, different dates, different definitions). Open
research directions:
- LLM-as-judge contradiction detection between candidates.
- Source-credibility weighting.
- Temporal weighting: prefer newer evidence by default.

CRAG's [7] retrieval evaluator is an early step but does not explicitly
resolve inter-document conflict.

### 6.5 Retrieval Noise and Adversarial Context

Several recent studies show that adding irrelevant passages to context degrades
generation. This motivates Self-RAG [6] (adaptive retrieval) and CRAG [7]
(corrective retrieval) — both reduce passage count when retrieval quality is
poor.

### 6.6 Long-Context Does Not Replace Retrieval (Yet)

Although Gemini-class LMs support 1M–10M tokens, the comparative study by Li
et al. [8] and the follow-up by Yu et al. [9] show that:
- Long context **wins on accuracy** when fed correctly relevant material.
- Long context **loses on cost**: per-query tokens are 10–100x higher.
- Long context **still suffers** from lost-in-the-middle effects [38].

A hybrid architecture (route by query type) appears strictly dominant.

### 6.7 Other Failure Modes Worth Tracking

- **Retrieval-only-where-needed**: when to retrieve at all (Self-RAG [6]).
- **Multi-hop failure**: vanilla top-k cannot follow chains of reasoning
  across documents — HippoRAG [16] addresses this via graph traversal.
- **Personalisation drift**: long-running agents accumulate persona drift if
  reflections compound errors.
- **Privacy and forgetting**: GDPR-style deletion is incompatible with naive
  embedding stores that may have learned from deleted text.

---

## 7. Synthesis: Design Principles for the Playground

Drawing the above together, a minimum-viable RAG memory playground should
expose the following independent dimensions for experimentation:

### 7.1 Retrieval Layer
- **Embedding model**: E5 [20], BGE [21], OpenAI text-embedding-3.
- **Index**: HNSW [22] (default), IVF/ScaNN [23] for memory-constrained
  settings, ColBERT-style late interaction [24] when precision matters.
- **Sparse**: BM25 [25] alongside dense (hybrid search).
- **Reranker**: cross-encoder reranker on top-N candidates.
- **Chunker**: configurable size, overlap, and boundary policy [26][27].

### 7.2 Memory Layer
- **Episodic**: append-only stream with timestamps, importance scores
  (Generative Agents [13]).
- **Semantic**: knowledge-graph or fact-store overlay (HippoRAG [16],
  A-MEM [14]).
- **Procedural / reflective**: rolling reflection buffer (Reflexion [17]).
- **Forgetting**: optional Ebbinghaus-style decay (MemoryBank [15]).
- **Tiered context**: configurable main / archival split (MemGPT [12],
  Letta [18]).

### 7.3 Generation Layer
- **Adaptive retrieval**: gate with Self-RAG-style reflection tokens [6].
- **Corrective fallback**: retrieval evaluator + web fallback (CRAG [7]).
- **Context-aware decoding**: optional CAD [39] to suppress parametric
  hallucinations.
- **Position-aware packing**: order retrieved passages to mitigate
  lost-in-the-middle [38].

### 7.4 Evaluation Harness
- **Retrieval**: Recall@k, MRR, nDCG@k on BEIR-style splits [36].
- **Generation**: RAGAS faithfulness + answer relevance [33].
- **Memory**: LongMemEval [34] and/or LoCoMo [35] subsets.
- **Cost**: tokens, latency, $/query.

### 7.5 Three Hypotheses Worth Testing

1. **H1 — Adaptive retrieval pays for itself.** Self-RAG-style gating reduces
   token cost without sacrificing quality, validated by [6] and the cost
   findings of [8].
2. **H2 — Graph-structured memory beats flat vectors on multi-hop**, per
   HippoRAG's results [16].
3. **H3 — Reflection-style consolidation reduces context bloat** without
   degrading recall, per Generative Agents [13] and A-MEM [14].

These three are the cleanest cuts where the playground can produce novel
empirical evidence beyond what existing papers report.

---

## References

[1] Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N.,
Küttler, H., Lewis, M., Yih, W., Rocktäschel, T., Riedel, S., & Kiela, D.
(2020). *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks*.
NeurIPS 2020. arXiv:2005.11401. https://arxiv.org/abs/2005.11401

[2] Guu, K., Lee, K., Tung, Z., Pasupat, P., & Chang, M. (2020). *REALM:
Retrieval-Augmented Language Model Pre-Training*. ICML 2020.
arXiv:2002.08909. https://arxiv.org/abs/2002.08909

[3] Karpukhin, V., Oğuz, B., Min, S., Lewis, P., Wu, L., Edunov, S., Chen, D.,
& Yih, W. (2020). *Dense Passage Retrieval for Open-Domain Question
Answering*. EMNLP 2020. arXiv:2004.04906. https://arxiv.org/abs/2004.04906

[4] Izacard, G., & Grave, E. (2021). *Leveraging Passage Retrieval with
Generative Models for Open Domain Question Answering*. EACL 2021.
arXiv:2007.01282. https://arxiv.org/abs/2007.01282

[5] Izacard, G., Lewis, P., Lomeli, M., Hosseini, L., Petroni, F., Schick, T.,
Dwivedi-Yu, J., Joulin, A., Riedel, S., & Grave, E. (2022). *Atlas: Few-shot
Learning with Retrieval Augmented Language Models*. arXiv:2208.03299.
https://arxiv.org/abs/2208.03299

[6] Asai, A., Wu, Z., Wang, Y., Sil, A., & Hajishirzi, H. (2023). *Self-RAG:
Learning to Retrieve, Generate, and Critique through Self-Reflection*.
arXiv:2310.11511. https://arxiv.org/abs/2310.11511

[7] Yan, S.-Q., Gu, J.-C., Zhu, Y., & Ling, Z.-H. (2024). *Corrective
Retrieval Augmented Generation*. arXiv:2401.15884.
https://arxiv.org/abs/2401.15884

[8] Li, Z., Li, C., Zhang, M., Mei, Q., & Bendersky, M. (2024). *Retrieval
Augmented Generation or Long-Context LLMs? A Comprehensive Study and Hybrid
Approach*. arXiv:2407.16833. https://arxiv.org/abs/2407.16833

[9] Yu, X. et al. (2025). *Long Context vs. RAG for LLMs: An Evaluation and
Revisits*. arXiv:2501.01880. https://arxiv.org/abs/2501.01880

[10] Roberts, A., Raffel, C., & Shazeer, N. (2020). *How Much Knowledge Can
You Pack Into the Parameters of a Language Model?*. EMNLP 2020.
arXiv:2002.08910. https://arxiv.org/abs/2002.08910

[11] Gao, Y., Xiong, Y., Gao, X., Jia, K., Pan, J., Bi, Y., Dai, Y., Sun, J.,
Wang, M., & Wang, H. (2023). *Retrieval-Augmented Generation for Large
Language Models: A Survey*. arXiv:2312.10997.
https://arxiv.org/abs/2312.10997

[12] Packer, C., Wooders, S., Lin, K., Fang, V., Patil, S. G., Stoica, I., &
Gonzalez, J. E. (2023). *MemGPT: Towards LLMs as Operating Systems*.
arXiv:2310.08560. https://arxiv.org/abs/2310.08560

[13] Park, J. S., O'Brien, J. C., Cai, C. J., Morris, M. R., Liang, P., &
Bernstein, M. S. (2023). *Generative Agents: Interactive Simulacra of Human
Behavior*. UIST 2023. arXiv:2304.03442. https://arxiv.org/abs/2304.03442

[14] Xu, W., Liang, Z., Mei, K., Gao, H., Tan, J., & Zhang, Y. (2024). *A-MEM:
Agentic Memory for LLM Agents*. arXiv:2502.12110.
https://arxiv.org/abs/2502.12110

[15] Zhong, W., Guo, L., Gao, Q., Ye, H., & Wang, Y. (2023). *MemoryBank:
Enhancing Large Language Models with Long-Term Memory*. arXiv:2305.10250.
https://arxiv.org/abs/2305.10250

[16] Gutiérrez, B. J., Shu, Y., Gu, Y., Yasunaga, M., & Su, Y. (2024).
*HippoRAG: Neurobiologically Inspired Long-Term Memory for Large Language
Models*. NeurIPS 2024. arXiv:2405.14831. https://arxiv.org/abs/2405.14831

[17] Shinn, N., Cassano, F., Berman, E., Gopinath, A., Narasimhan, K., & Yao,
S. (2023). *Reflexion: Language Agents with Verbal Reinforcement Learning*.
NeurIPS 2023. arXiv:2303.11366. https://arxiv.org/abs/2303.11366

[18] Letta (formerly MemGPT). Documentation and research background.
https://docs.letta.com/concepts/letta/ (productionised descendant of [12])

[19] Reimers, N., & Gurevych, I. (2019). *Sentence-BERT: Sentence Embeddings
using Siamese BERT-Networks*. EMNLP 2019. arXiv:1908.10084.
https://arxiv.org/abs/1908.10084

[20] Wang, L., Yang, N., Huang, X., Jiao, B., Yang, L., Jiang, D., Majumder,
R., & Wei, F. (2022). *Text Embeddings by Weakly-Supervised Contrastive
Pre-training*. arXiv:2212.03533. https://arxiv.org/abs/2212.03533

[21] Xiao, S., Liu, Z., Zhang, P., & Muennighoff, N. (2023). *C-Pack: Packaged
Resources To Advance General Chinese Embedding*. arXiv:2309.07597.
https://arxiv.org/abs/2309.07597

[22] Malkov, Y. A., & Yashunin, D. A. (2018). *Efficient and robust
approximate nearest neighbor search using Hierarchical Navigable Small World
graphs*. IEEE TPAMI 42(4). arXiv:1603.09320.
https://arxiv.org/abs/1603.09320

[23] Guo, R., Sun, P., Lindgren, E., Geng, Q., Simcha, D., Chern, F., & Kumar,
S. (2020). *Accelerating Large-Scale Inference with Anisotropic Vector
Quantization*. ICML 2020. arXiv:1908.10396.
https://arxiv.org/abs/1908.10396 ; https://proceedings.mlr.press/v119/guo20h.html

[24] Khattab, O., & Zaharia, M. (2020). *ColBERT: Efficient and Effective
Passage Search via Contextualized Late Interaction over BERT*. SIGIR 2020.
arXiv:2004.12832. https://arxiv.org/abs/2004.12832

[25] Robertson, S., & Zaragoza, H. (2009). *The Probabilistic Relevance
Framework: BM25 and Beyond*. Foundations and Trends in Information Retrieval,
3(4), 333–389. DOI:10.1561/1500000019.
https://dl.acm.org/doi/abs/10.1561/1500000019

[26] Wang, X., Wang, Z., Gao, X., Zhang, F., Wu, Y., Xu, Z., Shi, T., Wang,
Z., Li, S., Qian, Q., Yin, R., Lv, C., Zheng, X., & Huang, X. (2024).
*Searching for Best Practices in Retrieval-Augmented Generation*. EMNLP 2024.
arXiv:2407.01219. https://arxiv.org/abs/2407.01219

[27] *Rethinking Chunk Size for Long-Document Retrieval: A Multi-Dataset
Analysis* (2025). arXiv:2505.21700. https://arxiv.org/abs/2505.21700

[28] *A Systematic Analysis of Chunking Strategies for Reliable Question
Answering* (2026). arXiv:2601.14123. https://arxiv.org/abs/2601.14123

[29] Tulving, E. (1972). Episodic and semantic memory. In E. Tulving & W.
Donaldson (Eds.), *Organization of Memory* (pp. 381–403). Academic Press.

[30] Tulving, E. (1985). *Memory and Consciousness*. Canadian Psychology,
26(1), 1–12. DOI:10.1037/h0080017.

[31] Ebbinghaus, H. (1885). *Über das Gedächtnis: Untersuchungen zur
experimentellen Psychologie*. Duncker & Humblot. (English: *Memory: A
Contribution to Experimental Psychology*, 1913). Modern analysis: Murre &
Dros (2015), PLOS ONE 10(7): e0120644.
https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0120644

[32] Zhang, Z., Bo, X., Ma, C., Li, R., Chen, X., Dai, Q., Zhu, J., Dong, Z.,
& Wen, J.-R. (2024). *A Survey on the Memory Mechanism of Large Language
Model based Agents*. ACM TOIS. arXiv:2404.13501.
https://arxiv.org/abs/2404.13501 ; repo: https://github.com/nuster1128/LLM_Agent_Memory_Survey

[33] Es, S., James, J., Espinosa-Anke, L., & Schockaert, S. (2023). *RAGAS:
Automated Evaluation of Retrieval Augmented Generation*. EACL 2024 demo.
arXiv:2309.15217. https://arxiv.org/abs/2309.15217

[34] Wu, D., Wang, H., Yu, W., Zhang, Y., Chang, K.-W., & Yu, D. (2024).
*LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory*.
ICLR 2025. arXiv:2410.10813. https://arxiv.org/abs/2410.10813 ;
repo: https://github.com/xiaowu0162/longmemeval

[35] Maharana, A., Lee, D.-H., Tulyakov, S., Bansal, M., Barbieri, F., & Fang,
Y. (2024). *Evaluating Very Long-Term Conversational Memory of LLM Agents*.
ACL 2024. arXiv:2402.17753. https://arxiv.org/abs/2402.17753 ;
site: https://snap-research.github.io/locomo/

[36] Thakur, N., Reimers, N., Rücklé, A., Srivastava, A., & Gurevych, I.
(2021). *BEIR: A Heterogeneous Benchmark for Zero-shot Evaluation of
Information Retrieval Models*. NeurIPS 2021 Datasets. arXiv:2104.08663.
https://arxiv.org/abs/2104.08663

[37] Muennighoff, N., Tazi, N., Magne, L., & Reimers, N. (2022). *MTEB:
Massive Text Embedding Benchmark*. EACL 2023. arXiv:2210.07316.
https://arxiv.org/abs/2210.07316

[38] Liu, N. F., Lin, K., Hewitt, J., Paranjape, A., Bevilacqua, M., Petroni,
F., & Liang, P. (2023). *Lost in the Middle: How Language Models Use Long
Contexts*. TACL 2023. arXiv:2307.03172. https://arxiv.org/abs/2307.03172

[39] Shi, W., Han, X., Lewis, M., Tsvetkov, Y., Zettlemoyer, L., & Yih, W.
(2023). *Trusting Your Evidence: Hallucinate Less with Context-aware
Decoding*. NAACL 2024 short. arXiv:2305.14739.
https://arxiv.org/abs/2305.14739

---

*Last verified: 2026-05-22. All arXiv IDs and DOIs were confirmed via web
search at time of writing. Quotes are short (< 15 words) and attributed to
their primary sources; see References section for full bibliographic details.*
