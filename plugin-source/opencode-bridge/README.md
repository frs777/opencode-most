# Plugin ChatGPT: opencode-bridge

Ten katalog zawiera źródła skilli i manifest zgodny ze strukturą pluginu używaną przez aktualnie zainstalowaną aplikację ChatGPT.

## Źródło prawdy

Aplikacja ChatGPT opencode-bridge została odczytana przez Plugin Creator 2026-11-11. Jej identyfikator aplikacji i manifest zachowują prywatne powiązanie konta. Nie umieszczaj prywatnego .app.json w publicznym repozytorium.

- .codex-plugin/plugin.json — przenośny szablon manifestu aplikacji.
- .app.json.example — przykład prywatnego powiązania; zastąp wartość placeholdera wyłącznie w lokalnym pakiecie.
- CHATGPT-TOOLS.md — aktualny katalog 22 akcji widocznych dla ChatGPT.
- skills/*/SKILL.md — instrukcje dla aplikacji.

## Wersja

Źródłowa wersja pluginu: 1.0.1. Wersja npm serwera Bridge jest niezależna.

## Kontrakt aplikacji

Aplikacja ChatGPT udostępnia 22 akcje. Lokalny serwer MCP rejestruje 23 narzędzia, w tym dodatkowe opencode_delete_session_by_locator, którego aplikacja ChatGPT obecnie nie udostępnia. Szczegóły i sygnatury: [CHATGPT-TOOLS.md](CHATGPT-TOOLS.md).

Aplikacja została sprawdzona produkcyjnie. Użytkownik potwierdził równoległą pracę kilku agentów. Nie traktuj tego scenariusza jako funkcji niezweryfikowanej.

## Aktualizacja prywatnej aplikacji

Aktualizuj istniejącą aplikację przez Plugin Creator z zachowaniem jej bieżącego App binding, nazwy, prezentacji i konfiguracji MCP. Nie twórz nowej aplikacji i nie zmieniaj jej identyfikatora. Plik .app.json pozostaje prywatny i nie trafia do Git.
