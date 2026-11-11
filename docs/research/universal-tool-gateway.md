# OpenCode Universal Tool Gateway — plan architektury

- **Status:** plan / research only. Nie jest to implementacja Gateway.
- **Repo:** `opencode-chatgpt-bridge`
- **Wersja badanej instalacji:** OpenCode 2.2.5; lokalny pakiet SDK `@opencode-ai/sdk` 1.18.8.
- **Zasada dowodowa:** `VERIFIED` = potwierdzone w lokalnym kodzie lub OpenAPI uruchomionej instancji; `INFERENCE` = wniosek architektoniczny; `UNKNOWN` = wymaga dalszej weryfikacji.

## 1. Cel i kryterium sukcesu

ChatGPT ma otrzymać jeden stabilny interfejs MCP, przez który może:

- odkrywać narzędzia dostępne w OpenCode i skonfigurowanych downstream MCP;
- odczytywać nazwę, opis i JSON Schema argumentów;
- wywoływać konkretne narzędzie bez delegowania samego wywołania agentowi;
- otrzymywać pełny wynik, błąd i treści multimodalne;
- obsługiwać operacje długotrwałe, status i anulowanie;
- wybierać projekt i istniejącą sesję, bez mieszania kontekstu równoległych operacji;
- odkrywać skille i pobierać ich instrukcje, z zachowaniem rozdziału skill ≠ tool.

**Kryterium STOP:** jeżeli nie zostanie potwierdzony wspierany mechanizm bezpośredniego wykonania narzędzia, Gateway nie może być opisany jako realizujący pełny cel. Wywołanie promptu i obserwowanie, jak agent uruchamia tool, jest trybem agent-mediated, a nie direct tool invocation.

## 2. Ustalenia techniczne

### 2.1 Lokalny OpenAPI OpenCode 2.2.5

**VERIFIED:** lokalny serwer udostępnia `GET /openapi.json`; specyfikacja została odczytana z uruchomionej instancji 2.2.5. Poniższe endpointy i schematy są z tej specyfikacji, a nie z dokumentacji innej wersji.

| Endpoint | Co potwierdza kontrakt | Czego nie potwierdza |
|---|---|---|
| `GET /api/plugin` | Lista `Plugin.Info`: source, features, state | Nie zwraca katalogu wywoływalnych tooli ani operacji ich wykonania |
| `GET /api/mcp` | Lista `Mcp.Server`: name, status, title, integrationID | Nie zwraca listy narzędzi downstream ani ich schematów |
| `GET /api/mcp/resource` | Katalog MCP resources i resource templates | Nie jest katalogiem MCP tools |
| `GET /api/skill` | Lista `Skill.Info`, w tym id, name, description, path i pełny content | Skill jest instrukcją, nie wywoływalnym narzędziem |
| `POST /api/experimental/session/{sessionID}/skill` | Aktywacja/dodanie skillu do kontekstu sesji; odpowiedź 204 | Nie wykonuje samodzielnego toola |
| `GET /api/session/{sessionID}/message` | Historia wiadomości, w tym części tool i ich stany | Odczyt śladu wykonania nie jest API bezpośredniego wywołania toola |
| `POST /api/session/{sessionID}/prompt` | Wysłanie promptu do cyklu agenta | Wykonanie narzędzia przez agenta nie jest direct invocation |
| `POST /api/session/{sessionID}/move` | Natywne przeniesienie sesji | Nie dotyczy Gateway |

**VERIFIED:** `Skill.Info` wymaga `id`, `name`, `path`, `content`; zawiera także opcjonalne `description` i `autoinvoke`. `Mcp.Server` zawiera nazwę i status, a nie tool catalog. `Tool.Content` w typach wiadomości ma warianty tekstowe i plikowe, co trzeba uwzględnić w przyszłym adapterze wyników.

**VERIFIED:** w OpenAPI uruchomionej instancji nie ma tras `/api/tool`, `/api/tools`, `/api/experimental/tool` ani endpointu bezpośredniego wykonania toola. Są trasy zarządzania i statusu MCP, pluginów oraz skillów.

### 2.2 SDK i rozbieżność wersji

