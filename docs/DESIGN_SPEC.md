# Design Specification (MVP)

## 1. Scope and Purpose

This design spec defines the MVP user experience for the Autonomous Local Media Ecosystem web client and Android sync experience. It translates PRD requirements into screen-level behavior, user flows, states, and UI data contracts.

## 2. End-to-End User Flows

### 2.1 Android Auto-Sync Flow
1. User installs Android app and signs in.
2. User grants media/storage permissions.
3. User configures trusted network policy (SSID and/or VPN mode).
4. WorkManager observes DCIM/media store changes.
5. On new media:
- compute SHA-256 locally
- enqueue upload job
- if trusted network is available, execute upload immediately
- else defer until policy is satisfied
6. Backend responds:
- duplicate detected -> mark as `Duplicate` (no further processing)
- new asset accepted -> mark as `Uploaded`, trigger server pipeline
7. App shows per-item sync status and retry controls for failures.

### 2.2 Upload Pipeline Visibility (Web)
1. User opens web app dashboard.
2. Timeline displays media cards with processing status badges.
3. For newly uploaded assets:
- `Uploaded` -> `Queued` -> `Processing` -> `Ready`
4. If processing fails:
- card enters `Error` state with retry action.
5. User can filter timeline by status to monitor pipeline health.

### 2.3 Semantic Search Flow
1. User enters natural-language query in global search.
2. Frontend sends query to backend search endpoint.
3. Backend returns ranked assets with cosine distance.
4. UI renders result grid with relevance ordering and metadata summary.
5. User clicks an item to open detail drawer/page.

### 2.4 Face Labeling Flow
1. User opens media detail with detected faces.
2. User selects a face crop.
3. UI suggests existing entities or allows creating a new one.
4. User assigns label (person/pet).
5. Backend persists `entity_id` association for facial embedding row(s).
6. Entity appears in filter/search and timeline views.

### 2.5 Entity Timeline Flow
1. User navigates to an entity profile.
2. UI requests timeline for selected entity.
3. Backend returns chronologically sorted assets containing that entity.
4. User scrolls timeline and opens individual assets.

## 3. Information Architecture and Navigation (Web MVP)

### 3.1 Primary Navigation
- `Timeline`
- `Search`
- `Entities`
- `Uploads`
- `Settings`

### 3.2 Screen Inventory
- `Login` (if auth enabled)
- `Timeline View`
- `Search View`
- `Entity Directory`
- `Entity Timeline View`
- `Upload Activity View`
- `Media Detail Drawer/Page`
- `Settings View`

### 3.3 Navigation Patterns
- Desktop/Tablet: left sidebar + top search bar.
- Mobile web: bottom nav tabs + condensed top bar.
- Media detail opens as:
- desktop/tablet: right-side drawer
- mobile: full-screen route

## 4. Screen and State Specifications

### 4.1 Shared States (All Data Screens)
- `Loading`: skeleton cards/list rows + progress indicator.
- `Empty`: explanatory message + primary action.
- `Error`: contextual error text + retry CTA.
- `Offline`: offline banner + auto-refresh once connection resumes.
- `Retry`: visible on failed action cards and forms.

### 4.2 Timeline View
Purpose: chronological browsing and processing awareness.

States:
- Loading: card skeleton grid/list.
- Empty: "No media yet" + upload/sync guidance.
- Error: failed to fetch timeline.
- Processing-in-progress: status badges per asset (`Queued`, `Processing`).
- Ready: thumbnail + captured date + optional entity chips.

### 4.3 Search View
Purpose: semantic discovery.

States:
- Idle empty: prompt with query examples.
- Loading: skeleton result grid.
- Empty results: "No matches" + suggestion hints.
- Error: search failure + retry.
- Results: ranked grid with distance score (optional debug mode).

### 4.4 Entity Directory
Purpose: browse all labeled entities.

States:
- Loading: placeholder chips/cards.
- Empty: "No labeled entities yet" with face-labeling hint.
- Error: list fetch failure.
- Ready: entity cards with count and latest seen date.

### 4.5 Entity Timeline View
Purpose: review media for one entity.

States:
- Loading: timeline skeleton.
- Empty: no associated assets.
- Error: timeline fetch failure.
- Ready: chronological cards with face count per asset.

### 4.6 Upload Activity View
Purpose: pipeline observability and quick remediation.

States:
- Loading: queue list skeleton.
- Empty: no recent upload activity.
- Error: cannot load jobs/activity.
- Duplicate-detected: explicit `Duplicate` badge + dedupe explanation.
- Processing-in-progress: queue stage indicators.
- Failed: retry action per failed item.

### 4.7 Media Detail Drawer/Page
Purpose: inspect metadata, faces, and labeling.

States:
- Loading: placeholder image/metadata sections.
- Error: failed asset detail retrieval.
- Ready: media preview, EXIF block, face crop list, assign/reassign controls.

### 4.8 Settings View
Purpose: account/session info, system connectivity, search/debug preferences.

States:
- Loading settings, save success, save error, offline warning.

## 5. API-to-UI Data Contracts

All contracts below represent MVP payload shapes used by UI screens.

### 5.1 Timeline API
`GET /api/timeline?cursor=<cursor>&limit=<n>&status=<optional>`

