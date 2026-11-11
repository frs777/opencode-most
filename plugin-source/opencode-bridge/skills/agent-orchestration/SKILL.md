---
name: agent-orchestration
description: |
  Use when inspecting OpenCode providers, models, variants, or agents, selecting a compatible primary agent, or coordinating parallel agent work.
---

# Wybór modeli i agentów

Ten skill obsługuje inspekcję możliwości OpenCode oraz wybór kompatybilnego providera, modelu, wariantu i głównego agenta dla istniejącej sesji.

## Narzędzia dostępne w aplikacji ChatGPT

| Narzędzie | Argumenty | Cel |
|---|---|---|
| opencode_capabilities | bridgeSessionId?: string, repoPath?: string | Lista agentów, poleceń, providerów, modeli, wariantów, limitów i cen |
| opencode_select_model_agent | bridgeSessionId?: string, repoPath?: string, providerID: string, modelID: string, variant?: string, agent: string | Walidacja i wybór kompatybilnej kombinacji |

## Procedura wyboru

1. Ustal aktywną sesję zgodnie ze skill session-management.
2. Wywołaj opencode_capabilities dla tej sesji lub repozytorium.
3. Wybierz model i agenta zgodnie z wymaganiami zadania oraz możliwościami narzędziowymi modelu.
4. Wywołaj opencode_select_model_agent z providerID, modelID, opcjonalnym variant i agent.
5. Kontynuuj pracę w tej samej sesji.

## Równoległa praca wielu agentów

Równoległa praca kilku agentów została potwierdzona w produkcyjnym użyciu aplikacji. Dziel zadanie na niezależne części. Przydzielaj agentom rozłączne zakresy plików lub modułów. Zachowaj osobny etap integracji i testów.

Wybór modelu i agenta przez opencode_select_model_agent dotyczy głównego agenta sesji. Nie traktuj tego wywołania jako automatycznego utworzenia osobnej sesji dla każdego agenta. Szczegółowy sposób delegowania zależy od konfiguracji agentów w OpenCode.

## Walidacja wykonywana przez Bridge

Bridge odrzuca wybór, gdy:
- model nie istnieje w katalogu lub nie jest włączony;
- provider nie jest aktywny;
- model nie deklaruje obsługi wywołań narzędzi;
- agent jest ukryty lub niedostępny jako główny agent sesji;
- agent przypina inny model;
- wariant nie jest dostępny dla modelu.

## Zasady

- Nie twórz nowej sesji tylko po to, aby wybrać model.
- Nie zmieniaj modelu ani agenta bez związku z bieżącym zadaniem.
- Nie odwołuj się do opencode_move_session. Ta akcja nie jest dostępna.
