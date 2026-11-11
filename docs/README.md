# Dokumentacja

## Użytkowanie i działanie

- [README projektu](../README.md) — zakres, szybki start, funkcje, narzędzia MCP i model bezpieczeństwa.
- [Instalacja](../INSTALL.md) — konfiguracja i uruchomienie krok po kroku.
- [Cykl życia sesji](session-lifecycle.md) — aktywna sesja, kontynuacja, oczekiwanie na zakończenie i bezpieczne usuwanie.
- [Polityka wyboru modeli agentów](AGENT-MODEL-POLICY.md) — ograniczenia delegowania modeli; odwołuje się do lokalnego, niepublikowanego `agenci.md`.
- [Historia zmian](CHANGELOG.md) — zapis zmian i wykonanych weryfikacji.
- [Raport porządkowania repozytorium](reports/repo-cleanup-2026-11-11.md) — decyzje o plikach, wyniki walidacji i otwarte punkty.
- [Katalog akcji ChatGPT](../plugin-source/opencode-bridge/CHATGPT-TOOLS.md) — kontrakt 22 akcji aktualnie zainstalowanej aplikacji.
- [Roadmap i znane ograniczenia](../TODO.md) — nieukończone weryfikacje i funkcje poza zakresem bieżącej bety.
- [CI](../.github/workflows/ci.yml) — GitHub Actions uruchamiający `pnpm validate` dla push i pull request na `main`.

## Roadmap

- [Przenoszenie sesji](roadmap/session-move.md) — propozycja funkcji, której nie udostępnia jeszcze MCP.

## Research i propozycje

Materiały w tym katalogu nie są deklaracją zaimplementowanych funkcji.

- [Universal Tool Gateway](research/universal-tool-gateway.md) — analiza dostępnych kontraktów i wariantów architektury.
- [Gemini Bridge](research/gemini-bridge-assessment.md) — ocena, czy osobny most Gemini wnosi funkcję ponad natywnego providera.
- [Fallback modeli](research/model-fallback-proposal.md) — niezatwierdzona propozycja automatycznego fallbacku.
- [Reverse Bridge](research/reverse-bridge-architecture.md) — odrębny kierunek: web app → OpenCode.