Response:
```json
{
  "items": [
    {
      "asset_id": "uuid",
      "file_path": "/mnt/nas/source/abc.jpg",
      "mime_type": "image/jpeg",
      "captured_at": "2026-05-18T12:00:00Z",
      "created_at": "2026-05-18T12:00:03Z",
      "thumbnail_url": "/api/assets/uuid/thumbnail",
      "processing_status": "queued|processing|ready|failed|duplicate"
    }
  ],
  "next_cursor": "opaque-or-null"
}
```

### 5.2 Upload API
`POST /api/upload` (multipart file)

Response:
```json
{
  "id": "uuid",
  "sha256": "hex",
  "duplicate": false
}
```

Duplicate case:
```json
{
  "sha256": "hex",
  "duplicate": true
}
```

### 5.3 Semantic Search API
`POST /api/search/semantic`

Request:
```json
{
  "query": "orange cat sleeping",
  "limit": 20
}
```

Response:
```json
{
  "results": [
    {
      "asset_id": "uuid",
      "file_path": "/mnt/nas/source/abc.jpg",
      "mime_type": "image/jpeg",
      "captured_at": "2026-05-18T12:00:00Z",
      "distance": 0.1432,
      "thumbnail_url": "/api/assets/uuid/thumbnail"
    }
  ]
}
```

### 5.4 Face Labeling APIs
`GET /api/assets/:assetId/faces`

Response:
```json
{
  "faces": [
    {
      "facial_embedding_id": "uuid",
      "entity_id": "uuid-or-null",
      "entity_name": "Lemon",
      "bounding_box": { "x": 0.1, "y": 0.2, "width": 0.2, "height": 0.2 }
    }
  ]
}
```

`POST /api/faces/:facialEmbeddingId/assign-entity`

Request:
```json
{
  "entity_id": "uuid"
}
```

Response:
```json
{
  "ok": true
}
```

`POST /api/entities`

Request:
```json
{
  "name": "Lemon",
  "is_pet": true
}
```

Response:
```json
{
  "entity_id": "uuid"
}
```

### 5.5 Entity Timeline API
`GET /api/entities/:entityId/timeline?limit=<n>&cursor=<cursor>`

Response:
```json
{
  "entity": {
    "entity_id": "uuid",
    "name": "Lemon",
    "is_pet": true
  },
  "items": [
    {
      "asset_id": "uuid",
      "file_path": "/mnt/nas/source/abc.jpg",
      "mime_type": "image/jpeg",
      "captured_at": "2026-05-18T12:00:00Z",
      "face_count": 2,
      "thumbnail_url": "/api/assets/uuid/thumbnail"
    }
  ],
  "next_cursor": "opaque-or-null"
}
```

### 5.6 Upload Activity API
`GET /api/uploads/activity?limit=<n>`

Response:
```json
{
  "items": [
    {
      "asset_id": "uuid",
      "sha256_hash": "hex",
      "status": "queued|processing|ready|failed|duplicate",
      "last_error": "string-or-null",
      "updated_at": "2026-05-18T12:05:00Z"
    }
  ]
}
```

## 6. Responsive Behavior

### 6.1 Breakpoints
- Mobile: `<= 767px`
- Tablet: `768px - 1199px`
- Desktop: `>= 1200px`

### 6.2 Layout Behavior
- Timeline/Search grids:
- mobile: 2 columns
- tablet: 3-4 columns
- desktop: 5-7 columns depending on width
- Sidebar:
- desktop/tablet: persistent
- mobile: hidden behind nav + tabs
- Media detail:
- desktop/tablet: side drawer
- mobile: full-screen route

### 6.3 Interaction Behavior
- Touch targets >= 44x44 px.
- Sticky search and filter controls on mobile.
- Infinite scroll on timeline/search with manual "Load more" fallback.

## 7. Accessibility Baseline (WCAG 2.1 AA Target)

### 7.1 Keyboard and Focus
- All interactive controls keyboard reachable.
- Visible focus indicator on buttons, links, and cards.
- Logical tab order across navigation and detail panels.

### 7.2 Semantics and ARIA
- Landmark roles for header/nav/main/aside/footer.
- Descriptive labels for search and face-labeling controls.
- Live regions for async status updates (upload processing, retries).

### 7.3 Color and Contrast
- Text and controls meet AA contrast ratios.
- Status color not used as sole indicator; include text/icon labels.

### 7.4 Media Accessibility
- Meaningful alt text for thumbnails where available.
- Reduced-motion option for animated transitions.

### 7.5 Error Handling
- Inline actionable error messages.
- Retry actions accessible via keyboard and screen reader labels.

## 8. Telemetry and UX Validation Events (MVP)

- `upload_started`
- `upload_duplicate_detected`
- `upload_failed`
- `processing_completed`
- `semantic_search_executed`
- `semantic_search_no_results`
- `face_label_assigned`
- `entity_timeline_viewed`

Each event should include timestamp, user/session identifier, and request correlation id.

## 9. Open Design Decisions for Gate 3

1. Auth UX details (local account vs SSO/OIDC).
2. Whether distance scores are user-visible or debug-only.
3. Exact timeline card density modes (compact vs comfortable).
4. Conflict UX when multiple users relabel the same face.
5. Admin diagnostics surface location (Settings vs dedicated Ops page).
