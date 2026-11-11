# Raport porządkowania i gotowości repozytorium

- **Data:** 2026-11-11
- **Repozytorium:** katalog główny projektu (`.`)
- **Wersja:** `1.0.0-beta.1`
- **Punkt odniesienia:** `34f69c363874816ec59d0811a637ae9b1a30596e` (`main`)

## 1. Wynik

Repozytorium zostało uporządkowane dokumentacyjnie i przygotowane do dalszego przeglądu przed commitem. Niezbędne pliki kodu, testów, dokumentacji i źródeł pluginu zostały dodane do stagingu. Główny `README.md` pozostaje poza stagingiem do osobnego opracowania. Nie wykonano commita ani push.

Gałąź `main` pozostaje zsynchronizowana z `origin/main` według lokalnego stanu Git (0 commitów ahead / 0 behind). Nie ma nowego taga wydania.

## 2. Porządki w plikach

### Usunięte

- `tests/opencode-client.test.new`
- `tests/opencode-client.test.ts.new`

Były to niepodłączone, starsze kopie testów klienta. Ich scenariusze MCP są pokryte w `tests/mcp-tools.test.ts`, które uruchamia prawdziwy serwer MCP przez transport in-memory. Wadliwy duplikat testów MCP usunięto również z `tests/opencode-client.test.ts`; pozostałe testy klienta zachowano.

### Przeniesione do katalogów tematycznych

- `ARCHITECTURE-REVERSE-BRIDGE.md` → `docs/research/reverse-bridge-architecture.md`
- `Plan-wdrożenia-Gemini.md` → `docs/research/gemini-bridge-assessment.md`
- `fallend-modeli.md` → `docs/research/model-fallback-proposal.md`
- `przenoszenie-projektu.md` → `docs/roadmap/session-move.md`
- `docs/PLAN-UNIVERSAL-TOOL-GATEWAY.md` → `docs/research/universal-tool-gateway.md`

Treści zachowano. Dodano jawne oznaczenia, które z tych materiałów są propozycjami, niezaimplementowanymi funkcjami lub kierunkami poza zakresem bieżącego Bridge.

### Zachowane jako niezbędne

- `src/mcp/session-lifecycle.ts`, `src/opencode/selection.ts`, `src/opencode/session-cli.ts` — aktywne moduły implementacji.
- `plugin-source/opencode-bridge/` — manifest zgodny z formatem zainstalowanej aplikacji ChatGPT, katalog 22 akcji i instrukcje pluginu; test manifestu korzysta z tych plików.
- `pnpm-workspace.yaml` — konfiguracja pnpm używana w repozytorium.
- nowe testy regresyjne, bezpieczeństwa, cyklu życia sesji i selekcji modeli.
- `dist/` pozostawiono lokalnie jako artefakt kompilacji; katalog jest ignorowany przez Git.

## 3. Dokumentacja i metadane

- Przepisano `INSTALL.md` zgodnie z rzeczywistymi wartościami domyślnymi, konfiguracją tunelu i ograniczeniem LaunchAgent do macOS.
- Przebudowano `TODO.md`: usunięto nieaktualne zadania migracji API v1→v2 i pollingu; wpisano rzeczywiste nierozstrzygnięte testy.
- Dodano `docs/README.md` jako indeks dokumentacji.
- Zaktualizowano `docs/CHANGELOG.md`, `docs/session-lifecycle.md`, politykę modeli agentów i źródła pluginu ChatGPT. Główny `README.md` pozostaje do osobnego opracowania; jego istniejące zmiany pozostawiono nietknięte i poza stagingiem.
- Wersja npm package i serwera MCP: `1.0.0-beta.1`. Prywatna aplikacja ChatGPT została zaktualizowana osobno do wersji `1.0.1`.
- Przypięto pnpm `11.18.0` w `package.json`.
- Poprawiono opis konfiguracji: `init` ustawia tunel `none`; tryb foreground i macOS LaunchAgent mają odrębne zachowanie Tailscale Funnel.

## 4. Synchronizacja z aplikacją ChatGPT

- Odczytano źródła aktualnie zainstalowanej prywatnej aplikacji ChatGPT przez Plugin Creator.
- Zaktualizowano istniejącą aplikację w miejscu z wersji `1.0.0` do `1.0.1`; zachowano jej App binding, nazwę, prezentację i prywatny zakres.
- Dodano do aplikacji pięć skilli oraz katalog 22 akcji dostępnych dla ChatGPT.
- Po aktualizacji ponownie odczytano pliki aplikacji. Potwierdzono obecność pięciu skilli, katalogu akcji, manifestu w wersji `1.0.1` i zachowanego `.app.json`.
- Lokalny serwer MCP rejestruje 23 narzędzia. Dodatkowe `opencode_delete_session_by_locator` nie jest udostępniane przez zainstalowaną aplikację ChatGPT. Nie usuwano go z serwera.
- Publiczny szablon w repozytorium nie zawiera prywatnego App ID. Zawiera wyłącznie placeholder.

