from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="media-ai-service", version="0.1.0")


class EmbedRequest(BaseModel):
    media_id: str
    path: str


class TextEmbedRequest(BaseModel):
    query: str


def deterministic_embedding(seed_text: str) -> str:
    # Deterministic placeholder embedding for contract wiring in MVP.
    seed = sum(ord(ch) for ch in seed_text) % 10000
    values = []
    for i in range(512):
        n = ((seed + (i * 31)) % 2000) - 1000
        values.append(f"{n / 1000:.6f}")
    return "[" + ",".join(values) + "]"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/embed")
def embed(req: EmbedRequest):
    # Placeholder vectors for initial wiring. Replace with CLIP + FaceNet/DeepFace pipeline.
    fake_clip = deterministic_embedding(f"image:{req.path}")
    fake_face = deterministic_embedding(f"face:{req.path}")
    return {
        "media_id": req.media_id,
        "clip_embedding": fake_clip,
        "face_embedding": fake_face,
    }


@app.post("/embed/text")
def embed_text(req: TextEmbedRequest):
    query = req.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    return {"embedding": deterministic_embedding(f"text:{query.lower()}")}
