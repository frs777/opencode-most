# Aktualny katalog akcji aplikacji ChatGPT

Źródło: metadane aktualnie zainstalowanej aplikacji opencode-bridge w ChatGPT, odczytane 2026-11-11.

Aplikacja udostępnia 22 akcje. To katalog akcji widoczny dla ChatGPT, a nie pełna lista rejestracji wewnętrznego serwera MCP.

| Akcja | Argumenty | Kontrakt |
|---|---|---|
| bridge_health | brak | Konfiguracja mostu i zarządzane procesy OpenCode |
| list_projects | depth?: integer (0–5, domyślnie 2) | Repozytoria Git w dozwolonych katalogach |
| opencode_start | repoPath: string | Uruchom lub wykorzystaj serwer dla repozytorium |
| opencode_stop | repoPath?: string | Zatrzymaj zarządzany serwer; bez ścieżki zatrzymuje wszystkie |
| opencode_create_session | repoPath: string, title?: string, parentID?: string | Utwórz sesję |
| opencode_list_sessions | repoPath?: string | Mapowania Bridge lub sesje OpenCode dla repozytorium |
| opencode_attach_session | repoPath: string, opencodeSessionId: string | Dołącz istniejącą sesję |
| opencode_get_active_session | repoPath: string | Pobierz aktywną sesję repozytorium |
| opencode_set_active_session | repoPath: string, bridgeSessionId: string | Ustaw aktywną sesję Bridge |
| opencode_get_session_status | bridgeSessionId: string | Status wskazanej sesji |
| opencode_delete_session | bridgeSessionId: string | Trwale usuń zakończoną sesję i mapowanie; odrzuca sesje działające |
| opencode_send_message | bridgeSessionId?: string, repoPath?: string, text: string, async?: boolean, providerID?: string, modelID?: string, variant?: string, agent?: string, noReply?: boolean | Wyślij prompt do aktywnej lub jawnie wskazanej sesji |
| opencode_wait_for_completion | bridgeSessionId?: string, repoPath?: string, timeoutSeconds?: integer | Czekaj na natywne zdarzenie zakończenia SSE; limit 1–600 s |
| opencode_get_messages | bridgeSessionId: string, limit?: integer | Pobierz wiadomości sesji; limit 1–200 |
| opencode_get_diff | bridgeSessionId: string, messageID?: string | Pobierz zmiany plików sesji |
| opencode_abort | bridgeSessionId: string | Przerwij wskazaną sesję |
| opencode_respond_permission | bridgeSessionId: string, permissionId: string, response: allow / deny / once / always, remember?: boolean | Odpowiedz na żądanie uprawnienia |
| opencode_read_file | bridgeSessionId: string, path: string | Odczytaj plik jako surowy tekst |
| opencode_find_files | bridgeSessionId: string, query: string, limit?: integer, directory?: string | Wyszukaj pliki |
| opencode_vcs_status | bridgeSessionId: string | Status VCS i pliki repozytorium |
| opencode_capabilities | bridgeSessionId?: string, repoPath?: string | Agenci, polecenia, providery, modele, warianty i limity |
| opencode_select_model_agent | bridgeSessionId?: string, repoPath?: string, providerID: string, modelID: string, variant?: string, agent: string | Waliduj i wybierz kompatybilny model oraz agenta |

## Różnica względem serwera MCP

Lokalny kod serwera rejestruje 23 narzędzia. Dodatkowym narzędziem jest opencode_delete_session_by_locator. Aktualny katalog aplikacji ChatGPT go nie udostępnia. Nie wywołuj go przez tę aplikację i nie przedstawiaj jako dostępnej akcji ChatGPT.

## Reguły korzystania

- Dla repozytorium najpierw pobierz aktywną sesję przez opencode_get_active_session.
- Kontynuuj tę sesję przez repoPath; nie twórz nowej sesji przy każdym żądaniu.
- Jeśli nie ma aktywnego mapowania, sprawdź istniejące sesje i dołącz odpowiednią.
- Utwórz nową sesję tylko wtedy, gdy nie ma odpowiedniej istniejącej sesji.
- Po asynchronicznym opencode_send_message użyj opencode_wait_for_completion, zamiast wielokrotnie odpytywać status.
- Przed podsumowaniem pracy na plikach pobierz opencode_get_diff.
- Usuwanie sesji jest operacją destrukcyjną. Wymaga jawnego polecenia użytkownika.