**VERIFIED:** na komputerze istnieje `~/.config/opencode/node_modules/@opencode-ai/sdk`, wersja 1.18.8, licencja MIT. Pakiet eksportuje wygenerowanego klienta HTTP i typy. Nie jest obecnie zależnością `opencode-chatgpt-bridge`; bridge ma zależność `@modelcontextprotocol/sdk ^1.29.0`.

**VERIFIED:** wygenerowane typy SDK zawierają `ToolListItem { id, description, parameters }` oraz typy `ToolListData` i `ToolIdsData` dla ścieżek `/experimental/tool` i `/experimental/tool/ids`. Te ścieżki nie występują w OpenAPI działającej instancji 2.2.5. W przeszukanych plikach wygenerowanego klienta SDK nie znaleziono odpowiadających im metod wywołania. To wskazuje na rozbieżność SDK/spec, a nie na dostępność tych endpointów w bieżącym serwerze.

**UNKNOWN:** czy wewnętrzne moduły runtime OpenCode udostępniają stabilny, wspierany publicznie `ToolRegistry` lub `Tool.execute`, możliwy do importowania przez niezależny proces mostu. Sam fakt istnienia SDK i typów narzędzi nie dowodzi takiej możliwości. Wymaga to osobnego przeglądu źródeł/bundla i testu prototypowego przed wyborem architektury.

**Wniosek:** nie wolno obecnie deklarować, że OpenCode 2.2.5 ma publiczne API direct tool invocation. Nie wolno też zastępować go arbitralnym proxy do wszystkich endpointów REST.

### 2.3 Downstream MCP

**VERIFIED:** OpenCode udostępnia `GET /api/mcp` ze statusem serwerów oraz endpointy zarządzania połączeniem, m.in. `/api/experimental/mcp/{server}/connect` i `disconnect`. Odczytany schemat konfiguracji rozróżnia serwery local (command/cwd/environment) i remote (url/headers/oauth). Nie znaleziono w badanym OpenAPI endpointu zwracającego listę narzędzi z serwera MCP ani endpointu proxy `tools/call`.

**INFERENCE:** most może potencjalnie samodzielnie zestawiać połączenia MCP do serwerów opisanych w konfiguracji OpenCode, używając istniejącego `@modelcontextprotocol/sdk`, a następnie agregować `tools/list` i kierować `tools/call`. Wymaga to odtworzenia obsługi transportów, auth/OAuth, sekretów, procesu lokalnego, timeoutów i cyklu życia połączeń. Nie jest to jeszcze potwierdzone dla wszystkich typów konfiguracji OpenCode.

**UNKNOWN:** czy OpenCode przechowuje dodatkowe dane uwierzytelniające lub runtime state poza konfiguracją widoczną w API oraz czy istnieje wspierany sposób ich bezpiecznego odczytu bez modyfikowania OpenCode. Nie wolno kopiować sekretów do odpowiedzi MCP ani logów.

### 2.4 Skille

**VERIFIED:** `GET /api/skill` zwraca pełne `content` instrukcji oraz `path`; endpoint przyjmuje kontekst lokalizacji. `POST /api/experimental/session/{sessionID}/skill` służy do aktywacji skillu w konkretnej sesji.

**INFERENCE:** najbezpieczniej pobierać skille z katalogu OpenCode dla wybranego `directory`, przechowywać je jako odrębny typ zasobu i przekazywać wybrany skill przez endpoint sesji. Nie rejestrować skillów jako narzędzi `tools/call`.

**UNKNOWN:** pełna macierz źródeł skillów i priorytetów (globalne, użytkownika, projektowe, URL/embedded) w tej instalacji wymaga potwierdzenia na podstawie dokumentacji i runtime. Pole `path` w odpowiedzi jest źródłem dowodowym dla konkretnego znalezionego skillu; nie należy zakładać stałych ścieżek.

## 3. Stan obecnego mostu

