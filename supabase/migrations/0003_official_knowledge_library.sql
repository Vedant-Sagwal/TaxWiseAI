create table if not exists public.knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_url text not null,
  published_at date,
  file_name text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.knowledge_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0), page_number integer not null check (page_number > 0), content text not null,
  content_tsv tsvector generated always as (to_tsvector('english', content)) stored,
  embedding vector(1536), unique (document_id, chunk_index)
);
create index if not exists knowledge_chunks_tsv_idx on public.knowledge_chunks using gin(content_tsv);
create index if not exists knowledge_chunks_embedding_idx on public.knowledge_chunks using hnsw (embedding vector_cosine_ops) where embedding is not null;

create or replace function public.match_knowledge_chunks(query_text text, query_embedding vector(1536) default null, candidate_count integer default 24, match_count integer default 5)
returns table (chunk_index integer, page_number integer, content text, rank double precision, title text, source_url text, published_at date)
language sql stable as $$
  with lexical as (
    select c.id, row_number() over (order by ts_rank(c.content_tsv, websearch_to_tsquery('english', query_text)) desc, c.id) position
    from public.knowledge_chunks c where c.content_tsv @@ websearch_to_tsquery('english', query_text) limit least(greatest(candidate_count,1),50)
  ), semantic as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding, c.id) position
    from public.knowledge_chunks c where query_embedding is not null and c.embedding is not null limit least(greatest(candidate_count,1),50)
  ), candidates as (select id from lexical union select id from semantic)
  select c.chunk_index, c.page_number, c.content, (coalesce(1.0/(60+lexical.position),0)+coalesce(1.0/(60+semantic.position),0))::double precision, d.title, d.source_url, d.published_at
  from candidates join public.knowledge_chunks c on c.id=candidates.id join public.knowledge_documents d on d.id=c.document_id
  left join lexical on lexical.id=c.id left join semantic on semantic.id=c.id
  order by 4 desc, c.id limit least(greatest(match_count,1),50);
$$;
