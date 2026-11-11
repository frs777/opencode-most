# Roadmap i znane ograniczenia — 1.0 beta

Ten plik opisuje rzeczywisty stan gałęzi roboczej. Zakończone funkcje nie są ponownie wpisywane jako zadania.

## Potwierdzone w produkcji

- [x] Użytkownik potwierdził, że zainstalowana aplikacja ChatGPT działała produkcyjnie z rzeczywistym OpenCode.
- [x] Użytkownik potwierdził równoległą pracę kilku agentów. Nie traktować wieloagentowego scenariusza ani podstawowego przepływu end-to-end jako niezweryfikowanych.

## Pozostałe kontrole wydania

- [ ] Po pierwszym push sprawdzić wynik GitHub Actions. Workflow uruchamia `pnpm validate` dla push i pull request na `main`.
- [ ] Jeśli wymagane jest automatyczne wznowienie modelu ChatGPT wyłącznie na podstawie `notifications/message`, potwierdzić tę konkretną semantykę osobno. Standardowy przepływ oczekiwania na zakończenie używa `opencode_wait_for_completion`.

## Kolejne iteracje

- [ ] Rozważyć wystawienie `opencode_move_session` jako narzędzia MCP. Klient HTTP ma metodę `moveSession`, ale narzędzie MCP nie jest obecnie rejestrowane. Projekt kontraktu: [plan przenoszenia sesji](docs/roadmap/session-move.md).
- [ ] Rozstrzygnąć, czy Universal Tool Gateway ma uzasadnienie i czy istnieje wspierany kontrakt bezpośredniego wywoływania narzędzi OpenCode. Obecny dokument jest analizą, nie implementacją: [research Gateway](docs/research/universal-tool-gateway.md).
- [ ] Ponownie ocenić zewnętrzny most Gemini tylko po potwierdzeniu poprawnego generowania odpowiedzi. Dostępny materiał potwierdzał health/model listing, ale żądanie generowania zakończyło się timeoutem po 45 s; integracja nie jest uznawana za działającą funkcję tego projektu.
- [ ] Automatyczny fallback modeli pozostaje propozycją badawczą, nie zaimplementowaną funkcją. Nie wolno automatycznie zmieniać modelu poza jawnie dozwolonym przypisaniem i polityką użytkownika: [propozycja fallbacku](docs/research/model-fallback-proposal.md).

## Poza zakresem bieżącego Bridge

- Reverse Bridge (web app → OpenCode) to odrębny kierunek architektoniczny, nie część produktu ChatGPT → OpenCode: [analiza](docs/research/reverse-bridge-architecture.md).
- Gemini API/web/Gems nie jest deklarowaną funkcją Bridge. Analiza integracji jest materiałem badawczym: [Gemini](docs/research/gemini-bridge-assessment.md).

## Zrealizowane

- Migracja klienta OpenCode do API v2.
- Trwałe mapowanie aktywnej sesji per repozytorium oraz jawne tworzenie/dołączanie/przełączanie sesji.
- Oczekiwanie na zdarzenia SSE OpenCode z obsługą ponownego połączenia.
- Odkrywanie providerów, modeli i agentów oraz walidacja zgodności wyboru.
- Bezpieczne usuwanie zakończonych sesji z mapowaniem i sesji worktree po dokładnych selektorach.
- Ochrona katalogów przez allow-listę i kontrolę ścieżek rzeczywistych.
- Diagnostyka HTTP `/health`, testy jednostkowe i build TypeScript.