| Obszar | Stan |
|---|---|
| MCP server | **VERIFIED:** most już wystawia zestaw narzędzi MCP do sterowania OpenCode; nie wymaga tworzenia osobnego wrappera dla każdego pluginu |
| OpenCode HTTP client | **VERIFIED:** ma `directory` na poziomie instancji klienta; `createSession` przyjmuje katalog i `moveSession` wywołuje natywny endpoint |
| Session mapping | **VERIFIED:** most przechowuje `bridgeSessionId`, `opencodeSessionId` i `repoPath`; mapowanie aktywnych sesji jest związane z repozytorium |
| Weryfikacja lokalizacji | **VERIFIED:** trzeba dopiąć przekazywanie katalogu z narzędzia MCP do `createSession` i porównać odpowiedź `location.directory`; obecne mapowanie samo nie dowodzi, że katalog OpenCode jest zgodny |
| Operacje równoległe | **INFERENCE:** klient z katalogiem ustawionym w konstruktorze wymaga izolacji per kontekst; nie należy mutować współdzielonego klienta między requestami |
| Universal discovery/call | **VERIFIED:** brak w obecnych narzędziach MCP |
| Skills | **VERIFIED:** most nie ma jeszcze pełnego przepływu discover/read/apply skills |
| Downstream MCP aggregation | **UNKNOWN:** nie ma potwierdzonego przepływu agregacji i wykonywania tooli skonfigurowanych w OpenCode |

**Ważne:** `x-opencode-directory` jest nagłówkiem ustawianym na instancji `OpencodeClient`, nie parametrem każdego wywołania. Przyszły Gateway musi wiązać kontekst z pojedynczym żądaniem i izolować go od innych operacji. Nie wolno przełączać katalogu przez mutację wspólnego klienta podczas równoległych requestów.

## 4. Warianty architektury

### Wariant A — adapter do wspieranego runtime/SDK (preferowany warunkowo)

1. Najpierw udowodnić istnienie stabilnego publicznego API/SDK do odczytu rejestru i wywołania toola.
2. Jeśli API istnieje, zbudować adapter z wąskim kontraktem: `discover`, `invoke`, `getStatus`, `cancel`.
3. Jeżeli API runtime nie istnieje, osobno ocenić bezpośrednie połączenia MCP z downstream serwerami przez standardowy MCP SDK. Nie przedstawiać tego jako wykonania wszystkich narzędzi pluginów OpenCode.
4. Zachować granice uprawnień, wyników i kontekstu.

**INFERENCE:** ten wariant najlepiej odpowiada wymaganiu direct invocation, ale jest zależny od potwierdzenia API i kompatybilności wersji.

### Wariant B — agregator bezpośrednich serwerów MCP

1. Most odczytuje konfigurację MCP OpenCode i sam łączy się z każdym dozwolonym serwerem.
2. Agreguje `tools/list` i wykonuje `tools/call` przez standardowy MCP SDK.
3. Każdy serwer ma izolowany transport, auth, timeout, limity i politykę uprawnień.

**INFERENCE:** może spełnić część celu dotyczącą serwerów MCP bez osobnej konfiguracji po stronie ChatGPT, ale nie zapewnia automatycznie narzędzi natywnych i pluginowych OpenCode. Wymaga walidacji lokalnych komend, zdalnych URL, OAuth i przechowywania sekretów.

### Wariant C — agent-mediated fallback (ograniczony)

1. Most odkrywa metadane i skille.
2. ChatGPT zleca agentowi OpenCode zadanie przez istniejącą sesję.
3. Agent sam wybiera i uruchamia narzędzia; most odczytuje wynik z historii/statusu sesji.

**VERIFIED:** obecny przepływ prompt/sesji obsługuje tę klasę działania.

**OGRANICZENIE:** to nie jest direct tool invocation przez ChatGPT. Nie spełnia głównego wymagania Gateway; może istnieć jako jawnie oznaczony fallback.

## 5. Docelowy kontrakt MCP — propozycja, nie implementacja

Unikać narzędzia typu `http_request(url, method, body)` i arbitralnego proxy REST.

Proponowany stabilny interfejs:

