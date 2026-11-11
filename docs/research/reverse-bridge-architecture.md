# Architektura revers-bridge: agenci GPT z webowej aplikacji przez OpenCode

> **Poza zakresem bieżącego produktu.** To osobny kierunek (web app → OpenCode), a nie implementacja mostu ChatGPT → OpenCode.

## Cel
Uruchomienie dodatkowego serwera pośredniczącego, który pozwala **webowej aplikacji** (frontend, własny UI, portal) korzystać z agentów i modeli dostępnych w lokalnym OpenCode — w kierunku **web → OpenCode → modele/agenci** (przeciwnym niż obecny most ChatGPT → OpenCode).

Obecny most: `ChatGPT (web) → tunel OpenAI → bridge 8790 → OpenCode 4096 → modele/agenci`

Nowy serwer (revers-bridge): `webowa aplikacja → revers-bridge (nowy port, np. 8799) → OpenCode API v2 (4096) → agenci i modele OpenCode`

---

## Mapa kontekstu (zgodnie z podejściem Context Architect)

### Pliki podstawowe (modyfikowane bezpośrednio — nowy serwer)
| Plik | Dlaczego wymaga zmian / utworzenia |
|------|-----------------------------------|
| `docs/research/reverse-bridge-architecture.md` | Niniejsza analiza i specyfikacja (plan) |
| Nowy serwer (np. `src/reverse-bridge.ts` lub osobny katalog) | Implementacja serwera pośredniczącego web ↔ OpenCode |
| `~/.config/opencode/opencode.json` | Konfiguracja modeli, providerów, agentów, uprawnień — źródło prawdy dla revers-bridge |
| `~/.config/opencode/agents/*.md` | Definicje agentów OpenCode, których ma używać webowa aplikacja |

### Pliki pomocnicze (mogą wymagać aktualizacji)
| Plik | Relacja |
|------|---------|
| `project-local launcher script` | Skrypt start/stop mostu — może wymagać opcji startowania revers-bridge |
| `external OmniCommander service` | Skrypt OmniCommandera — nie dotykać, działa niezależnie |
| `./src/opencode/client.ts` | Klient OpenCode API v2 — wzorzec komunikacji do naśladowania w revers-bridge |
| `./src/mcp/tools.ts` | Przykład narzędzi MCP — wzorzec dla endpointów revers-bridge |
| `/tmp/opencode/most/` | Katalog na logi i pidfile nowego serwera |

### Pokrycie testami
| Plik | Co testuje |
|------|------------|
| `./tests/opencode-client.test.ts` | Istniejące testy klienta OpenCode — wzorzec dla testów revers-bridge |

### Wzorce do naśladowania
| Referencja | Wzorzec |
|------------|---------|
| `src/opencode/client.ts` | Komunikacja z OpenCode API v2 (Basic Auth, endpointy `/api/session`, `/api/model`, `/api/agent`, `/api/fs/read/*`) |
| `src/mcp/tools.ts` | Rejestracja narzędzi, obsługa błędów, zwracanie JSON |
| `.env` mostu | Zarządzanie tokenami i konfiguracją przez zmienne środowiskowe |
| `most` / `omni` | Skrypty start/stop z pidfile i health check |

### Sugerowana sekwencja wdrożenia
1. Zatwierdzenie tej architektury (niniejszy plik)
2. Wybrany stos technologiczny nowego serwera (Node.js/TypeScript rekomendowane — spójny z mostem)
3. Implementacja serwera pośredniczącego (auth, sesje, proxy do OpenCode API v2)
4. Integracja z agentami i modelami z `opencode.json`
5. Testy end-to-end z webowej aplikacji
6. Dodanie do skryptów `most`/`omni` lub osobny skrypt `reverse start|stop|status`

---

## Analiza: co będzie potrzebne

