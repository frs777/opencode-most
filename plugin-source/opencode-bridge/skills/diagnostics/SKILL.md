---
name: diagnostics
description: |
  Use when checking bridge health, session status, messages, diffs, files, VCS state, permissions, or asynchronous completion.
---

# Diagnostyka Bridge

Ten skill służy do sprawdzania mostu MCP i wyników operacji w sesjach OpenCode.

## Narzędzia dostępne w aplikacji ChatGPT

| Narzędzie | Argumenty | Cel |
|---|---|---|
| bridge_health | brak | Konfiguracja mostu i zarządzane procesy |
| opencode_get_session_status | bridgeSessionId: string | Status wskazanej sesji |
| opencode_wait_for_completion | bridgeSessionId?, repoPath?, timeoutSeconds? | Oczekiwanie na zakończenie przez natywny strumień SSE |
| opencode_get_messages | bridgeSessionId: string, limit?: integer | Historia wiadomości sesji |
| opencode_get_diff | bridgeSessionId: string, messageID?: string | Zmiany plików w sesji |
| opencode_read_file | bridgeSessionId: string, path: string | Surowa zawartość pliku tekstowego |
| opencode_find_files | bridgeSessionId: string, query: string, limit?: integer, directory?: string | Wyszukiwanie plików |
| opencode_vcs_status | bridgeSessionId: string | Status VCS i lista plików |
| opencode_abort | bridgeSessionId: string | Przerwij wskazaną sesję |
| opencode_respond_permission | bridgeSessionId: string, permissionId: string, response: allow / deny / once / always, remember?: boolean | Odpowiedz na żądanie uprawnienia |

## Odczyt plików

opencode_read_file zwraca surowy tekst. Nie zwraca obiektu JSON. Nie stosuj JSON.parse do odpowiedzi.

Odczyt używa dekodowania UTF-8. Nie używaj tego narzędzia do plików binarnych, takich jak obrazy, archiwa lub PDF.

## Weryfikacja pracy kodowej

1. Pobierz status sesji przez opencode_get_session_status.
2. Po zakończeniu asynchronicznej pracy użyj opencode_wait_for_completion.
3. Pobierz wiadomości przez opencode_get_messages, jeśli potrzebujesz historii.
4. Pobierz diff przez opencode_get_diff przed podsumowaniem zmian.
5. Sprawdź status repozytorium przez opencode_vcs_status.

## Zasady

- Nie twórz nowej sesji tylko po to, aby wykonać diagnostykę.
- Nie odpytuj wielokrotnie statusu, gdy możesz użyć opencode_wait_for_completion.
- Nie stosuj JSON.parse na odpowiedzi opencode_read_file.
- Nie odwołuj się do opencode_move_session. Ta akcja nie jest dostępna w aplikacji ChatGPT.
