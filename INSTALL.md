# Instalacja i uruchomienie

Lokalny most MCP łączy ChatGPT z serwerem OpenCode działającym na komputerze użytkownika. Transport MCP to Streamable HTTP pod endpointem `/mcp`.

## Wymagania

- Node.js 20 lub nowszy
- pnpm 11.18.0 (wersja przypięta w `package.json`; zalecany Corepack)
- OpenCode zainstalowany i skonfigurowany
- HTTPS endpoint/tunel tylko wtedy, gdy most ma być osiągalny zdalnie

## Instalacja

```bash
git clone https://github.com/yuga-hashimoto/opencode-chatgpt-bridge.git
cd opencode-chatgpt-bridge
pnpm install
pnpm run build
```

## Konfiguracja

Utwórz lokalny plik `.env` w katalogu repozytorium:

```bash
pnpm run init -- --allowed-roots /path/to/your/projects
```

Polecenie generuje losowy `OPENCODE_BRIDGE_TOKEN`, zapisuje wskazane katalogi dozwolone i włącza automatyczny wybór kolejnego portu, jeśli domyślny jest zajęty. Nie nadpisuje istniejącego `.env` bez opcji `--force`.

Domyślne ustawienia:
- host: `127.0.0.1`
- port: `8787`
- automatyczny fallback portu: włączony
- tunel: wyłączony (`OPENCODE_BRIDGE_TUNNEL=none`)
- katalog stanu: `~/.opencode-chatgpt-bridge`

Tunel włącz jawnie w `.env`, ustawiając `OPENCODE_BRIDGE_TUNNEL=cloudflare` albo `OPENCODE_BRIDGE_TUNNEL=tailscale`. Wymagany token jest tworzony przez `init`. Zainstaluj i skonfiguruj odpowiedni program tunelujący przed uruchomieniem.

## Uruchomienie

```bash
pnpm start
```

Po starcie sprawdź:
- `http://127.0.0.1:8787/health` — status HTTP (użyj portu wypisanego przez proces, jeśli nastąpił fallback)
- `http://127.0.0.1:8787/mcp` — endpoint MCP

Most drukuje instrukcję połączenia, w tym adres publiczny, jeżeli tunel jest włączony. Do ChatGPT użyj adresu MCP i uwierzytelniania Bearer. Gdy klient nie obsługuje nagłówka Authorization, użyj wygenerowanego wariantu URL z tokenem.

## Połączenie z ChatGPT

W ustawieniach ChatGPT włącz Developer mode, utwórz połączenie MCP i wklej adres wydrukowany przez most. Dostępność i nazwy ekranów zależą od aktualnego interfejsu ChatGPT.

Po połączeniu sprawdź narzędzia przez `bridge_health` i `list_projects`. Przed wysłaniem zadania do repozytorium:
1. sprawdź aktywną sesję;
2. dołącz istniejącą sesję, jeśli ma być kontynuowana;
3. twórz nową sesję tylko wtedy, gdy jest to zamierzone;
4. po pracy sprawdź diff przez `opencode_get_diff`.

Pełny opis funkcji, narzędzi i modelu bezpieczeństwa znajduje się w [README](README.md).

## Tryb usługi w tle (macOS)

Projekt zawiera integrację LaunchAgent dla macOS:

```bash
pnpm run build
pnpm run install-service
pnpm run service-status
```

Odinstalowanie usługi:

```bash
pnpm run uninstall-service
```

Instalator LaunchAgent konfiguruje również Tailscale Funnel na publicznym porcie HTTPS 10000. Wymaga zainstalowanego, zalogowanego Tailscale z włączoną możliwością użycia Funnel. To polecenie nie jest instalatorem usługi dla Linux ani Windows. Na tych platformach uruchamiaj most jako proces użytkownika lub skonfiguruj własny nadzorowany proces.

## Diagnostyka i testy

```bash
pnpm run doctor
pnpm run typecheck
pnpm test
pnpm run build
pnpm run validate
```

## Bezpieczeństwo

- Nie wystawiaj mostu na publiczny interfejs bez tokena.
- Pozostaw host `127.0.0.1`, chyba że świadomie konfigurujesz inną granicę sieciową.
- Ogranicz `OPENCODE_BRIDGE_ALLOWED_ROOTS` do repozytoriów, do których ChatGPT ma mieć dostęp.
- Nie publikuj `.env`, tokenów ani danych uwierzytelniających.
- Serwer OpenCode jest uruchamiany lokalnie na loopback; zdalnie wystawiany jest wyłącznie most.
- Most umożliwia lokalne operacje na kodzie przez OpenCode. Sprawdzaj diff przed zatwierdzeniem lub wysłaniem zmian.