- `gateway_discover_tools(context, cursor?, filter?)` — stronicowany katalog narzędzi z `toolId`, `source`, `name`, `description`, `inputSchema`, wymaganym zakresem uprawnień i informacją o trybie wykonania.
- `gateway_call_tool(context, toolId, arguments, approvalToken?)` — wywołanie wyłącznie toola obecnego w katalogu i dozwolonego dla danego kontekstu; nie przyjmuje dowolnego URL ani ścieżki REST.
- `gateway_get_operation(operationId)` — status długiej operacji i jej wynik.
- `gateway_cancel_operation(operationId)` — anulowanie, jeśli źródłowy transport/runtime wspiera cancel.
- Skille: osobne `gateway_discover_skills`, `gateway_get_skill`, `gateway_apply_skill`; te operacje obsługują instrukcje, nie `tools/call`.

To jest propozycja kontraktu, a nie zatwierdzony schemat końcowy. Warto rozważyć połączenie listy operacji status/cancel z istniejącym mechanizmem jobów mostu, jeśli już zapewni odpowiednią izolację.

## 6. Bezpieczeństwo i niezawodność — wymagania

- Allowlist źródeł i narzędzi; domyślnie deny.
- Uprawnienia per tool i per operacja; osobna zgoda dla działań destrukcyjnych, sieciowych, systemowych i modyfikujących pliki.
- Nigdy nie wystawiać dowolnego REST proxy ani dowolnego polecenia shell jako uniwersalnego toola.
- Auth downstream MCP pozostaje po stronie mostu; nie zwracać tokenów/headers/env/sekretów ChatGPT.
- Redakcja sekretów w logach, błędach, wynikach i diagnostyce.
- Walidacja JSON Schema argumentów przed wywołaniem.
- Limity rozmiaru wejścia/wyjścia, czasu, współbieżności i liczby uruchomionych procesów.
- Jawne timeouty, status, cancel i cleanup zasobów.
- Obsługa treści tekstowych i plikowych z `Tool.Content`; nie spłaszczać po cichu plików/binarnych wyników do tekstu.
- Każda operacja ma własny `projectPath`, `bridgeSessionId`, `opencodeSessionId`, `operationId` i snapshot źródła toola.
- Nie logować wrażliwych argumentów ani wyników bez redakcji.

## 7. Macierz braków i testów dowodowych

| Funkcja | Obecny stan | Brak / API | Ryzyko | Test dowodowy |
|---|---|---|---|---|
| Tworzenie/przenoszenie sesji | Klient obsługuje body `location.directory` i `/move` | Integracja MCP, weryfikacja `GET session.location.directory`, atomowe mapowanie | Niespójny katalog lub mapa | Utworzenie/przeniesienie testowej sesji, odczyt lokalizacji, sprawdzenie zachowania ID/historii |
| Ścieżki Windows | **VERIFIED:** wykryto `split(":")` w walidacji ścieżek | `path.delimiter` i regresja | Błędny parsing drive paths | Test ścieżek Windows i POSIX |
| Kontekst per operacja | Directory ustawiany na kliencie | Jawny immutable context i izolowane klienty/transporty | Przeciek kontekstu między projektami | Równoległe requesty na 2 katalogach i 2 sesjach |
| Tool discovery OpenCode | Brak potwierdzonego endpointu w OpenAPI 2.2.5 | Wspierany ToolRegistry/SDK lub inny udowodniony adapter | Fałszywa obietnica funkcji | Test wykrywania prawdziwego toola z jego schema |
| Direct tool invocation | Brak publicznego endpointu w badanym OpenAPI | Potwierdzony adapter runtime albo jawne ograniczenie | Agent-mediated mylone z direct | Wywołanie konkretnego toola bez promptu agenta, kontrola argumentów i wyniku |
| Downstream MCP | API statusu/konfiguracji; SDK MCP jest zależnością bridge | Czytanie configu, auth i adapter transportów | Wycieki sekretów, błędne uprawnienia | Test stdio i remote HTTP, tools/list + tools/call, auth, timeout, cancel |
| Wyniki i błędy | Historia sesji zawiera stany tool; `Tool.Content` tekst/plik | Normalizacja wyniku, błędu i content blocks | Utrata danych/plików | Test tekstu, pliku, błędu i dużego wyniku |
| Długie operacje | Istnieje obsługa wait/status dla sesji | Job API, status, cancel, timeout i cleanup | Zawieszone procesy | Test opóźnionego toola, polling, cancel i restart-safe state |
| Skills | `GET /api/skill` zwraca content; istnieje endpoint apply per sesja | Indeksowanie źródeł i wybór skillu | Mylenie instrukcji z narzędziami | Odkryj skill, pobierz content, apply do wybranej sesji; brak tool-call |
| Uprawnienia | Istnieją mechanizmy permission sesji | Polityka per tool i approval token | Nieautoryzowane działanie | Deny by default, allow, deny, approval dla destrukcyjnych |
| Dokumentacja/bundle | W toku | Instalacja i konfiguracja bez sekretów | Nieprzenośny pakiet | Czysta instalacja i test end-to-end |

