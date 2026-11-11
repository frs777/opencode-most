# Polityka wyboru modeli agentów

## Źródło dozwolonych modeli

Lokalnym źródłem prawdy dla modeli używanych do delegowania zadań i konsultacji agentów jest plik `agenci.md` w katalogu głównym tego repozytorium w środowisku użytkownika. Plik jest celowo wyłączony z repozytorium i dystrybucji, ponieważ zawiera prywatne przypisania agentów. W świeżym klonie, w którym go nie ma, delegowanie do agentów należy wstrzymać do czasu dostarczenia jawnej, zatwierdzonej listy.

## Reguły obowiązkowe

1. Używaj wyłącznie modeli i identyfikatorów provider/model wymienionych w `agenci.md`.
2. Nie uruchamiaj agentów na modelach spoza tej listy, nawet jako tymczasowego fallbacku.
3. Przed delegowaniem sprawdź przypisanie modelu do agenta oraz dostępność providera w bieżącej konfiguracji OpenCode.
4. Jeżeli wskazany model jest niedostępny, zwraca błąd, limit/quota albo provider nie jest aktywny, przerwij dane delegowanie i zgłoś dokładny błąd.
5. Nie zastępuj niedostępnego modelu innym modelem bez wyraźnej zgody użytkownika. Dopuszczalny jest wyłącznie fallback, który sam jest jawnie wymieniony przy danym agencie w `agenci.md`.
6. Nie traktuj nazw modeli wspomnianych w historii rozmów, logach ani domyślnej konfiguracji jako dodatkowego zezwolenia.
7. Gdy `agenci.md` zostanie zaktualizowany, stosuj jego aktualną zawartość; nie utrzymuj niezależnej, rozbieżnej kopii listy w tym dokumencie.

## Zakres

Polityka dotyczy:
- konsultacji i code review wykonywanych przez subagentów;
- delegowania zadań do agentów OpenCode;
- testów porównawczych modeli;
- wszelkich uruchomień agentów zewnętrznych inicjowanych w ramach tego projektu.

Nie ogranicza modelu głównego ChatGPT prowadzącego rozmowę — określa wyłącznie modele agentów uruchamianych/delegowanych przez projekt.

## Postępowanie przy blokadzie

Jeżeli żaden dozwolony model nie jest w danej chwili dostępny, nie obchodź ograniczenia. Zatrzymaj delegowanie, zachowaj dotychczasowe wyniki i poinformuj użytkownika, który model/provider zawiódł oraz jaki komunikat zwrócił.
