# OCR, Translation, Transcription & LLM API Documentation

**Base URLs:**
| Network | URL |
|---------|-----|
| LAN | `http://192.168.1.61:8080` |
| Tailscale | `http://100.66.213.40:8080` |

**System Monitor:** `http://192.168.1.61:8081` (GPU/CPU/Memory dashboard, separate service)

**OCR Model:** Gemini 2.5 Flash → Claude Sonnet vision (cloud fallback)
**LLM Text Generation:** Ollama — phi4:14b, qwen3.5:9b (GPU 0), qwen3:32b (GPU 1)
**Translation:** LLM-based via AIRouter (Ollama phi4:14b → qwen3:32b → Claude fallback)
**Transcription:** Whisper medium via faster-whisper (CPU, int8)
**Supported image formats:** JPEG, PNG, TIFF, BMP, WebP, PDF (multi-page)
**Supported audio formats:** OGG, MP3, WAV, M4A, FLAC, WebM, AAC, Opus

## Always-On Dual-GPU Mode

The server runs in always-on mode with both GPUs dedicated to Ollama. There is no day/night mode switching.

| GPU | Ollama Port | Models | Purpose |
|-----|-------------|--------|---------|
| GPU 0 (RTX PRO 4000) | 11435 | phi4:14b, qwen3.5:9b, nomic-embed-text | Fast text gen + embeddings |
| GPU 1 (RTX 3090) | 11434 | qwen3:32b | Deep reasoning |

**OCR** is cloud-only: Gemini 2.5 Flash (primary) with Claude Sonnet vision as fallback.

**For API consumers:** This is transparent. Send requests to `/llm/generate` with the model name — the server routes to the correct GPU automatically. OCR endpoints use cloud APIs.

---

## Web UI

A browser-based interface is available at the root URL:

| Network | URL |
|---------|-----|
| LAN | `http://192.168.1.61:8080` |
| Tailscale | `http://100.66.213.40:8080` |

**Features:**
- **Extract Text** — Upload a document, get raw OCR text
- **Extract JSON** — Upload a document, get structured JSON (with optional custom prompt)
- **OCR + Translate** — Upload a document, extract text and translate it in one step
- **Translate Text** — Translate arbitrary text between supported languages
- **LLM Query** — Query Ollama models (phi4:14b, qwen3.5:9b, qwen3:32b) with custom prompts, temperature, and system prompts
- **Task Query** — Task-based smart routing: pick a task from a dropdown (29 tasks), optionally provide structured context JSON, and the server picks the model chain with automatic fallback
- **Transcribe** — Upload audio, get text transcription via Whisper (auto-detects language or specify)

The UI runs as a static HTML page served by the same FastAPI application — no additional services or containers required. Language dropdowns are populated dynamically from the `/translate/languages` endpoint.

---

## Endpoints

### GET /health

Health check. Verifies the API and the underlying backends are operational.

**Request:**
```
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "ollama_gpu0": "connected",
  "ollama_gpu1": "connected",
  "gemini": "configured",
  "whisper": "loaded",
  "ocr_backend": "gemini",
  "translation": "llm"
}
```

| Field | Values |
|-------|--------|
| `status` | `"healthy"` or `"degraded"` |
| `ollama_gpu0` | `"connected"` or `"unavailable"` |
| `ollama_gpu1` | `"connected"` or `"unavailable"` |
| `gemini` | `"configured"` or `"not_configured"` |
| `whisper` | `"loaded"` |
| `ocr_backend` | `"gemini"` |
| `translation` | `"llm"` |

---

### POST /ocr

Extract raw text from an image or PDF. Preserves original layout.

**Request:**
```
POST /ocr
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | Image or PDF file (max 20MB) |

**Response:**
```json
{
  "text": "Extracted text content...",
  "filename": "document.pdf",
  "pages": 2
}
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | Extracted text. For multi-page PDFs, pages are separated by `\n\n` |
| `filename` | string | Original filename |
| `pages` | integer | Number of pages (only present for PDFs) |

**curl example:**
```bash
curl -X POST http://192.168.1.61:8080/ocr \
  -F "file=@invoice.pdf"
```

---

### POST /ocr/json

Extract structured data as JSON from an image or PDF. This is the primary endpoint for integration.

