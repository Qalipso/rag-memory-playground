-- RAG Memory Playground — run history (ExplainableRun persistence).
-- Enables run history + permalinks. No pgvector needed.

create table if not exists run_history (
  id               text primary key,
  user_id          text not null,
  message          text not null,
  route_mode       text not null,
  faithfulness     real not null default 0,
  total_duration_ms int  not null default 0,
  run              jsonb not null,
  created_at       timestamptz not null default now()
);
create index if not exists run_history_user_idx on run_history (user_id, created_at desc);
