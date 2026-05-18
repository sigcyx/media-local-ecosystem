import json
import time

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from starlette.responses import Response

app = FastAPI(title="media-ai-service", version="0.1.0")

http_requests_total = Counter(
    "http_requests_total",
    "Total HTTP requests",
    ["route", "method", "status"],
)
http_request_duration_ms = Histogram(
    "http_request_duration_ms",
    "HTTP request duration in ms",
    ["route", "method"],
    buckets=(10, 25, 50, 100, 250, 500, 1000, 2500, 5000),
)
ai_inference_duration_ms = Histogram(
    "ai_inference_duration_ms",
    "AI inference duration in ms",
    ["type"],
    buckets=(10, 25, 50, 100, 250, 500, 1000, 2500, 5000),
)
ai_inference_failures_total = Counter(
    "ai_inference_failures_total",
    "AI inference failures by type",
    ["type"],
)


class EmbedRequest(BaseModel):
    media_id: str
    path: str


class TextEmbedRequest(BaseModel):
    query: str


def log(level: str, message: str, **extra):
    payload = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "level": level,
        "service": "ai-service",
        "message": message,
    }
    payload.update(extra)
    print(json.dumps(payload))


def deterministic_embedding(seed_text: str) -> str:
    # Deterministic placeholder embedding for contract wiring in MVP.
    seed = sum(ord(ch) for ch in seed_text) % 10000
    values = []
    for i in range(512):
        n = ((seed + (i * 31)) % 2000) - 1000
        values.append(f"{n / 1000:.6f}")
    return "[" + ",".join(values) + "]"


@app.middleware("http")
async def metrics_and_logging_middleware(request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - started) * 1000
    route = request.url.path
    http_requests_total.labels(route=route, method=request.method, status=str(response.status_code)).inc()
    http_request_duration_ms.labels(route=route, method=request.method).observe(duration_ms)
    log(
        "info",
        "request completed",
        route=route,
        method=request.method,
        status_code=response.status_code,
        duration_ms=round(duration_ms, 3),
        request_id=request.headers.get("x-request-id"),
    )
    return response


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/metrics")
def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/embed")
def embed(req: EmbedRequest):
    timer = time.perf_counter()
    try:
        # Placeholder vectors for initial wiring. Replace with CLIP + FaceNet/DeepFace pipeline.
        fake_clip = deterministic_embedding(f"image:{req.path}")
        fake_face = deterministic_embedding(f"face:{req.path}")
        return {
            "media_id": req.media_id,
            "clip_embedding": fake_clip,
            "face_embedding": fake_face,
        }
    except Exception:
        ai_inference_failures_total.labels(type="image").inc()
        raise
    finally:
        ai_inference_duration_ms.labels(type="image").observe((time.perf_counter() - timer) * 1000)


@app.post("/embed/text")
def embed_text(req: TextEmbedRequest):
    timer = time.perf_counter()
    query = req.query.strip()
    if not query:
        ai_inference_failures_total.labels(type="text").inc()
        raise HTTPException(status_code=400, detail="query is required")
    try:
        return {"embedding": deterministic_embedding(f"text:{query.lower()}")}
    except Exception:
        ai_inference_failures_total.labels(type="text").inc()
        raise
    finally:
        ai_inference_duration_ms.labels(type="text").observe((time.perf_counter() - timer) * 1000)