**Request:**
```
POST /ocr/json
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | Image or PDF file (max 20MB) |
| `prompt` | string | No | Custom extraction prompt — use this to control exactly what data is extracted and in what format. When provided, this replaces the default extraction prompt entirely. |
| `schema_hint` | query param | No | Short field list hint (e.g. `?schema_hint=name,date,amount`). Ignored if `prompt` is provided. |

**Priority:** `prompt` > `schema_hint` > default generic extraction

**Response:**
```json
{
  "data": { ... },
  "filename": "invoice.pdf",
  "pages": 2
}
```

| Field | Type | Description |
|-------|------|-------------|
| `data` | object or array | Parsed JSON from the vision model. For single-page: the JSON object directly. For multi-page PDFs: an array with one object per page. |
| `filename` | string | Original filename |
| `pages` | integer | Number of pages (only present for PDFs) |

---

#### Use Case 1: Invoice Extraction

```bash
curl -X POST http://192.168.1.61:8080/ocr/json \
  -F "file=@invoice.pdf" \
  -F "prompt=Extract the following data from this invoice document and return as valid JSON only, no other text: {
  vendor_name: string,
  invoice_number: string,
  invoice_date: string (DD.MM.YYYY),
  buyer_name: string,
  buyer_nip: string,
  delivery_address: string,
  line_items: [{ description: string, quantity: number, unit_price_net: number, vat_rate: number, net_amount: number, vat_amount: number }],
  totals: { net: number, vat: number, gross: number },
  currency: string,
  payment_method: string
}"
```

**Response:**
```json
{
  "data": {
    "vendor_name": "4 WU SP. Z O.O.",
    "invoice_number": "1095/01/2026",
    "invoice_date": "26.01.2026",
    "buyer_name": "OGÓLNOPOLSKIE CENTRUM MEDYCYNY ESTETYCZNEJ",
    "buyer_nip": "1231583048",
    "delivery_address": "Carla Goldoniego 1, 01-913 Warszawa",
    "line_items": [
      {
        "description": "APIS HYDRO EVOLUTION SERUM EKST. NAWIL. 100ML",
        "quantity": 1,
        "unit_price_net": 43.89,
        "vat_rate": 23,
        "net_amount": 43.89,
        "vat_amount": 10.10
      }
    ],
    "totals": { "net": 489.80, "vat": 112.65, "gross": 602.45 },
    "currency": "PLN",
    "payment_method": "przelewem"
  },
  "filename": "invoice.pdf",
  "pages": 1
}
```

#### Use Case 2: Fiscal Report Extraction

```bash
curl -X POST http://192.168.1.61:8080/ocr/json \
  -F "file=@fiscal_report.jpg" \
  -F "prompt=Extract the following data from this Polish fiscal register report and return as valid JSON only, no other text: {
  reportDate: string (DD.MM.YYYY),
  grossTotal: number,
  ptuA: number (23% VAT),
  ptuB: number (8% VAT),
  ptuC: number (5% VAT),
  ptuD: number (0% VAT),
  ptuE: number (exempt),
  receiptCount: number
}"
```

#### Use Case 3: Document Classification

```bash
curl -X POST http://192.168.1.61:8080/ocr/json \
  -F "file=@document.pdf" \
  -F "prompt=Classify this document and return as valid JSON only, no other text: {
  document_type: 'invoice' | 'fiscal_report' | 'receipt' | 'credit_note' | 'delivery_note' | 'other',
  confidence: number (0.0 to 1.0),
  language: string (ISO 639-1 code),
  summary: string (one sentence description)
}"
```

---

### POST /ocr/url

Extract text from an image at a given URL.

> **Note:** This endpoint supports images only (JPEG, PNG, TIFF, BMP, WebP). PDFs are not supported via URL — use `POST /ocr` or `POST /ocr/json` with file upload instead.

**Request:**
```
POST /ocr/url
Content-Type: application/json
```

```json
{
  "url": "https://example.com/image.png",
  "prompt": "optional custom extraction prompt"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | URL of the image to process (max 20MB) |
| `prompt` | string | No | Custom prompt. Defaults to text extraction. |

**Response:**
```json
{
  "text": "Extracted text content...",
  "url": "https://example.com/image.png"
}
```

**curl example:**
```bash
curl -X POST http://192.168.1.61:8080/ocr/url \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com/receipt.jpg"}'
```

---

### POST /translate

Translate text between supported languages using an LLM via AIRouter.

**Request:**
```
POST /translate
Content-Type: application/json
```

```json
{
  "text": "Faktura VAT nr 1234/2026",
  "source_lang": "pl",
  "target_lang": "en"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Text to translate |
| `source_lang` | string | Yes | Source language — shorthand code (`"pl"`, `"en"`, `"de"`) |
| `target_lang` | string | Yes | Target language — shorthand code |

**Response:**
```json
{
  "translated_text": "VAT Invoice No. 1234/2026",
  "source_lang": "pl",
  "target_lang": "en"
}
```

**curl examples:**
```bash
# Polish to English
curl -X POST http://192.168.1.61:8080/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Faktura VAT nr 1234/2026", "source_lang": "pl", "target_lang": "en"}'

# English to German
curl -X POST http://192.168.1.61:8080/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world", "source_lang": "en", "target_lang": "de"}'

# French to English
curl -X POST http://192.168.1.61:8080/translate \
  -H "Content-Type: application/json" \
  -d '{"text": "Bonjour le monde", "source_lang": "fr", "target_lang": "en"}'
```

---

### GET /translate/languages

List all supported translation languages and their codes.

**Request:**
```
GET /translate/languages
```

**Response:**
```json
{
  "shorthand": {
    "en": "English",
    "pl": "Polish",
    "de": "German",
    "fr": "French",
    "..."
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `shorthand` | object | Map of ~40 common ISO 639-1 codes to full language names |

**curl example:**
```bash
curl -s http://192.168.1.61:8080/translate/languages | jq .shorthand
```

---

### POST /ocr/translate

Extract text from an image or PDF, then translate it. Combines OCR and translation in a single request.

**Request:**
```
POST /ocr/translate
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | Image or PDF file (max 20MB) |
| `source_lang` | string | No | Source language (default: `"pl"`). Shorthand code. |
| `target_lang` | string | No | Target language (default: `"en"`). Shorthand code. |

**Response:**
```json
{
  "text": "Original OCR text in source language...",
  "translated_text": "Translated text in target language...",
  "source_lang": "pl",
  "target_lang": "en",
  "filename": "invoice.pdf",
  "pages": 2
}
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | Original OCR-extracted text |
| `translated_text` | string | Translated text |
| `source_lang` | string | Source language code used |
| `target_lang` | string | Target language code used |
| `filename` | string | Original filename |
| `pages` | integer | Number of pages (PDFs only) |

**curl examples:**
```bash
# Polish invoice to English (defaults)
curl -X POST http://192.168.1.61:8080/ocr/translate \
  -F "file=@invoice.pdf"

# English document to Polish
curl -X POST http://192.168.1.61:8080/ocr/translate \
  -F "file=@document.png" \
  -F "source_lang=en" \
  -F "target_lang=pl"

# German document to French
curl -X POST http://192.168.1.61:8080/ocr/translate \
  -F "file=@document.pdf" \
  -F "source_lang=de" \
  -F "target_lang=fr"
```

---

### POST /transcribe

Transcribe audio to text using Whisper (faster-whisper, medium model, CPU int8).

**Request:**
```
POST /transcribe
Content-Type: multipart/form-data
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | Audio file (max 50MB). Supported: OGG, MP3, WAV, M4A, FLAC, WebM, AAC, Opus |
| `language` | string | No | ISO 639-1 language code (e.g. `"pl"`, `"en"`). Auto-detects if omitted. |

**Response:**
```json
{
  "text": "Transcribed text content...",
  "language": "pl",
  "language_probability": 0.987,
  "duration": 45.32,
  "segments": 12,
  "filename": "recording.ogg"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | Full transcribed text |
| `language` | string | Detected or specified language code |
| `language_probability` | float | Confidence of language detection (0.0-1.0) |
| `duration` | float | Audio duration in seconds |
| `segments` | integer | Number of speech segments detected |
| `filename` | string | Original filename |

**curl examples:**
```bash
# Auto-detect language
curl -X POST http://192.168.1.61:8080/transcribe \
  -F "file=@recording.ogg"

# Specify Polish language
curl -X POST http://192.168.1.61:8080/transcribe \
  -F "file=@recording.ogg" \
  -F "language=pl"

# MP3 file
curl -X POST http://192.168.1.61:8080/transcribe \
  -F "file=@meeting.mp3"
```

**Note:** Whisper runs on CPU (int8 quantization) — does not affect GPU workloads. Transcription speed depends on audio length; expect ~10-30s for 1 minute of audio.

---

### POST /tts

Synthesize Spanish text to speech via `edge-tts`. Returns MP3 audio as `audio/mpeg`.

Single-engine, CPU-only (network-bound to MS Azure endpoint). Does not use GPU. Output is deterministic for a given `(text, voice, speed)` tuple — safe to cache client-side.

**Request:**
```
POST /tts
Content-Type: application/json
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `text` | string | Yes | Spanish text to synthesize. Max 500 chars. |
| `voice` | string | No | Voice ID from the allowlist. Default `es-ES-AlvaroNeural`. |
| `speed` | float | No | Playback speed multiplier, clamped to [0.5, 1.5]. Default 1.0. |

**Available voices** (also returned by `GET /tts/voices`):

| Voice | Locale | Gender |
|-------|--------|--------|
| `es-ES-AlvaroNeural` (default) | Spain (Castilian) | Male |
| `es-ES-ElviraNeural` | Spain (Castilian) | Female |
| `es-MX-DaliaNeural` | Mexico | Female |
| `es-MX-JorgeNeural` | Mexico | Male |

**Response (200):**
```
Content-Type: audio/mpeg
Cache-Control: public, max-age=31536000

<binary MP3 bytes — 24 kHz / 48 kbps mono>
```

**Error responses:**

| Status | When | Body |
|--------|------|------|
| 400 | Empty `text` or `text` > 500 chars | `{"detail": "..."}` |
| 422 | Unknown voice | `{"detail": "Unknown voice 'foo'. Available: [...]"}` |
| 503 | edge-tts engine error | `{"detail": "TTS engine error: ..."}` |

**curl examples:**
```bash
# Minimal — default voice, default speed
curl -X POST http://192.168.1.61:8080/tts \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hola, ¿cómo estás?"}' \
  -o hello.mp3

# Explicit voice and slower speed for listening practice
curl -X POST http://192.168.1.61:8080/tts \
  -H 'Content-Type: application/json' \
  -d '{"text":"Necesito comprar leche en el supermercado.","voice":"es-ES-ElviraNeural","speed":0.8}' \
  -o sentence.mp3

# Discover available voices
curl -s http://192.168.1.61:8080/tts/voices
```

**Latency:** measured ~0.4s for a short word ("hola" → 7920 bytes), ~1.1s for a full sentence ("Necesito comprar leche en el supermercado." → 20448 bytes). No GPU contention.

**Caching:** The response carries a long `Cache-Control: public, max-age=31536000` since output is deterministic. Consumers should cache client-side keyed by a hash of `(normalized_text, voice, speed)`. Suggested normalization: `unicodedata.normalize('NFC', text)` + collapse whitespace, but **NOT** lowercase (Spanish capitalization affects pronunciation for proper nouns and sentence position).

---

### GET /tts/voices

List allowlisted Spanish TTS voices, the default voice, and max text length.

**Request:**
```
GET /tts/voices
```

**Response:**
```json
{
  "default": "es-ES-AlvaroNeural",
  "voices": [
    "es-ES-AlvaroNeural",
    "es-ES-ElviraNeural",
    "es-MX-DaliaNeural",
    "es-MX-JorgeNeural"
  ],
  "max_chars": 500
}
```

**curl example:**
```bash
curl -s http://192.168.1.61:8080/tts/voices | jq .
```

---

### GET /llm/models

List models available on the Ollama server.

**Request:**
```
GET /llm/models
```

**Response:**
```json
{
  "models": ["phi4:14b", "qwen3.5:9b", "qwen3:32b"]
}
```

**curl example:**
```bash
curl -s http://192.168.1.61:8080/llm/models | jq .
```

---

### POST /llm/generate

Direct model access — the caller picks the exact Ollama model. For task-based routing where the server picks the model chain, use `POST /task` — see [ROUTING_RULES.md](../Project/Current State/ROUTING_RULES.md). The proxy automatically routes to the correct GPU and Ollama instance based on the current mode.

**Request:**
```
POST /llm/generate
Content-Type: application/json
```

```json
{
  "model": "phi4:14b",
  "prompt": "What are the risks of selling covered calls?",
  "system": "You are a financial analyst. Be concise.",
  "temperature": 0.3,
  "max_tokens": 512
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | Yes | Ollama model name (e.g. `"phi4:14b"`, `"qwen3.5:9b"`, `"qwen3:32b"`) |
| `prompt` | string | Yes | User prompt text |
| `system` | string | No | System/context prompt |
| `temperature` | float | No | Sampling temperature (0.0-1.0) |
| `max_tokens` | integer | No | Maximum tokens to generate |
| `think` | boolean | No | Enable chain-of-thought reasoning (useful for qwen3.5:9b) |
| `stream` | boolean | No | When `true`, response is `application/x-ndjson` — one Ollama generate object per line, with `done: true` on the final line. Web UI uses this for the LLM Query tab. Default `false`. |

**Response:**
```json
{
  "response": "The key risks of selling covered calls include...",
  "model": "phi4:14b",
  "eval_count": 128,
  "prompt_eval_count": 42,
  "total_duration_ms": 5975,
  "gpu": "gpu1",
  "mode": "always-on"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `response` | string | Generated text |
| `model` | string | Model that generated the response |
| `eval_count` | integer | Output tokens generated |
| `prompt_eval_count` | integer | Input tokens processed |
| `total_duration_ms` | integer | Total time in milliseconds |
| `gpu` | string | Which GPU handled the request (`"gpu0"` or `"gpu1"`) |
| `mode` | string | `"always-on"` |

**curl example:**
```bash
curl -X POST http://192.168.1.61:8080/llm/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "phi4:14b",
    "prompt": "Summarize the key risks of selling covered calls.",
    "system": "You are a financial analyst. Be concise.",
    "temperature": 0.3
  }'
```

**Streaming example:**
```bash
curl -N -X POST http://192.168.1.61:8080/llm/generate \
  -H "Content-Type: application/json" \
  -d '{"model": "phi4:14b", "prompt": "Count to 5.", "stream": true}'
```
Each line of the response is a JSON object like `{"response": "1", "done": false}`. The final line has `"done": true` and includes `eval_count`, `prompt_eval_count`, and `total_duration`.

**Smart routing:**
- `phi4:14b`, `qwen3.5:9b` → GPU 0 Ollama (port 11435)
- `qwen3:32b` → GPU 1 Ollama (port 11434)
- Models on different GPUs can run **concurrently** with no swap penalty

For the full routing decision flowchart and all fallback chains, see [ROUTING_RULES.md](../Project/Current State/ROUTING_RULES.md).

**Migration for existing apps:** Change your Ollama endpoint from `http://192.168.1.61:11434/api/generate` to `http://192.168.1.61:8080/llm/generate`. The request/response format is the same, with the addition of `gpu` and `mode` fields in the response. For new apps, prefer `POST /task` — it provides automatic model selection and fallbacks across all providers.

**Note:** First request to a cold model takes ~10-50s (Ollama needs to load the model into GPU VRAM). Subsequent requests are fast (~2-10s).

---

### POST /task

Task-based smart routing. The caller specifies *what* they need (task name), and the server picks the model and provider chain with automatic fallback. **This is the recommended endpoint for all new application integrations.**

**Request:**
```
POST /task
Content-Type: application/json
```

```json
{
  "task": "scan_summary",
  "prompt": "Summarize this brokerage statement.",
  "system": "You are a financial analyst. Be concise.",
  "temperature": 0.3,
  "max_tokens": 512
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `task` | string | Yes | Task name — must exist in `TASK_REGISTRY`. Use `GET /task/routes` to discover available tasks. |
| `prompt` | string | Yes | User prompt text |
| `system` | string | No | System/context prompt |
| `temperature` | float | No | Sampling temperature (0.0-1.0). Overrides the task's `default_temperature` if set. |
| `max_tokens` | integer | No | Maximum tokens to generate. Overrides the task's `default_max_tokens` if set. Ollama's underlying `num_predict` default is 128 — most production tasks set a higher per-task default to avoid silent truncation of structured JSON. |
| `think` | bool | No | Override the task's default `think` setting (Ollama only). Tasks default to `think=False` for production speed; opt in to chain-of-thought per-request when needed. |
| `context` | object | No | Structured keys for retrieval lookups (e.g. `{"verbs": ["tener"], "tense": "Present"}`). Required fields depend on the task — check `GET /task/routes` for each task's `context_keys`. For `semantic` mode tasks, `context.topic` biases the embedding query. |
| `catalog_override` | string | No | For `catalog_inject` mode tasks (e.g. `spanish_grammar_tag`), supply caller-side catalog text instead of the server's. The server appends its standard output guardrail to the supplied text. Use with `GET /task/{name}/catalog` to discover what the server would otherwise inject. |

**Response:**
```json
{
  "response": "The quarterly revenue increased by 15% year-over-year, reaching $12 million.",
  "model": "phi4:14b",
  "provider": "ollama",
  "task": "scan_summary",
  "gpu": "gpu1",
  "mode": "always-on",
  "rag_chunks_used": 0,
  "retrieval_mode": null,
  "disclaimer": null
}
```

| Field | Type | Description |
|-------|------|-------------|
| `response` | string | Generated text |
| `model` | string | Model that produced the response |
| `provider` | string | `"ollama"`, `"claude"`, `"perplexity"` |
| `task` | string | Task name echoed back |
| `gpu` | string | `"gpu0"`, `"gpu1"`, or `"cloud"` (when provider is Claude/Perplexity/Gemini) |
| `mode` | string | `"always-on"` |
| `rag_chunks_used` | integer | Number of retrieval context items injected into the system prompt. >0 when the task has active retrieval and data is available. |
| `retrieval_mode` | string/null | `"key_lookup"`, `"semantic"`, `"catalog_inject"`, `"hybrid"`, or `null` |
| `disclaimer` | string/null | Guardrail disclaimer for safety-sensitive tasks (e.g. medical, trading) |

**curl examples:**
```bash
# General task — summarize text
curl -X POST http://192.168.1.61:8080/task \
  -H "Content-Type: application/json" \
  -d '{
    "task": "scan_summary",
    "prompt": "Summarize: Revenue was $12M, up 15% YoY.",
    "max_tokens": 100
  }'

# Spanish task — conversation practice
curl -X POST http://192.168.1.61:8080/task \
  -H "Content-Type: application/json" \
  -d '{
    "task": "spanish_conversation",
    "prompt": "Hola, quiero practicar el subjuntivo.",
    "system": "You are a friendly Spanish teacher.",
    "temperature": 0.7
  }'

# Spanish task with structured context
curl -X POST http://192.168.1.61:8080/task \
  -H "Content-Type: application/json" \
  -d '{
    "task": "spanish_conjugation_drill",
    "prompt": "Generate 5 conjugation drill questions for the imperfect subjunctive",
    "context": {"verbs": ["tener", "poder"], "tense": "Imperfect Subjunctive"},
    "max_tokens": 500
  }'

# Medical task (returns disclaimer)
curl -X POST http://192.168.1.61:8080/task \
  -H "Content-Type: application/json" \
  -d '{
    "task": "medical_qa",
    "prompt": "What are common symptoms of type 2 diabetes?",
    "max_tokens": 200
  }'

