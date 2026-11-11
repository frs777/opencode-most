# Źródła pluginu ChatGPT

Ten katalog przechowuje przenośne źródła skilli i manifestu pluginu opencode-bridge.

## Struktura

- opencode-bridge/ — manifest zgodny z aktualnym formatem pluginu ChatGPT, katalog akcji i skille.
- original/ — lokalny, prywatny snapshot aplikacji; wyłączony z Git.
- opencode-bridge-v1.0.0.tar.gz — lokalne archiwum historyczne; wyłączone z Git.

## Granice

Kod serwera MCP znajduje się w głównym katalogu src/. Plugin ChatGPT dostarcza akcje i instrukcje, a nie implementację serwera.

Prywatny plik .app.json i identyfikator aplikacji nie należą do publicznego repozytorium. Aktualizacja istniejącej aplikacji musi zachować App binding. Nie należy tworzyć nowej aplikacji ani publikować jej jako publicznej.
