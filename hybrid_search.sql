-- Hybrid Search RPC for Supabase
-- Combines pgvector cosine similarity with full-text search using Reciprocal Rank Fusion (RRF)

CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding vector(768),
  query_text text,
  jurisdiction_filter text[],
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  document_name text,
  jurisdiction text,
  category text,
  section text,
  clause_id text,
  page integer,
  content text,
  source_url text,
  similarity float,
  rank_score float
)
LANGUAGE plpgsql
AS $$
DECLARE
  semantic_weight float := 0.7;
  keyword_weight float := 0.3;
  rrf_k int := 60;
BEGIN
  RETURN QUERY
  WITH semantic_search AS (
    SELECT
      c.id,
      ROW_NUMBER() OVER (ORDER BY c.embedding <=> query_embedding) as rank,
      1 - (c.embedding <=> query_embedding) as similarity_score
    FROM regulatory_chunks c
    WHERE c.jurisdiction = ANY(jurisdiction_filter)
    ORDER BY c.embedding <=> query_embedding
    LIMIT match_count * 2
  ),
  keyword_search AS (
    SELECT
      c.id,
      ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('english', c.content), websearch_to_tsquery('english', query_text)) DESC) as rank
    FROM regulatory_chunks c
    WHERE c.jurisdiction = ANY(jurisdiction_filter)
      AND to_tsvector('english', c.content) @@ websearch_to_tsquery('english', query_text)
    ORDER BY ts_rank_cd(to_tsvector('english', c.content), websearch_to_tsquery('english', query_text)) DESC
    LIMIT match_count * 2
  ),
  rrf_scores AS (
    SELECT
      COALESCE(s.id, k.id) as chunk_id,
      COALESCE(s.similarity_score, 0.0) as similarity,
      (
        semantic_weight * COALESCE(1.0 / (rrf_k + s.rank), 0.0) +
        keyword_weight * COALESCE(1.0 / (rrf_k + k.rank), 0.0)
      ) as rrf_score
    FROM semantic_search s
    FULL OUTER JOIN keyword_search k ON s.id = k.id
  )
  SELECT
    c.id,
    c.document_name,
    c.jurisdiction,
    c.category,
    c.section,
    c.clause_id,
    (c.metadata->>'page')::integer as page,
    c.content,
    c.metadata->>'source_url' as source_url,
    r.similarity::float,
    r.rrf_score::float as rank_score
  FROM rrf_scores r
  JOIN regulatory_chunks c ON c.id = r.chunk_id
  ORDER BY r.rrf_score DESC
  LIMIT match_count;
END;
$$;
