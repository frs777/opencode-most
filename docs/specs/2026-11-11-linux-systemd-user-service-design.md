# OpenCode Most — Linux systemd user service design

## Nazewnictwo projektu

- Zatwierdzona nazwa projektu i docelowa nazwa repozytorium GitHub: `opencode-most`.
- Lokalna ścieżka robocza została przemianowana na `opencode-most`; zdalny adres `origin` pozostaje upstreamem do czasu osobnej decyzji o repozytorium GitHub.
- Nazwa istniejącego pluginu ChatGPT pozostaje `opencode-bridge`.
- Profil klienta tunelu pozostaje `opencode-bridge`.
- `most-mcp` oraz `opencode-gemini-live-bridge` należą do innych projektów i są całkowicie poza zakresem zmian.

## Cel

Automatyczne uruchamianie lokalnego Bridge MCP i klienta OpenAI Secure MCP Tunnel po zalogowaniu użytkownika do graficznej sesji Linuksa. Systemd zastępuje wcześniejszy ręczny launcher; obsługa i diagnostyka odbywają się przez `systemctl --user`.

## Stan istniejący

- Repozytorium: katalog główny projektu OpenCode Most.
- Bridge działa na `127.0.0.1:8790`; port jest odczytywany z istniejącego `.env` podczas instalacji.
- Tunel uruchamiany jest przez `tunnel-client run --profile opencode-bridge`, a gotowość sygnalizuje `http://127.0.0.1:8081/readyz`.
- Klient tunelu i plik klucza istnieją w katalogu wskazanym przez `TUNNEL_DIR` (domyślnie `$HOME/Projekty/OmniCommanderMCP/tunnel-client-v0.0.16-linux-amd64/`).
- Wcześniejszy launcher ręczny `most` został wycofany po wdrożeniu systemd; jego kopia bezpieczeństwa pozostaje poza repozytorium.
- Usługa macOS LaunchAgent pozostaje bez zmian.
- User systemd ma aktywny `graphical-session.target`; systemd działa w wersji 262. Ustawienie linger jest już włączone i nie będzie zmieniane.

## Architektura

Bez własnego supervisora. Systemd zarządza dwoma niezależnymi usługami i jednym targetem:

1. `opencode-most.service` uruchamia `node dist/cli.js start` w katalogu repozytorium i ładuje istniejący `.env`. Polityka restartu: `Restart=on-failure`.
2. `opencode-most-tunnel.service` uruchamia istniejący `tunnel-client run --profile opencode-bridge`. Zależy od Bridge, startuje po nim, sprawdza `/health` przed uruchomieniem tunelu i ma `Restart=on-failure`. Powiązanie z usługą Bridge ma powodować zatrzymanie/restart tunelu przy zatrzymaniu/restartowaniu Bridge.
3. `opencode-most.target` grupuje obie usługi, jest dołączony do `graphical-session.target` przez `WantedBy=` i ma `PartOf=graphical-session.target`, więc startuje po zalogowaniu i zatrzymuje się przy końcu sesji graficznej. Obie usługi mają `PartOf=opencode-most.target`, co propaguje zatrzymanie targetu na procesy.

Klucz tunelu nie będzie wpisywany do pliku jednostki ani kopiowany do repozytorium. Usługa użyje systemd credentials, wskazując istniejący plik klucza jako źródło poświadczenia. Nie zmienia się zawartości klucza ani profilu tunelu.

## Instalacja i rollback

- Skrypt instalacyjny wykrywa katalog repozytorium, Node.js, binarny klient tunelu, plik klucza oraz istniejące jednostki o tych nazwach.
- Skrypt tworzy jednostki w `~/.config/systemd/user/`, wykonuje `systemctl --user daemon-reload`, a następnie włącza i uruchamia target.
- Skrypt odinstalowujący zatrzymuje i wyłącza tylko target tego Bridge, usuwa wyłącznie jednostki utworzone dla niego i ponownie ładuje konfigurację systemd.
- Nie wolno zatrzymywać ani zmieniać jednostek `opencode-gemini-live-bridge`, usług OmniCommander, projektu `most-mpc`, OpenCode ani innych usług użytkownika.
- Nie uruchamiać równolegle drugiej instancji Bridge ani tunelu poza systemd na tych samych portach.

## Dokumentacja projektu

README ma jasno informować, że repozytorium jest forkiem projektu [yuga-hashimoto/opencode-chatgpt-bridge](https://github.com/yuga-hashimoto/opencode-chatgpt-bridge), ale obecna wersja została mocno zmodyfikowana. Opis ma podać oryginalne źródło i rzeczowo wskazać główne obszary rozbudowy, bez sugerowania, że to niezmodyfikowany upstream.

Dokumentacja użytkowa ma opisywać działanie i instalację, nie ujawniać wewnętrznych kontraktów narzędzi MCP przeznaczonych dla modelu.

## Weryfikacja

- Testy jednostkowe skryptów instalacji/renderowania i walidacji wymaganych ścieżek.
- `systemd-analyze --user verify` dla wszystkich jednostek.
- `systemctl --user daemon-reload`, kontrola stanu targetu i obu usług.
- Test gotowości Bridge i tunelu przez ich endpointy HTTP.
- Test restartu po awarii każdego procesu.
- Test zatrzymania targetu i potwierdzenie, że oba procesy zakończyły działanie.
- `systemctl --user status opencode-most.target opencode-most.service opencode-most-tunnel.service` ma potwierdzić stan obu komponentów, a `git diff --check`, testy projektu, typecheck i build mają pozostać bez błędów.

## Granice zmian

Nie zmieniać konfiguracji OpenCode, istniejącego `.env`, zawartości pliku klucza tunelu ani profilu tunelu. Nie zmieniać `cob` ani usług innych projektów. Przed modyfikacją repozytorium i systemd zachować kopię bezpieczeństwa. Pierwotny zakaz commita został później zastąpiony wyraźną zgodą użytkownika na commit po przeglądzie repozytorium.
