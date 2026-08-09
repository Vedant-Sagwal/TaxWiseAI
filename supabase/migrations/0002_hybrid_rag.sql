-- Hybrid retrieval for OpenAI text-embedding-3-small (1536 dimensions).
create extension if not exists vector;

alter table public.document_chunks
  add column if not exists embedding vector(1536);

create index if not exists document_chunks_embedding_hnsw_idx
  on public.document_chunks using hnsw (embedding vector_cosine_ops)
  where embedding is not null;

-- Fuse the top lexical and semantic candidates with reciprocal rank fusion.
-- The app applies an optional cross-encoder to these candidates before using five passages.
create or replace function public.match_document_chunks_hybrid(
  query_document_id uuid,
  query_owner_id uuid,
  query_text text,
  query_embedding vector(1536),
  candidate_count integer default 24,
  match_count integer default 24
)
returns table (chunk_index integer, page_number integer, content text, rank double precision)
language sql stable
as $$
  with lexical as (
    select c.id, row_number() over (order by ts_rank(c.content_tsv, websearch_to_tsquery('english', query_text)) desc, c.chunk_index) as position
    from public.document_chunks c join public.documents d on d.id = c.document_id
    where c.document_id = query_document_id and d.owner_id = query_owner_id
      and c.content_tsv @@ websearch_to_tsquery('english', query_text)
    limit least(greatest(candidate_count, 1), 50)
  ), semantic as (
    select c.id, row_number() over (order by c.embedding <=> query_embedding, c.chunk_index) as position
    from public.document_chunks c join public.documents d on d.id = c.document_id
    where c.document_id = query_document_id and d.owner_id = query_owner_id and c.embedding is not null
    limit least(greatest(candidate_count, 1), 50)
  ), candidates as (
    select id from lexical union select id from semantic
  )
  select c.chunk_index, c.page_number, c.content,
    (coalesce(1.0 / (60 + lexical.position), 0) + coalesce(1.0 / (60 + semantic.position), 0))::double precision as rank
  from candidates
  join public.document_chunks c on c.id = candidates.id
  left join lexical on lexical.id = c.id
  left join semantic on semantic.id = c.id
  order by rank desc, c.chunk_index
  limit least(greatest(match_count, 1), 50);
$$;
