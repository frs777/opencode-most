---
name: project-management
description: |
  Use when listing allowed repositories, starting or stopping OpenCode servers, or validating project paths through the ChatGPT bridge.
---

# Zarządzanie projektami

Ten skill obsługuje repozytoria Git i zarządzane serwery OpenCode.

## Narzędzia dostępne w aplikacji ChatGPT

| Narzędzie | Argumenty | Cel |
|---|---|---|
| list_projects | depth?: integer (0–5, domyślnie 2) | Lista repozytoriów Git pod skonfigurowanymi allowedRoots |
| opencode_start | repoPath: string | Uruchom lub wykorzystaj serwer OpenCode dla repozytorium |
| opencode_stop | repoPath?: string | Zatrzymaj wskazany zarządzany serwer; bez repoPath zatrzymaj wszystkie |

## Walidacja ścieżek

Bridge rozwiązuje ścieżkę do rzeczywistej lokalizacji i sprawdza, czy katalog znajduje się wewnątrz jednego z allowedRoots. Chroni to przed path traversal i dostępem poza dozwolonym zakresem.

## Zasady

- Używaj dokładnej ścieżki repozytorium przekazanej przez użytkownika lub zwróconej przez list_projects.
- Nie zatrzymuj wszystkich zarządzanych serwerów, jeśli zadanie dotyczy jednego repozytorium.
- Zarządzanie serwerem nie wymaga tworzenia nowej sesji.
- Nie odwołuj się do opencode_move_session. Przenoszenie sesji nie jest dostępne w katalogu akcji ChatGPT.
