create extension if not exists pgcrypto;

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  file_name text not null check (char_length(file_name) <= 255),
  character_count integer not null check (character_count > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  page_number integer not null check (page_number > 0),
  content text not null,
  content_tsv tsvector generated always as (to_tsvector('english', content)) stored,
  unique (document_id, chunk_index)
);

create index if not exists document_chunks_content_tsv_idx on public.document_chunks using gin(content_tsv);
create index if not exists documents_owner_id_idx on public.documents(owner_id);

create table if not exists public.daily_chat_usage (
  usage_date date primary key,
  request_count integer not null default 0 check (request_count >= 0)
);

create or replace function public.take_daily_chat_request(request_limit integer)
returns boolean
language plpgsql
as $$
declare current_count integer;
begin
  insert into public.daily_chat_usage (usage_date, request_count)
  values (current_date, 1)
  on conflict (usage_date) do update
    set request_count = public.daily_chat_usage.request_count + 1
    where public.daily_chat_usage.request_count < request_limit
  returning request_count into current_count;
  return current_count is not null;
end;
$$;

-- Called only from the server with the Supabase service key. The owner check
-- prevents one anonymous browser session from reading another session's PDFs.
create or replace function public.match_document_chunks(
  query_document_id uuid,
  query_owner_id uuid,
  query_text text,
  match_count integer default 5
)
returns table (chunk_index integer, page_number integer, content text, rank real)
language sql stable
as $$
  select c.chunk_index, c.page_number, c.content, ts_rank(c.content_tsv, websearch_to_tsquery('english', query_text)) as rank
  from public.document_chunks c
  join public.documents d on d.id = c.document_id
  where c.document_id = query_document_id
    and d.owner_id = query_owner_id
    and c.content_tsv @@ websearch_to_tsquery('english', query_text)
  order by rank desc, c.chunk_index asc
  limit least(greatest(match_count, 1), 10);
$$;
