# Neural Query Patterns (pgvector + Cosine)

## Cosine Distance
For CLIP and FaceNet-style embeddings, similarity is typically ranked by cosine distance using pgvector's `<=>` operator.

## Semantic Search (Text -> Image)
```sql
SELECT
  m.file_path,
  s.embedding <=> $1::vector AS distance
FROM semantic_embeddings s
JOIN media_assets m ON m.id = s.asset_id
ORDER BY distance ASC
LIMIT 20;
```

- `$1` should be a 512-dim CLIP text embedding.
- Lower `distance` means more semantically similar.

## Face Match Search
```sql
SELECT
  f.id,
  f.asset_id,
  f.entity_id,
  f.embedding <=> $1::vector AS distance
FROM facial_embeddings f
ORDER BY distance ASC
LIMIT 20;
```

- `$1` should be a 512-dim face embedding from your recognition pipeline.

## Query-time Recall Tuning
```sql
SET hnsw.ef_search = 100;
```

Increase `ef_search` for higher recall at cost of query latency.
