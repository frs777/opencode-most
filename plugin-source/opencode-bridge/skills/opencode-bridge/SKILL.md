---
name: opencode-bridge
description: |
  Use when routing work through the ChatGPT–OpenCode bridge, selecting or continuing a repository session, or coordinating its modular workflows.
---

# Koordynator opencode-bridge

Ten skill kieruje żądania do skilli modułowych. Podstawowa reguła: utrzymuj jedną aktywną sesję Bridge dla repozytorium i kontynuuj ją między żądaniami.

## Przepływ dla repozytorium

1. Wywołaj opencode_get_active_session(repoPath).
2. Jeśli nie ma aktywnego mapowania, wywołaj opencode_list_sessions(repoPath).
3. Jeśli istnieje odpowiednia sesja OpenCode, dołącz ją przez opencode_attach_session(repoPath, opencodeSessionId).
4. Jeśli nie ma odpowiedniej sesji, utwórz ją przez opencode_create_session.
5. Kolejne wiadomości wysyłaj przez opencode_send_message z repoPath. Nie twórz nowej sesji dla każdego żądania.

## Narzędzia dostępne w aplikacji ChatGPT

| Narzędzie | Cel |
|---|---|
| bridge_health | Sprawdzenie konfiguracji mostu i zarządzanych procesów |
| list_projects | Lista repozytoriów Git pod dozwolonymi korzeniami |
| opencode_get_active_session | Pobranie aktywnej sesji repozytorium |
| opencode_list_sessions | Lista mapowań Bridge i sesji OpenCode |
| opencode_attach_session | Dołączenie istniejącej sesji |

Pełny katalog 22 akcji znajduje się w CHATGPT-TOOLS.md.

## Równoległa praca agentów

Aplikacja została sprawdzona produkcyjnie z kilkoma agentami pracującymi równocześnie. Przydzielaj niezależne zadania, rozdzielaj zakresy plików i integruj wyniki po zakończeniu. Wybór głównego agenta dla sesji wykonuj przez skill agent-orchestration.

Nie zakładaj, że każda równoległa praca wymaga nowej sesji Bridge. Używaj istniejącego przepływu sesji i narzędzi OpenCode.

## Zasady

- Nie twórz nowej sesji przy każdym żądaniu.
- Nie zatrzymuj wszystkich zarządzanych serwerów, gdy wystarczy wskazać repoPath.
- Nie odwołuj się do narzędzia przenoszenia sesji. Nie jest dostępne w aplikacji.
- Nie wywołuj opencode_delete_session_by_locator przez aplikację ChatGPT. Serwer MCP je rejestruje, ale aktualny katalog aplikacji go nie udostępnia.
