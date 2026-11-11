---
name: session-management
description: |
  Use when creating, attaching, selecting, continuing, or deleting OpenCode sessions through the ChatGPT bridge.
---

# Zarządzanie sesjami OpenCode

Sesja OpenCode powinna być kontynuowana między żądaniami. Bridge utrzymuje aktywne mapowanie dla repozytorium.

## Wybór sesji

1. Wywołaj opencode_get_active_session(repoPath).
2. Jeśli brak aktywnego mapowania, wywołaj opencode_list_sessions(repoPath).
3. Jeśli znajdziesz odpowiednią istniejącą sesję, dołącz ją przez opencode_attach_session(repoPath, opencodeSessionId).
4. Jeśli nie ma odpowiedniej sesji, utwórz ją przez opencode_create_session(repoPath, title, parentID).
5. Ustaw aktywną sesję przez opencode_set_active_session(repoPath, bridgeSessionId), jeśli wybierasz inną niż aktualna.
6. Wysyłaj kolejne wiadomości przez opencode_send_message z repoPath. Podaj bridgeSessionId tylko wtedy, gdy celowo kierujesz wiadomość do innej sesji.

## Akcje dostępne w aplikacji ChatGPT

| Narzędzie | Argumenty | Cel |
|---|---|---|
| opencode_get_active_session | repoPath: string | Pobierz aktywną sesję repozytorium |
| opencode_list_sessions | repoPath?: string | Wyświetl mapowania Bridge lub sesje OpenCode |
| opencode_attach_session | repoPath: string, opencodeSessionId: string | Dołącz istniejącą sesję bez tworzenia nowej |
| opencode_create_session | repoPath: string, title?: string, parentID?: string | Utwórz sesję |
| opencode_set_active_session | repoPath: string, bridgeSessionId: string | Ustaw aktywną sesję Bridge |
| opencode_delete_session | bridgeSessionId: string | Usuń zakończoną sesję i jej mapowanie |
| opencode_send_message | bridgeSessionId?, repoPath?, text, async?, providerID?, modelID?, variant?, agent?, noReply? | Wyślij prompt |
| opencode_wait_for_completion | bridgeSessionId?, repoPath?, timeoutSeconds? | Czekaj na zakończenie zadania przez SSE |

## Wiadomości asynchroniczne

- opencode_send_message domyślnie działa asynchronicznie.
- Po wysłaniu wiadomości asynchronicznej wywołaj opencode_wait_for_completion.
- Nie odpytuj wielokrotnie statusu w pętli.
- Jeśli praca zakończyła się przed wywołaniem wait, narzędzie zwraca wynik od razu.

## Usuwanie sesji

opencode_delete_session trwale usuwa zakończoną lub bezczynną sesję i mapowanie Bridge. Narzędzie odrzuca próbę usunięcia sesji, która nadal działa. Wykonuj tę operację wyłącznie na jawne polecenie użytkownika.

Serwer MCP ma dodatkową akcję usuwania sesji po dokładnych selektorach, ale aktualna aplikacja ChatGPT jej nie udostępnia. Nie próbuj jej wywoływać z poziomu tej aplikacji.

## Niezaimplementowane funkcje

Przenoszenie sesji między katalogami projektów nie jest dostępne jako akcja MCP. Nie odwołuj się do opencode_move_session.