# Trading task (accuracy-critical — Claude primary)
curl -X POST http://192.168.1.61:8080/task \
  -H "Content-Type: application/json" \
  -d '{
    "task": "trade_analysis",
    "prompt": "Analyze the risk/reward of selling covered calls on AAPL at the 200 strike.",
    "temperature": 0.3
  }'

# Health task — blood test interpretation
curl -X POST http://192.168.1.61:8080/task \
  -H "Content-Type: application/json" \
  -d '{
    "task": "blood_test_interpret",
    "prompt": "My hemoglobin A1c is 6.2% and fasting glucose is 110 mg/dL. What does this indicate?",
    "max_tokens": 300
  }'
```

**Error responses:**
- `400` — Unknown task name. Response includes list of available tasks.
- `422` — Missing required field (`task` or `prompt`).
- `502` — All providers in the fallback chain failed.
- `503` — Retrieval system unavailable for a task that requires RAG context (`require_rag=True`).

**Difference from `/llm/generate`:** With `/llm/generate` you say "use phi4:14b" and get a raw Ollama proxy (no fallback, no cloud). With `/task` you say "I need a scan_summary" and the server picks the model chain, with automatic fallback across Ollama, Claude, Perplexity, etc.

**Retrieval-Augmented Generation (RAG)**

Tasks with retrieval configured automatically inject context from SQLite (structured lookups) or ChromaDB (semantic search) into the LLM's system prompt before generation. This is transparent to the caller — the response includes `rag_chunks_used` and `retrieval_mode` to show what retrieval occurred.

| Retrieval Mode | How It Works | Example Tasks |
|---------------|-------------|---------------|
| `key_lookup` | Exact match from SQLite using `context` field keys | `spanish_conjugation_drill` (verbs + tense) |
| `semantic` | Vector similarity search via ChromaDB + nomic-embed-text | `medical_qa`, `spanish_vocabulary` |
| `catalog_inject` | Full reference catalog injected (loaded at startup) | `spanish_grammar_tag` |
| `hybrid` | Layer 1 (key_lookup) + Layer 2 (semantic) combined | `spanish_grading`, `drug_interaction` |

Tasks with `retrieval_mode: null` in `GET /task/routes` do not use retrieval.

**Data loading:** Retrieval data is loaded via `ingest.py` inside the container:
```bash
# Structured data (CSV/JSON → SQLite)
docker compose exec ocr-api python ingest.py --structured --table conjugation_tables --file /corpora/spanish_conjugation/seed.csv

