from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="media-ai-service", version="0.1.0")


class EmbedRequest(BaseModel):
    media_id: str
    path: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/embed")
def embed(req: EmbedRequest):
    # Placeholder vectors for initial wiring. Replace with CLIP + FaceNet/DeepFace pipeline.
    fake_clip = "[" + ",".join(["0" for _ in range(512)]) + "]"
    fake_face = "[" + ",".join(["0" for _ in range(512)]) + "]"
    return {
        "media_id": req.media_id,
        "clip_embedding": fake_clip,
        "face_embedding": fake_face,
    }
