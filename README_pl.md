# OpenCode Most

**Aktualna wersja beta:** `1.0.0-beta.1`

OpenCode Most to silnie zmodyfikowany widelce (fork) projektu [yuga-hashimoto/opencode-chatgpt-bridge](https://github.com/yuga-hashimoto/opencode-chatgpt-bridge). Łączy ChatGPT z lokalnym środowiskiem OpenCode przez endpoint MCP i bezpieczny tunel, oraz wspomaga koordynację wielu agentów OpenCode równolegle bez przełączania się między ChatGPT a OpenCode.

Niniejsze repozytorium nie jest niezmodyfikowanym wydaniem źródłowym. Dodaje przepływy pracy wieloagentowe, trwałe obsługę sesji, bogatszy wybór modeli i agentów, diagnostykę oraz zarządzany przepływ tunelu.

To samodzielny projekt skoncentrowany na przypadku użycia mostu ChatGPT <-> OpenCode.

```text
ChatGPT / ChatGPT Mobile
  -> bezpieczny tunel HTTPS
  -> opencode-most /mcp
  -> lokalny opencode serve
  -> lokalne repozytorium
```

## Szybki start

Po opublikowaniu swojego widelca, zamień poniższy adres URL klonowania na adres URL swojego repozytorium `opencode-most`.

```bash
git clone <adres-url-twojego-repozytorium-opencode-most>
cd opencode-most
pnpm install
pnpm run build
pnpm run init -- --allowed-roots /ścieżka/do/repozytoriów
pnpm start
```

`init` zapisuje lokalny plik `.env` z losowym tokenem mostu, Twoimi dozwolonymi korzeniami repozytoriów oraz automatycznym wyborem portu. Tunelowanie jest wyłączone domyślnie (`OPENCODE_BRIDGE_TUNNEL=none`); skonfiguruj Cloudflare lub Tailscale jawnie, gdy jest potrzebne.

Gdy most się uruchomi, drukuje instrukcję konfiguracji z:

- lokalnym adresem URL health
- lokalnym adresem URL MCP
- automatycznym wyborem portu, gdy preferowany port jest już zajęty
- publicznym adresem URL MCP, gdy tunel jest włączony; tunel Tailscale Funnel w trybie przednim używa portu 8443, mientras konfiguracja LaunchAgent dla macOS używa portu 10000
- linkiem do ustawień ChatGPT
- nazwą, opisem i adresem URL do wklejenia w konnektorze
- uwierzytelnianiem nagłówkowym i rezerwowym tokenem URL
- statusem i uwagami konfiguracyjnymi CLI opencode
- pierwszą próbną wiadomością do ChatGPT

## Wymagania

- Node.js w wersji 20+
- pnpm w wersji 11.18.0 (przypięte w `package.json`; zalecany Corepack)
- `opencode` zainstalowany i uwierzytelniony lokalnie
- `cloudflared` przy użyciu tunelu Cloudflare, lub Tailscale przy użyciu Tailscale Funnel (oba opcjonalne, jeśli dostarczasz własny endpoint HTTPS)

Sprawdź opencode:

```bash
opencode --version
opencode
```

Uruchom `opencode` raz wewnątrz repozytorium i upewnij się, że Twój dostawca modeli jest skonfigurowany, zanim oczekujesz, że ChatGPT będzie nim sterować. OpenCode Most uruchamia `opencode serve` dla każdego repozytorium i komunikuje się z nim przez HTTP. Możesz poprosić ChatGPT o sprawdzenie dostawców, modeli, agentów i metod uwierzytelniania dostępnych w Twoim lokalnym środowisku OpenCode.

## Komendy

```bash
opencode-most init --allowed-roots /ścieżka/do/repozytoriów
opencode-most start
opencode-most doctor
```

Z źródła, używając pnpm:

```bash
pnpm run init -- --allowed-roots /ścieżka/do/repozytoriów
pnpm start
pnpm run doctor
```

## Tryb w tle na macOS

Nie musisz trzymać otwartego terminala. Zainstaluj most jako użytkownika LaunchAgent:

```bash
pnpm run build
pnpm run install-service
pnpm run service-status
```

Logi są zapisywane do:

```text
~/.opencode-chatgpt-bridge/bridge.log
~/.opencode-chatgpt-bridge/bridge.err.log
```

Aby zatrzymać tryb w tle:

```bash
pnpm run uninstall-service
```

Instalator macOS konfiguruje również Tailscale Funnel na publicznym porcie 10000 i wymaga zainstalowanego, zalogowanego Tailscale z dozwolonym Funnel. Usługa używa katalogu tego repozytorium jako katalogu roboczego, ładuje `.env`, uruchamia most i utrzymuje go przy życiu po zalogowaniu.

## Usługa w tle w systemie Linux (systemd użytkownika)

W systemie Linux OpenCode Most może uruchamiać się automatycznie po zalogowaniu do sesji graficznej. Usługa użytkownika uruchamia lokalny most MCP, czeka na jego endpoint health, a następnie uruchamia istniejący klienta bezpiecznego tunelu MCP. systemd uruchamia ponownie którykolwiek z procesów po awarii i zatrzymuje oba procesy po zakończeniu sesji graficznej.

Z katalogu głównego repozytorium:

```bash
pnpm install
pnpm run build
pnpm run install-user-service
systemctl --user status opencode-most.target opencode-most.service opencode-most-tunnel.service
```

Instalator używa istniejącego pliku `.env`, binarnego klienta tunelu i klucza tunelu. Domyślnie szuka w `$HOME/Projekty/OmniCommanderMCP/tunnel-client-v0.0.16-linux-amd64/`; ustaw `TUNNEL_DIR`, `TUNNEL_BIN` lub `TUNNEL_KEY`, aby nadpisać te ścieżki. Klucz jest dostarczany do systemd przez `LoadCredential=`; nie jest kopiowany do tego repozytorium ani nie jest osadzany w pliku jednostki. Instalator odmawia nadpisania jednostek, których nie posiada, ale może bezpiecznie odświeżyć jednostki zainstalowane wcześniej przez OpenCode Most.

Aby usunąć tylko jednostki użytkownika OpenCode Most:

```bash
pnpm run uninstall-user-service
```

Były ręczny launcher `most` został wycofany. Używaj celu systemd do zarządzania mostem Linux i tunelami.

## Konfiguracja ChatGPT

Otwórz ChatGPT w przeglądarce i przejdź do:

```text
https://chatgpt.com/#settings/Connectors
```

Ścieżka ręczna:

```text
Ustawienia -> Aplikacje i konektory -> Ustawienia zaawansowane -> włącz tryb deweloperski
Ustawienia -> Konektory -> Utwórz
```

Użyj wartości wydrukowanych przez most. Wyglądają one tak:

```text
Nazwa konektora: lokalny most opencode
Opis: Kontroluj lokalne sesje opencode, sprawdzaj diffy i zarządzaj lokalnymi zadaniami programistycznymi.
Adres URL konektora: https://example.trycloudflare.com/mcp?token=<wygenerowany-token>
```

Jeśli interfejs konektora ChatGPT obsługuje nagłówki uwierzytelniania, możesz użyć zwykłego adresu URL `/mcp` i ustawić:

```text
Authorization: Bearer <OPENCODE_BRIDGE_TOKEN>
```

Jeśli nie, użyj wygenerowanego rezerwowego wariantu URL `?token=`.

Po powiązaniu w ChatGPT Web, konektor powinien być dostępny w aplikacjach mobilnych ChatGPT.

## Konfiguracja opencode

Most nie wymaga dodatkowej konfiguracji projektu opencode, ale sam opencode musi być używalny lokalnie.

Most uruchamia opencode w ten sposób:

```bash
OPENCODE_SERVER_USERNAME=opencode \
OPENCODE_SERVER_PASSWORD=<wygenerowane-lub-z-env-hasło> \
opencode serve --hostname 127.0.0.1 --port <auto>
```

Uwagi:

- Jeśli `OPENCODE_SERVER_PASSWORD` nie jest ustawione, most generuje losowe hasło na każdy zarządzany serwer opencode.
- Jeśli istnieje plik `~/.local/state/opencode/service.json`, jego pola `url` i `password` są źródłem prawdy i są czytane ponownie przy każdym żądaniu API OpenCode. Zmiany portów i rotacja hasła więc wchodzą w życie bez restartu mostu. Ścieżka dziedziczna `~/.config/opencode/service.json` nie jest używana.
- Jeśli plik usługi nie ma pola `url`, `OPENCODE_BASE_URL` może określić istniejący serwer OpenCode zamiast tworzyć nowy.
- Serwer opencode jest utrzymywany na `127.0.0.1`; tylko most jest wystawiany do ChatGPT.
- Logowanie dostawcy/modelu jest obsługiwane przez opencode. Uruchom `opencode` w terminalu najpierw i potwierdź, że potrafi odpowiedzieć/edytować przed użyciem ChatGPT.

## Funkcje

- Endpoint MCP Streamable HTTP pod `/mcp` dla konektorów ChatGPT i klientów MCP.
- Zarządzanie procesem `opencode serve` na każde repozytorium.
- Bezpieczna lista dozwolonych repozytoriów z sprawdzaniem realpath.
- Token nośnika mostu do użytku wystawionego/tunelowanego.
- Rezerwowy token URL dla interfejsów konektora, które nie obsługują niestandardowych nagłówków.
- Trwałe mapowanie sesji mostu i jedna aktywna sesja OpenCode na repozytorium w `~/.opencode-chatgpt-bridge/sessions.json`.
- Oczekiwanie na zakończenie oparte na zdarzeniach przez OpenCode v2 SSE (`/api/event`), z natychmiastowym powrotem, gdy odpowiedź już istnieje i obsługą ponownego połączenia.
- Wybór modelu i agenta zweryfikowany względem aktywacji dostawcy, dostępności modelu, obsługi wywołań narzędzi, modeli przypiętych do agentów, wariantów, limitów kontekstu/wyjścia i metadanych kosztów.
- Pozostałe limity konta dostawcy nie są ujawniane przez OpenCode; odpowiedzi HTTP 429 i wskazówki `Retry-After` są przekazywane, zamiast wymyślać szacunki limitów.
- Narzędzia do jawnego tworzenia/dołączania sesji, trwałych aktywnych sesji, asynchronicznych zapytań, oczekiwania na zakończenie, pobierania wiadomości, przeglądu diffu, przerwania, odpowiedzi na uprawnienia, odczytu plików, wyszukiwania plików, statusu VCS, agentów, komend ukośnika i diagnostyki dostawcy/modelu.
- Opcjonalny launcher tunelu szybkiego Cloudflare.
- TypeScript, rygorystyczna kontrola typów i testy jednostkowe.

## Czego możesz dokonać z OpenCode Most

- Poproś ChatGPT o sprawdzenie i pracę z repozytoriami na Twoim komputerze poprzez skonfigurowane środowisko OpenCode.
- Deleguj niezależne części zadania do wielu agentów OpenCode i niech pracują równolegle.
- Trzymaj pracę dołączoną do istniejących sesji OpenCode w kolejnych żądaniach zamiast zaczynać nową sesję za każdym razem.
- Wybierz kompatybotne modele i agenty do zadania, a następnie porównaj ich wyniki.
- Sprawdzaj zmiany i diffy, inspekcjonuj status projektu i zatwierdzaj lub odrzucaj proponowane modyfikacje.
- Kontynuuj długotrwałe zadania asynchronicznie i pobieraj wyniki, gdy agenci skończą.
- Inspekcjonuj dostępnych dostawców, modele, agentów i lokalną diagnostykę usługi OpenCode.
- Użyj bezpiecznego tunelu, aby połączyć ChatGPT z lokalnym endpointem MCP bez wystawiania serwera OpenCode.

## Przykładowa wiadomość ChatGPT

```text
Użyj OpenCode Most, aby sprawdzić /ścieżka/do/mojego-repozytorium. Ponów użycie istniejącej sesji OpenCode dla tego repozytorium. Zidentyfikuj odpowiednich agentów i modele, deleguj niezależne podzadania do wielu agentów równolegle i informuj mnie o blokadach. Nie twórz nowej sesji, chyba że poproszę. Gdy praca zostanie ukończona, podsumuj wyniki i pokaż zmiany do przeglądu przed jakimkolwiek zatwierdzeniem lub wysłaniem.
```

## Model bezpieczeństwa

Ten most może powodować lokalne modyfikacje kodu przez opencode. Traktuj go jako lokalną bramę automatyzacji.

Domyślne zabezpieczenia:

- `opencode` sam jest powiązany z `127.0.0.1`.
- Repozytoria muszą znajdować się w `OPENCODE_BRIDGE_ALLOWED_ROOTS`.
- Most wspiera uwierzytelnianie tokenem nośnika i rezerwowy token URL.
- Żadne narzędzie do dowolnego wykonywania powłoki nie jest wystawiane przez ten most.
- Diffy są traktowane priorytetowo, aby klienci mogli sprawdzić zmiany przed zatwierdzeniem.

Silnie zalecane:

- Zawsze ustaw `OPENCODE_BRIDGE_TOKEN` przed wystawieniem przez dowolny tunel.
- Nie wiąż mostu z `0.0.0.0`, chyba że wiesz dokładnie, która sieć może do niego dotrzeć.
- Trzymaj `OPENCODE_BRIDGE_ALLOWED_ROOTS` wąsko.
- Sprawdź `opencode_get_diff` przed zatwierdzeniem lub wysłaniem wygenerowanych zmian.

## Rozwój

```bash
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
pnpm run validate
```

## Licencja

MIT

### Dokumentacja

Zobacz [`docs/README.md`](docs/README.md) dla indeksu dokumentacji, w tym notatki dotyczące cyklu życia sesji, polityki modeli, mapy drogowej i notatek badawczych.

### Cykl życia sesji i usuwanie

Zobacz [`docs/session-lifecycle.md`](docs/session-lifecycle.md) dla trwałego przepływu pracy sesji, powiadomień o zakończeniu, wyboru modeli i agentów oraz strzeżonej procedury usuwania. Historia implementacji i bieżący rekord weryfikacji znajdują się w [`docs/CHANGELOG.md`](docs/CHANGELOG.md).