# Semantic data (text files → chunk → embed → ChromaDB)
docker compose exec ocr-api python ingest.py --semantic --collection spanish_grammar --dir /corpora/spanish_grammar/docs/
```

---

### GET /task/routes

Discover all available tasks, their descriptions, fallback chains, retrieval configuration, and guardrail flags. Use this to build task dropdowns or validate task names before calling `POST /task`.

**Request:**
```
GET /task/routes
```

**Response:**
```json
{
  "tasks": {
    "scan_summary": {
      "description": "Summarize scanned document content",
      "route": [
        {"provider": "ollama", "model": "phi4:14b"},
        {"provider": "ollama", "model": "qwen3.5:9b"},
        {"provider": "ollama", "model": "qwen3:32b"},
        {"provider": "claude", "model": "claude-sonnet-4-6"}
      ],
      "think": false,
      "default_temperature": null,
      "default_max_tokens": null,
      "retrieval": null,
      "guardrails": null
    },
    "spanish_conjugation_drill": {
      "description": "Generate conjugation drill questions with verified forms",
      "route": [
        {"provider": "ollama", "model": "qwen3.5:9b"},
        {"provider": "ollama", "model": "phi4:14b"}
      ],
      "think": false,
      "default_temperature": null,
      "default_max_tokens": 2048,
      "has_system_prefix": true,
      "retrieval": {
        "mode": "key_lookup",
        "context_keys": ["verbs", "tense"]
      },
      "guardrails": null
    },
    "medical_qa": {
      "description": "Medical question answering (advisory only)",
      "route": [
        {"provider": "claude", "model": "claude-sonnet-4-6"},
        {"provider": "ollama", "model": "qwen3:32b"}
      ],
      "think": false,
      "default_temperature": null,
      "default_max_tokens": null,
      "retrieval": {
        "mode": "semantic",
        "context_keys": null
      },
      "guardrails": {
        "disclaimer": true,
        "require_rag": false
      }
    }
  },
  "count": 29
}
```

| Field | Type | Description |
|-------|------|-------------|
| `tasks` | object | Map of task name → task metadata |
| `tasks.*.description` | string | Human-readable task description |
| `tasks.*.route` | array | Ordered fallback chain — `[{provider, model}, ...]` |
| `tasks.*.think` | bool | Default `think` setting passed to Ollama (chain-of-thought toggle). `false` for production tasks. |
| `tasks.*.default_temperature` | float/null | Default sampling temperature. `null` means provider default applies. |
| `tasks.*.default_max_tokens` | int/null | Default max output tokens. `null` means provider default applies (Ollama=128, which truncates structured JSON — production tasks set higher). |
| `tasks.*.has_system_prefix` | bool | `true` if the task always prepends a server-managed system prefix (output-format guarantees) to the LLM call. The actual prefix text is not exposed via this endpoint — see `task_config.py`. |
| `tasks.*.retrieval` | object/null | Retrieval config: `mode` and `context_keys` (null if no retrieval) |
| `tasks.*.guardrails` | object/null | `disclaimer` (bool) and `require_rag` (bool) — null if no guardrails |
| `count` | integer | Total number of registered tasks |

**curl example:**
```bash
# List all tasks
curl -s http://192.168.1.61:8080/task/routes | python3 -m json.tool