## 8. Kolejność prac — aktualizacja planu

Bieżący etap przenoszenia sesji pozostaje niezależny od Gateway i ma zostać domknięty przed jego wdrożeniem.

1. **Dokończyć przenoszenie sesji:** dodać `opencode_move_session`, przekazać repoPath do `createSession`, odczytać sesję po utworzeniu/przeniesieniu, potwierdzić `location.directory` i aktualizować store dopiero po potwierdzeniu. Zachować ten sam `opencodeSessionId` i historię.
2. **Naprawić `path.delimiter`:** `validateRepoPath` oraz wszystkie miejsca parsowania `allowedRoots`; testy POSIX i Windows.
3. **Ustalić kontrakt kontekstu per operacja:** immutable context, routing po projekcie/sesji, izolacja klienta i równoległości, bez mutowania wspólnego `x-opencode-directory`.
4. **Bramka wykonalności Gateway:** sprawdzić runtime/SDK OpenCode i prototypować direct tool invocation na nieszkodliwym narzędziu. Jeśli nie ma wspieranego API, zatrzymać etap i podjąć świadomą decyzję o adapterze lub ograniczeniu celu.
5. **Tool discovery i direct invocation:** katalog źródeł, schematy, walidacja argumentów, bezpieczne wywołanie; bez arbitralnego proxy REST.
6. **Downstream MCP:** odczyt konfiguracji, transporty stdio/HTTP, auth/OAuth, tools/list i tools/call, lifecycle, limity i izolacja.
7. **Długie operacje i wyniki:** operationId, polling/status/cancel, multimodal Tool.Content, błędy, limity i cleanup.
8. **Skills:** źródła, discovery, content, wybór i apply do konkretnej sesji; wyraźny rozdział skill/tool.
9. **Security/approvals/audit:** allowlist, per-tool policy, zgody, redakcja sekretów, log audytowy i testy penetracyjne/regresyjne.
10. **Testy integracyjne:** rzeczywiste discovery i invocation narzędzi, downstream MCP, wiele projektów/sesji, współbieżność, błędy i długie operacje.
11. **Dokumentacja i bundlowanie:** dopiero po potwierdzeniu możliwości i przejściu testów.

## 9. Otwarte pytania przed implementacją Gateway

1. Czy runtime OpenCode 2.2.5 eksportuje wspierany `ToolRegistry`/executor do niezależnego procesu? **UNKNOWN.**
2. Czy istnieje zgodny z OpenCode 2.2.5 SDK, który zawiera te operacje, a nie tylko typy wygenerowane dla innej wersji? **UNKNOWN.**
3. Jak bezpiecznie pobierać i odświeżać poświadczenia downstream MCP bez kopiowania sekretów do store/logów? **UNKNOWN.**
4. Które typy tooli pluginów mogą zwracać pliki lub inne treści nietekstowe? **UNKNOWN.**
5. Jakie katalogi skillów są aktywne i jakie reguły priorytetu stosuje dokładnie ta instalacja? **UNKNOWN.**

**Decyzja architektoniczna na teraz:** przygotować kontrakt kontekstu i sesji podczas bieżącego etapu, ale nie implementować Gateway, dopóki direct tool invocation nie zostanie dowiedzione prototypem na rzeczywistym OpenCode 2.2.5.