## 5. Ochrona danych lokalnych

Dodano reguły ignorowania dla:

- `.env` — nie był odczytywany ani publikowany;
- `agenci.md` i `.agents/` — lokalna konfiguracja agentów;
- `plugin-source/original/` i lokalnego archiwum pluginu — prywatne mapowanie aplikacji i snapshot oryginalnego artefaktu.

Z przykładów, testów i dokumentów usunięto lokalne ścieżki, prywatną nazwę hosta Tailscale, identyfikator prywatnej aplikacji i prywatny tytuł sesji. Skan publikowalnych plików nie wykazał tych danych po zmianach.

## 6. Testy i kontrola jakości

Środowisko: Node.js `v22.23.4`, pnpm `11.18.0`.

| Kontrola | Wynik |
|---|---|
| `pnpm install --frozen-lockfile` | PASS |
| TypeScript typecheck | PASS |
| Vitest | PASS — 14 plików, 107 testów |
| Build TypeScript | PASS |
| `git diff --check` | PASS |
| Względne linki Markdown | PASS |
| Wersja npm package/serwera MCP | PASS — `1.0.0-beta.1` |
| Wersja prywatnej aplikacji ChatGPT | PASS — `1.0.1` po aktualizacji Plugin Creator |
| `pnpm pack --dry-run` | PASS |

Podgląd paczki npm zawiera skompilowane `dist/`, `package.json`, `README.md` i `LICENSE`. Nie zawiera lokalnych plików konfiguracyjnych ani katalogu testów/źródeł.

Dodano `.github/workflows/ci.yml`: workflow uruchamia zamrożoną instalację i `pnpm validate` przy push i pull request na `main`. Workflow nie został jeszcze uruchomiony na GitHub, ponieważ nie wykonano push. `actionlint` nie jest zainstalowany lokalnie, więc plik nie przeszedł niezależnej walidacji tym narzędziem.

## 7. Otwarte punkty przed stabilnym 1.0

1. Użytkownik potwierdził produkcyjne działanie aplikacji z rzeczywistym OpenCode oraz równoległą pracę kilku agentów. Nie powtarzałem tego testu w tej turze.
2. Automatyczne wznowienie modelu ChatGPT wyłącznie po asynchronicznym `notifications/message` nie było osobno obserwowane podczas tej aktualizacji. Aplikacja udostępnia `opencode_wait_for_completion` jako jawny mechanizm oczekiwania.
3. GitHub Actions nie został jeszcze uruchomiony, ponieważ nie wykonano push.
4. Gemini Bridge pozostaje niepotwierdzony: dostępny materiał wykazał health/model listing, ale generowanie zawiesiło się po 45 sekundach.
5. `opencode_move_session` nie jest akcją aplikacji ChatGPT.

Szczegóły są w `TODO.md`.

## 8. Stan Git i zalecenie

- Branch: `main`
- Upstream: `origin/main`
- Lokalny HEAD: `34f69c363874816ec59d0811a637ae9b1a30596e`
- Ahead / behind: `0 / 0`
- Niezbędne zmiany kodu, testów, dokumentacji i pluginu są staged.
- Główny `README.md` pozostaje zmodyfikowany, ale unstaged — zgodnie z decyzją o opracowaniu go w kolejnym etapie.
- Nie wykonano commita, taga ani push.

**Ocena:** produkcyjne działanie aplikacji i równoległa praca agentów zostały potwierdzone przez użytkownika. Lokalna walidacja kodu jest zielona. Przed uznaniem repozytorium za gotowe do stabilnego wydania pozostaje uruchomienie GitHub Actions i rozstrzygnięcie, czy automatyczne wznowienie po samym powiadomieniu MCP jest wymaganiem produktu.

## Addendum — 2026-11-11: systemd and final repository review

- Added the Linux systemd user daemon: `opencode-most.target`, `opencode-most.service`, and `opencode-most-tunnel.service`, together with installer, uninstaller, credential wrapper, and regression tests. These files are required for installation, operation, and safe removal; none were classified as obsolete.
- Retired the former manual `most` launcher from `$HOME/.local/bin/most`. A permission-restricted recovery copy remains in the external backup directory; active systemd services were not stopped or modified by this removal. The separate `most-mcp` executable was not touched.
- Replaced the installer's machine-specific absolute tunnel path with a configurable `TUNNEL_DIR` default under `$HOME`; `TUNNEL_BIN` and `TUNNEL_KEY` remain independently overridable.
- Removed local home-directory and backup paths from the publishable systemd plan/spec. Updated documentation to describe systemd as the current Linux service manager.
- Current verification: `pnpm run validate` passed — TypeScript typecheck, 15 test files / 119 tests, and production build. The three user units were observed as `active`. A fresh `systemd-analyze --user verify`, shell syntax check, package dry run, and Markdown link scan are still part of the final pre-commit gate.
- The original cleanup report's earlier count of 14 files / 107 tests is a historical result from before the systemd addition; the current result is 15 files / 119 tests.