# Get just the task names
curl -s http://192.168.1.61:8080/task/routes | python3 -c "
import json, sys
d = json.load(sys.stdin)
for name in sorted(d['tasks']): print(name)
"
```

**Available tasks (29):**

Tasks marked with **(RAG)** have active retrieval pipelines that automatically inject context before generation. See the RAG section under `POST /task` for details.

| Category | Tasks |
|----------|-------|
| **General** | `scan_summary`, `quick_narration`, `translation`, `code_generation` |
| **Spanish** | `spanish_conjugation_drill` **(RAG)**, `spanish_drill_freegen`, `spanish_grading` **(RAG)**, `spanish_grammar_tag` **(RAG)**, `spanish_vocabulary` **(RAG)**, `spanish_conversation`, `spanish_ai_teacher` **(RAG)** |
| **Health/Medical** | `medical_qa` **(RAG)**, `drug_interaction` **(RAG)**, `health_evaluation`, `activity_review`, `training_plan_eval`, `training_plan_rebuild`, `fitness_assessment`, `genetic_synthesis`, `blood_test_interpret`, `research_synthesis`, `insight_explanation`, `symptom_lookup` |
| **Trading** | `trade_analysis`, `portfolio_review`, `options_strategy`, `market_context`, `news_lookup`, `earnings_analysis` |

---

### GET /task/{task_name}/catalog

Return the catalog data injected by `catalog_inject` mode tasks. Currently only `spanish_grammar_tag` uses this mode. Returns 404 for non-catalog_inject tasks. Use this to discover the canonical concept names the server will inject and detect drift across server updates.

**Request:**
```
GET /task/spanish_grammar_tag/catalog
```

**Response:**
```json
{
  "task": "spanish_grammar_tag",
  "catalog_name": "grammar_concepts",
  "catalog_version": "a0988bc25e31",
  "entry_count": 7,
  "concept_names": ["direct_indirect_objects", "irregular_stems", "por_vs_para", "preterite_vs_imperfect", "reflexive_verbs", "ser_vs_estar", "subjunctive_triggers"],
  "entries": [
    {"concept_name": "ser_vs_estar", "explanation": "...", "examples": "..."}
  ],
  "injected_text": "Grammar Concepts Catalog:\n- **ser_vs_estar**: ..."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `task` | string | Task name echoed back |
| `catalog_name` | string | Source catalog identifier (`grammar_concepts`) |
| `catalog_version` | string | sha256[:12] of sorted `concept_names` — store this in your app and poll for drift detection |
| `entry_count` | int | Number of catalog entries |
| `concept_names` | array | Sorted list of canonical concept names the server may return |
| `entries` | array | Full entries with `concept_name`, `explanation`, `examples` |
| `injected_text` | string | The exact text the server prepends to the system prompt for this task (without the output guardrail) |

**curl example:**
```bash
curl -s http://192.168.1.61:8080/task/spanish_grammar_tag/catalog | jq '.catalog_version, .concept_names'
```

---

### GET /mode

Return the current GPU mode. Always returns `"always-on"` — there is no day/night switching.

**Response:**
```json
{
  "mode": "always-on"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `mode` | string | `"always-on"` |

---

### POST /mode

No-op. Returns the same response as GET. Retained for backward compatibility.

**Response:**
```json
{
  "mode": "always-on"
}
```

---

### GET /gemini/usage

Return Gemini API usage and cost tracking data.

**Response:**
```json
{
  "total_calls": 15,
  "total_cost_usd": 0.0234,
  "month_calls": 10,
  "month_cost_usd": 0.0156,
  "today_calls": 2,
  "today_cost_usd": 0.0031,
  "recent": [...]
}
```

---

### GET /stats

Return request usage statistics broken down by day, category, and key.

**Response:**
```json
{
  "today": {
    "ocr": {"gemini": 14},
    "llm": {"gpu0": 5, "gpu1": 18},
    "llm_models": {"phi4:14b": 10, "qwen3:32b": 8, "qwen3.5:9b": 5},
    "task": {"scan_summary": 3, "spanish_conversation": 2},
    "translation": {"pl_to_en": 3},
    "transcription": {"pl": 1},
    "tts": {"es-ES-AlvaroNeural": 4}
  },
  "week": { ... },
  "all_time": { ... },
  "daily": {
    "2026-04-05": { ... },
    "2026-04-04": { ... }
  }
}
```

| Field | Description |
|-------|-------------|
| `today` | Today's stats by category |
| `week` | Last 7 days aggregated |
| `all_time` | All-time totals |
| `daily` | Last 14 days, per-day breakdown |

Categories: `ocr` (gemini/claude), `llm` (gpu0/gpu1), `llm_models` (per model), `task` (per task name), `translation` (per language pair), `transcription` (per language), `tts` (per voice).

---

## RAG Admin (Port 8082)

The RAG Admin service provides a web UI and API for managing retrieval data. **Admin-only** — same network access as the system monitor.

**Base URL:** `http://192.168.1.61:8082`

**Web UI:** `http://192.168.1.61:8082/` — 3 tabs: Structured Data, Semantic Collections, Search Tester

### Admin Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/status` | Check SQLite, ChromaDB, and embedding connectivity |
| GET | `/tables` | List structured data tables with row counts |
| GET | `/tables/{name}/rows` | Browse rows (supports `limit`, `offset`, `filter_col`, `filter_val`) |
| POST | `/tables/{name}/import` | Import CSV or JSON file into a table |
| DELETE | `/tables/{name}/rows` | Clear all rows from a table |
| GET | `/tables/{name}/lookup` | Test key lookup (`key`, `column` params) |
| GET | `/collections` | List ChromaDB collections with document counts |
| POST | `/collections` | Create a new collection |
| DELETE | `/collections/{name}` | Delete a collection |
| GET | `/collections/{name}/documents` | Browse documents in a collection |
| POST | `/collections/{name}/search` | Semantic search test (JSON body: `{"query": "...", "n_results": 5}`) |
| POST | `/collections/{name}/ingest` | Upload text file → chunk → embed → store |

**curl examples:**
```bash
# Check admin status
curl -s http://192.168.1.61:8082/admin/status | python3 -m json.tool

# List tables
curl -s http://192.168.1.61:8082/tables | python3 -m json.tool

# Browse conjugation data for "tener"
curl -s "http://192.168.1.61:8082/tables/conjugation_tables/rows?filter_col=infinitive&filter_val=tener" | python3 -m json.tool

# Import a CSV file
curl -X POST http://192.168.1.61:8082/tables/conjugation_tables/import -F "file=@corpora/spanish_conjugation/seed.csv"

# List collections
curl -s http://192.168.1.61:8082/collections | python3 -m json.tool

# Semantic search test
curl -X POST http://192.168.1.61:8082/collections/spanish_grammar/search \
  -H "Content-Type: application/json" \
  -d '{"query": "when to use subjunctive", "n_results": 3}'

# Ingest a text document
curl -X POST http://192.168.1.61:8082/collections/medical_references/ingest -F "file=@corpora/medical_references/docs/sample_reference.txt"
```

---

## Integration Guide

> **Recommended approach:** Use `POST /task` for all new integrations — it provides task-based routing with automatic model selection, provider fallback (Ollama → Claude → Perplexity), and guardrails. Use `GET /task/routes` to discover available tasks. Fall back to `POST /llm/generate` only when you need to target a specific Ollama model directly. See [ROUTING_RULES.md](../Project/Current State/ROUTING_RULES.md) for the full routing spec.

### Available Models

#### Local (Ollama)

| Model | Size | Best For |
|-------|------|----------|
| `phi4:14b` | ~9 GB | Fast summaries, narration, quick tasks |
| `qwen3.5:9b` | ~6.6 GB | Fast fallback — similar speed to phi4, less VRAM, chain-of-thought capable |
| `qwen3:32b` | ~18 GB | Deep analysis, complex reasoning |

Models share 24 GB VRAM — Ollama automatically swaps them. First request to a cold model takes ~10-50s for loading; subsequent requests are fast (~0.1-2s).

#### Cloud (called from your app, not from this server)

| Model | Provider | Best For |
|-------|----------|----------|
| `claude-sonnet-4-6` | Anthropic | Trade analysis, portfolio review, code generation |
| `sonar-pro` | Perplexity | Market context, news with real-time web search |

### Python Example — HTTP API

```python
import httpx

OCR_API = "http://192.168.1.61:8080"

INVOICE_PROMPT = """Extract the following data from this invoice document and return as valid JSON only, no other text: {
  vendor_name: string,
  invoice_number: string,
  invoice_date: string,
  line_items: [{ description: string, quantity: number, net_amount: number, vat_rate: number }],
  totals: { net: number, vat: number, gross: number },
  currency: string,
  payment_method: string
}"""

async def extract_invoice(file_path: str) -> dict:
    async with httpx.AsyncClient(timeout=120.0) as client:
        with open(file_path, "rb") as f:
            resp = await client.post(
                f"{OCR_API}/ocr/json",
                files={"file": (file_path, f)},
                data={"prompt": INVOICE_PROMPT},
            )
        resp.raise_for_status()
        return resp.json()["data"]
```

### Python Translation Example

```python
import httpx

OCR_API = "http://192.168.1.61:8080"

async def translate_text(text: str, source: str = "pl", target: str = "en") -> str:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{OCR_API}/translate",
            json={"text": text, "source_lang": source, "target_lang": target},
        )
        resp.raise_for_status()
        return resp.json()["translated_text"]

async def ocr_and_translate(file_path: str, target: str = "en") -> dict:
    async with httpx.AsyncClient(timeout=120.0) as client:
        with open(file_path, "rb") as f:
            resp = await client.post(
                f"{OCR_API}/ocr/translate",
                files={"file": (file_path, f)},
                data={"source_lang": "pl", "target_lang": target},
            )
        resp.raise_for_status()
        return resp.json()
```

### Python Transcription Example

```python
import httpx

OCR_API = "http://192.168.1.61:8080"

async def transcribe_audio(file_path: str, language: str = None) -> dict:
    async with httpx.AsyncClient(timeout=300.0) as client:
        with open(file_path, "rb") as f:
            data = {"language": language} if language else {}
            resp = await client.post(
                f"{OCR_API}/transcribe",
                files={"file": (file_path, f)},
                data=data,
            )
        resp.raise_for_status()
        return resp.json()
```

### Direct Ollama Access (Advanced)

> **Not recommended for most apps.** Use the `/llm/generate` proxy instead — it handles GPU routing and logging automatically. Direct Ollama access is useful for debugging or when you need Ollama-specific features.

```bash
curl -s http://100.66.213.40:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "phi4:14b",
    "prompt": "Summarize the key risks of selling covered calls.",
    "system": "You are a financial analyst. Be concise.",
    "stream": false
  }' | jq .
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | yes | `"phi4:14b"`, `"qwen3.5:9b"`, or `"qwen3:32b"` |
| `prompt` | string | yes | User input text |
| `system` | string | no | System/context prompt |
| `stream` | boolean | yes | Always `false` for non-streaming |
| `options.temperature` | float | no | Sampling temperature (0.0-1.0) |
| `options.num_predict` | int | no | Max tokens to generate |
| `think` | boolean | no | Enable/disable chain-of-thought (qwen3.5 only). `false` for fast mode |

**Response:**

```json
{
  "model": "phi4:14b",
  "response": "The key risks of selling covered calls include...",
  "done": true,
  "total_duration": 1234567890,
  "prompt_eval_count": 42,
  "eval_count": 128
}
```

**Health check:**
```bash
curl -s http://100.66.213.40:11434/api/tags | jq '.models[].name'
```

---

### Python `llm_client` Module (Internal Use)

> **Note:** This option is for internal use within `ai_gateway.py` and for advanced scenarios where you need direct programmatic control over provider clients. For most app integrations, use the HTTP API instead — it centralizes routing, logging, and monitoring.

Copy the `llm_client/` directory from this repo into your project. Only dependency: `httpx` (`pip install httpx`).

#### Basic Usage — Single Model

```python
import asyncio
from llm_client import OllamaClient, OllamaConfig

async def main():
    client = OllamaClient(OllamaConfig(
        base_url="http://100.66.213.40:11434",
    ))

    result = await client.generate(
        prompt="What is a put option?",
        system="You are a financial educator. Be concise.",
        model="phi4:14b",
    )
    print(result.text)
    print(f"Model: {result.model}, Tokens: {result.eval_count}")

asyncio.run(main())
```

#### Automatic Model Fallback

Tries `phi4:14b` first, falls back to `qwen3.5:9b`, then `qwen3:32b`:

```python
from llm_client import OllamaClient, OllamaConfig

client = OllamaClient(OllamaConfig(
    base_url="http://100.66.213.40:11434",
    models=["phi4:14b", "qwen3.5:9b", "qwen3:32b"],
))

result = await client.generate_with_fallback(
    prompt="Analyze this earnings report...",
    system="You are a financial analyst.",
)
print(f"Answered by: {result.model}")
```

#### AI Router — Multi-Provider Task Routing

Routes tasks through local Ollama and cloud APIs with automatic fallback:

```python
from llm_client import (
    AIRouter, OllamaClient, OllamaConfig,
    ClaudeClient, ClaudeConfig,
    PerplexityClient, PerplexityConfig,
)

router = AIRouter(
    ollama=OllamaClient(OllamaConfig(base_url="http://100.66.213.40:11434")),
    claude=ClaudeClient(ClaudeConfig()),        # needs ANTHROPIC_API_KEY env var
    perplexity=PerplexityClient(PerplexityConfig()),  # needs PERPLEXITY_API_KEY env var
)

# Local-first task: phi4 → qwen3.5 → qwen3 → Claude
result = await router.generate(
    task="scan_summary",
    prompt="Summarize this brokerage statement.",
    system="You are a financial analyst.",
)
print(f"{result.provider}/{result.model}: {result.text}")

# Cloud-first task: Claude → qwen3
result2 = await router.generate(
    task="trade_analysis",
    prompt="Should I roll this call spread?",
)
```

Custom routes can be passed to `AIRouter(routes={...})`. See [ROUTING_RULES.md](../Project/Current State/ROUTING_RULES.md) for the complete routing table.

#### Health Check

```python
# Single provider
status = await client.health()
# {"status": "connected", "models": ["phi4:14b", "qwen3.5:9b", "qwen3:32b"], ...}

# All providers via router
status = await router.health()
# {"providers": {"ollama": {...}, "claude": {...}}, "routes": [...]}
```

#### Error Handling

```python
from llm_client import LLMAllModelsFailed, LLMConnectionError, LLMGenerationError

try:
    result = await router.generate(task="scan_summary", prompt="...")
except LLMAllModelsFailed as e:
    print(f"All providers failed: {len(e.errors)} errors")
    for err in e.errors:
        print(f"  - {err}")
except LLMConnectionError:
    print("Cannot reach any LLM server")
except LLMGenerationError as e:
    print(f"Generation error (HTTP {e.status_code}): {e}")
```

---

### Environment Variables

Set these on the **client machine** (your app), not on llm-vm:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OLLAMA_BASE_URL` | no | `http://localhost:11434` | Ollama server URL (set to Tailscale or LAN IP) |
| `OLLAMA_MODELS` | no | `phi4:14b,qwen3.5:9b,qwen3:32b` | Comma-separated model fallback chain |
| `OLLAMA_TIMEOUT` | no | `120` | Request timeout in seconds |
| `OLLAMA_MAX_RETRIES` | no | `3` | Retries per model before fallback |
| `OLLAMA_RETRY_DELAY` | no | `1.0` | Base delay between retries (seconds) |
| `ANTHROPIC_API_KEY` | for Claude | *(empty)* | Anthropic API key |
| `CLAUDE_MODEL` | no | `claude-sonnet-4-6` | Claude model to use |
| `CLAUDE_MAX_TOKENS` | no | `4096` | Max response tokens for Claude |
| `PERPLEXITY_API_KEY` | for Perplexity | *(empty)* | Perplexity API key |
| `PERPLEXITY_MODEL` | no | `sonar-pro` | Perplexity model to use |

### Retry Behavior

All clients use the same retry pattern:

1. Each request retries up to `max_retries` times (default 3) with linear backoff (1s, 2s, 3s)
2. **Retried:** connection failures, HTTP 502/503/429 (Ollama), 429/500/529 (Claude), 429/500/503 (Perplexity)
3. **Not retried:** HTTP 400, 401, 404 — these fail immediately
4. The AI Router does **not** add extra retries — each provider's client handles its own retries, then the router moves to the next provider in the chain

### Firewall

Ensure port **11434** is open on llm-vm for direct Ollama access:

```bash
# On llm-vm (already configured):
sudo ufw allow 11434/tcp
```

Port 8080 (OCR API) is already open.

---

### Key Notes

- **Use `POST /task` for LLM requests.** Do not call Ollama directly. The proxy handles GPU routing and load balancing automatically. `/task` is preferred for new integrations — it provides automatic model selection and fallbacks based on the task type. See [ROUTING_RULES.md](../Project/Current State/ROUTING_RULES.md) for routing details.
- **Timeout:** Set HTTP client timeout to at least 300 seconds. LLM inference takes 2-30s for text, 20-40s for OCR. The 300s timeout accommodates cold model loads and qwen3:32b.
- **Multi-page PDFs:** Pages are processed in parallel on the GPU. Response `data` is an array (one entry per page) for multi-page documents, or a single object for single-page.
- **Prompt design:** Include "return as valid JSON only, no other text" in your prompt for cleanest results. The API strips markdown fences and extracts JSON automatically, but explicit instructions help.
- **File size:** Maximum 20MB per upload.
- **PDF resolution:** Pages are rendered at max 1280px on the longest side. This preserves readability while staying within the model's token budget.
- **Translation speed:** ~5-30s depending on Ollama model loaded. Uses LLM-based translation via AIRouter.
- **Translation languages:** ~40 common languages supported. Use `GET /translate/languages` to see all available codes. Polish and English are the primary tested pair.
- **Audio transcription:** Whisper medium on CPU (int8). ~10-30s per minute of audio. Max 50MB upload. Auto-detects language or accepts explicit language code.
- **Always-on mode:** Both GPUs run continuously (day/night switching was retired in CR-002). OCR uses Gemini Flash → Claude vision cloud APIs. LLM requests are routed to the correct GPU automatically. `/mode` always returns `"always-on"`.
- **Dual-GPU concurrency:** `qwen3:32b` runs on GPU 1 and smaller models on GPU 0 — they can run concurrently with no model swap penalty.

### Error Responses

| Status | Meaning |
|--------|---------|
| 400 | Bad request — unsupported file type, file too large, failed to fetch URL, or unknown language code |
| 502 | Backend error — Ollama or cloud API is down or returned an error |
| 503 | Translation service unavailable — model failed to load at startup |

Error body:
```json
{
  "detail": "Error description"
}
```

### Health Check for Monitoring

```bash
# Returns 200 with status "healthy" when operational
curl -sf http://192.168.1.61:8080/health | jq .status
```