### 1. Nowy serwer pośredniczący (revers-bridge)
- **Stos:** Node.js + TypeScript (spójny z mostem, można reuse'ować `src/opencode/client.ts`)
- **Port:** nowy, np. `8799` (lub inny wolny)
- **Funkcje:**
  - Uwierzytelnianie webowej aplikacji (API key, JWT lub sesja)
  - Mapowanie sesji webowej → sesja OpenCode (`/api/session`)
  - Proxy do endpointów OpenCode API v2:
    - `POST /api/session` — utworzenie sesji
    - `POST /api/session/{id}/agent` — wybór agenta
    - `POST /api/session/{id}/model` — wybór modelu
    - `POST /api/session/{id}/prompt` — wysłanie wiadomości
    - `GET /api/session/{id}/message` — pobranie odpowiedzi
    - `GET /api/session/{id}/diff` — diff zmian
    - `GET /api/agent`, `/api/model`, `/api/provider` — lista dostępnych agentów/modeli
    - `GET /api/vcs/status`, `GET /api/fs/find`, `GET /api/fs/read/*` — operacje na plikach
  - Strumieniowanie odpowiedzi (SSE lub WebSocket) dla długich odpowiedzi modeli
  - Logi i pidfile w `/tmp/opencode/most/`

### 2. Konfiguracja modeli i agentów
- Modele i agenci są definiowane w `~/.config/opencode/opencode.json` (sekcje `providers`, `models`, `agent`)
- Revers-bridge czyta konfigurację z tego plika lub pobiera przez `/api/model`, `/api/agent`
- **Nie trzeba dodawać modelu przez MCP** — modele to konfiguracja lokalna OpenCode, nie zasób MCP

### 3. Baza sesji (lekka)
- Mapowanie: `web_session_id` ↔ `opencode_session_id` ↔ `repo_path`
- Może być plik JSON lub SQLite w `/tmp/opencode/most/`

### 4. Bezpieczeństwo
- CORS dla webowej aplikacji
- Rate limiting (modele free mają limity req/min i token/dzień)
- `ALLOWED_ROOTS=/path/to/projects` — webowa aplikacja nie powinna wyjść poza ten katalog
- Nie przechowywać tokenów API kluczy w revers-bridge (używać tych z konfiguracji OpenCode)

---

## Warunki brzegowe

| Warunek | Opis |
|---------|------|
| **API v2 OpenCode** | Serwer OpenCode na porcie 4096 musi działać (obecnie tak — PID 811376) |
| **Uwierzytelnianie OpenCode** | Revers-bridge musi znać `OPENCODE_SERVER_USERNAME` / `OPENCODE_SERVER_PASSWORD` z `.env` mostu |
| **Model i agent muszą istnieć** | W `opencode.json` muszą być zdefiniowane providery i modele (np. `kilo/nvidia/nemotron-3.5-super-vl:free`) |
| **ALLOWED_ROOTS** | Webowa aplikacja ma dostęp tylko do `/path/to/projects` |
| **Brak natywnego fallendu modeli w OpenCode** | Jeśli model wyczerpie limity, revers-bridge musi sam obsłużyć fallback (patrz `model-fallback-proposal.md`) |
| **MCP nie dodaje modeli** | W OpenCode modele dodaje się w `opencode.json`, nie przez serwery MCP |
| **Strumieniowanie** | OpenCode v2 obsługuje strumieniowanie (SSE/NDJSON) — revers-bridge musi to przepisać do webowej aplikacji |
| **Brak commita / braku restartu** | Obecne zmiany w mostu nie zostały zscommiteowane ani zrestartowane — revers-bridge nie powinien zależeć od niescommietowanych zmian |

---

## Czy można dodać model przez MCP?

**Nie.** W OpenCode V2:
- **MCP (Model Context Protocol)** służy do podłączania zewnętrznych narzędzi, zasobów i promptów (np. filesystem, context7, web-researcher) — nie do dodawania modeli LLM.
- **Modele LLM** definiuje się w `~/.config/opencode/opencode.json` w sekcjach `providers` (np. `kilo`, `openrouter`, `groq`, `zai`) oraz `models` wewnątrz każdego providera.
- Revers-bridge powinien czytać modele z konfiguracji OpenCode lub z endpointu `GET /api/model`, a nie próbować dodawać ich przez MCP.

---

## Wnioski i rekomendacje

### 1. Stos technologiczny
Node.js + TypeScript, najlepiej w tym samym repozytorium co most (`.`), aby można było reuse'ować `src/opencode/client.ts`.

### 2. Port nowego serwera
`8799` (lub inny wolny), pidfile i logi w `/tmp/opencode/most/reverse-bridge.*`.

### 3. Zakres MVP
- Uwierzytelnianie (prosty API key lub Bearer token)
- Tworzenie sesji OpenCode z revers-bridge
- Wysyłanie promptów i pobieranie odpowiedzi (z SSE)
- Lista dostępnych agentów i modeli
- Mapowanie sesji web ↔ OpenCode

### 4. Co nie należy robić w tym etapie
- Nie dodawać modeli przez MCP (nie da się)
- Nie modyfikować istniejącego mostu bez zgody (inny agent naprawia kod mostu)
- Nie commitać zmian bez zgody
- Nie restartować mostu ani OpenCode

### 5. Kolejny krok
Jeśli zatwierdzisz tę architekturę, kolejnym krokiem jest implementacja prototypu serwera revers-bridge (najpierw health check + lista modeli/agentów, potem pełny proxy do sesji).

---

## Status
**Plan zatwierdzony do analizy — nie wdrożono jeszcze kodu.**

Plik: `docs/research/reverse-bridge-architecture.md`
