-- RAG Memory Playground — memory-formation persistence schema.
-- Requires the pgvector extension (available on Supabase by default).
--
-- Apply via Supabase SQL editor, `psql "$DATABASE_URL" -f` this file, or the
-- Supabase CLI. The PgMemoryStore (src/framework/memory/pg.ts) reads/writes
-- these tables when DATABASE_URL is set.

create extension if not exists vector;

-- Entities extracted from notes (people, projects, concepts, actions, places).
create table if not exists memory_entities (
  id          text primary key,
  user_id     text not null,
  name        text not null,
  kind        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists memory_entities_user_idx on memory_entities (user_id);

-- Multi-level memory blocks. embedding is nullable because the deterministic
-- stub embedder produces a 64-d vector while OpenAI produces 1536-d; the column
-- stores whatever the active embedder emits. Use a sidecar dimension column to
-- keep the comparison honest.
create table if not exists memory_blocks (
  id            text primary key,
  user_id       text not null,
  level         text not null check (level in ('semantic','episodic','procedural','working')),
  content       text not null,
  entity_ids    text[] not null default '{}',
  importance    real not null default 0.5,
  embedding     vector,
  embedding_dim int,
  source_note_id text not null,
  status        text not null default 'active' check (status in ('active','merged','invalidated')),
  created_at    timestamptz not null default now()
);
create index if not exists memory_blocks_user_status_idx on memory_blocks (user_id, status);
create index if not exists memory_blocks_note_idx on memory_blocks (source_note_id);

-- Graph edges between blocks.
create table if not exists memory_edges (
  id          text primary key,
  user_id     text not null,
  from_id     text not null references memory_blocks (id) on delete cascade,
  to_id       text not null references memory_blocks (id) on delete cascade,
  kind        text not null,
  weight      real not null default 1,
  reason      text not null default '',
  created_at  timestamptz not null default now()
);
create index if not exists memory_edges_user_idx on memory_edges (user_id);
create index if not exists memory_edges_from_idx on memory_edges (from_id);
