# Plan: Automatyczna podmiana modeli (fallback) w MCP moście OpenCode

> **Status: propozycja badawcza, niezatwierdzona i niezaimplementowana.** Automatyczne przełączanie modelu nie jest częścią bieżącego kontraktu Bridge. Obowiązuje `docs/AGENT-MODEL-POLICY.md`: nie wolno zastępować modelu bez jawnego upoważnienia użytkownika.

## Cel

Gdy model free przypisany do agenta wyczerpie limity (błąd HTTP 402 Payment Required, 429 Too Many Requests, 403 Forbidden, komunikat "quota exceeded" / "insufficient quota"), most powinien automatycznie przełączyć się na kolejny model z listy fallbackowej (od najlepszego do najsłabszego), bez przerywania sesji i bez interwencji użytkownika.

## Stan obecny

- Każdy agent ma w `~/.config/opencode/opencode.json` dokładnie jeden model: `agent.<nazwa>.model`
- `src/opencode/client.ts` wysyła zapytania bezpośrednio z tym modelem; przy błędzie quota rzuca wyjątek i sesja się łamie
- `src/mcp/tools.ts` (`opencode_send_message`) przekazuje `providerID`/`modelID`/agent dalej do klienta, bez mechanizmu powtórki z innym modelem
- Brak pola `modelFallback` w konfiguracji agenta

## Zakres zmian

### 1. Konfiguracja agenta (`~/.config/opencode/opencode.json`)

Rozszerzenie sekcji `"agent"` o opcjonalną tablicę `modelFallback`:

```json
"agent": {
  "build": {
    "model": "kilo/nvidia/nemotron-3.5-super-vl:free",
    "modelFallback": [
      "kilo/nvidia/nemotron-3.5-lightning:free",
      "openrouter/liquid/lfm-3-1.7b:free",
      "pollinations/openai-fast"
    ]
  },
  "code-reviewer": {
    "model": "kilo/nvidia/nemotron-3.5-super-vl:free",
    "modelFallback": [
      "freemodel/claude-sonnet-4-6",
      "groq/qwen-2.5-coder-32b"
    ]
  }
}
```

- `model` — model startowy (domyślny)
- `modelFallback` — kolejne modele do wypróbowania, jeśli poprzedni zwróci błąd limitu

### 2. `src/opencode/client.ts`

- Dodanie pola `modelFallback: string[]` do `OpencodeClientOptions` (lub osobna klasa `OpencodeClientWithFallback`)
- W metodzie `request()` przechwytywanie błędów HTTP:
  - `402 Payment Required`
  - `429 Too Many Requests`
  - `403 Forbidden` (gdy treść zawiera "quota" / "insufficient quota")
  - inne kody sugerujące wyczerpanie limitu (np. `400` z treścią "rate limit")
- Przy wykryciu takiego błędu:
  1. Pobranie kolejnego modelu z listy fallbackowej dla danego agenta
  2. Ponowne wysłanie tego samego zapytania z nowym modelem (`providerID` + `modelID`)
  3. Powtórzenie do wyczerpania listy fallbackowej
  4. Jeśli wszystkie modele zawiodą — rzucenie oryginalnego błędu z ostatniego modelu
- Zachowanie stanu: który model został ostatecznie użyty (do ewentualnego zwrócenia w odpowiedzi MCP)

### 3. `src/opencode/process.ts`

- Przy `ensure(repoPath)` — jeśli `config.opencodeBaseUrl` jest ustawione (połączenie do istniejącego serwera), most nie kontroluje modelu bezpośrednio (serwer sam zarządza sesjami). Fallback będzie działać tylko na poziomie `sendMessage` / `client.ts`, gdzie most wysyła `providerID`/`modelID` w każdej wiadomości.
- Przy tworzeniu sesji przez `opencode_create_session` — opcjonalnie zapisanie wybranego modelu startowego w stanie sesji (`bridgeSessionId` → model).

### 4. `src/mcp/tools.ts`

- `opencode_send_message` — po udanym wysłaniu wiadomości (po ewentualnym fallbacku) zwrócenie informacji, który model został użyty (np. pole `usedModel` w odpowiedzi).
- `opencode_capabilities` — zwrócenie listy modeli fallbackowych dla danego agenta (jeśli istnieją), aby ChatGPT widział alternatywy.
- `opencode_get_session_status` — opcjonalnie informacja o aktualnym modelu sesji.

### 5. `src/config/env.ts` / `.env`

- Brak nowych zmiennych środowiskowych wymaganych — konfiguracja leży w `opencode.json`.
- Opcjonalnie: `OPENCODE_BRIDGE_MODEL_FALLBACK_ENABLED=true/false` do włączenia/wyłączenia mechanizmu globalnie.

### 6. Testy (`tests/opencode-client.test.ts`)

- Test symulujący błąd 402 na pierwszym modelu i sukces na drugim.
- Test symulujący błąd 429 na wszystkich modelach z listy — oczekiwany błąd końcowy.
- Test bez listy fallbackowej — zachowanie jak dotychczas (rzucenie błędu).

## Sekwencja działania (przykład)

1. ChatGPT wywołuje `opencode_send_message` z agentem `build` i promptem.
2. Most tworzy/pobiera sesję, ustawia agenta `build` na model `nemotron-3.5-super-vl:free`.
3. Serwer OpenCode zwraca `402 Payment Required` (wyczerpano darmowe tokeny nemotrtona).
4. Most łapie błąd, pobiera z konfiguracji następny model: `nemotron-3.5-lightning:free`.
5. Ponownie wysyła ten sam prompt z nowym modelem.
6. Serwer zwraca `200 OK` — most zwraca wynik do ChatGPT z adnotacją, który model został użyty.
7. Jeśli drugi model też zwróci 402 — próbuje trzeci (`lfm-3-1.7b:free`), itd.

## Ryzyka i ograniczenia

- **Stan sesji:** Niektóre modele mogą nie obsługiwać kontynuacji sesji rozpoczętej innym modelem (np. różne konteksty systemowe). W takim przypadku fallback może zainicjować nową sesję lub zwrócić ostrzeżenie.
- **Koszty:** Przejście na model z innego providera może wymagać innego klucza API (np. Groq vs kilo). Most nie zarządza kluczami — to warstwa konfiguracji OpenCode.
- **Opóźnienie:** Każda nieudana próba dodaje czas oczekiwania (timeout). Zalecane krótkie timeouty dla prób fallbackowych.
- **ChatGPT nie wie o fallbacku:** Connector widzi tylko wynik. Opcjonalnie most może zwrócić metadata `usedModel` i `fallbackUsed: true`.

## Kryteria acceptance

- [ ] Gdy model startowy zwraca 402/429/quota, most automatycznie próbuje kolejny model z `modelFallback`.
- [ ] Gdy wszystkie modele z listy zawodzą, most zwraca błąd z ostatniego modelu.
- [ ] Gdy `modelFallback` nie jest zdefiniowany, zachowanie jest jak dotychczas (błąd natychmiastowy).
- [ ] Testy jednostkowe przechodzą.
- [ ] `most restart bridge` nie psuje istniejącej konfiguracji.

## Priorytet

Średni — przydatny przy intensywnym korzystaniu z darmowych modeli, które mają sztywne limity req/min i token/dzień.
