# Plan wdrożenia — przenoszenie projektów i sesji OpenCode

> **Status: PLANNED / NOT IMPLEMENTED jako narzędzie MCP.** Klient HTTP ma metodę `moveSession`, ale serwer MCP nie rejestruje obecnie `opencode_move_session`. Ten dokument opisuje przyszłe rozszerzenie, a nie aktualną funkcję.

> **Zakres:** obsługa zmiany katalogu projektu przypisanego do istniejącej sesji OpenCode oraz niezawodne tworzenie sesji we wskazanym katalogu.
>
> **Poza zakresem:** integracja Gemini API, dodawanie providerów/modeli Gemini oraz fizyczne przenoszenie katalogów repozytoriów.

## 1. Cel

Rozszerzyć most MCP `opencode-chatgpt-bridge` tak, aby można było:

1. uruchomić nową sesję OpenCode we właściwym katalogu projektu;
2. przenieść istniejącą sesję OpenCode do innego, już istniejącego katalogu projektu;
3. kontynuować tę samą sesję po przeniesieniu — z zachowaniem jej historii i tożsamości;
4. odczytać i zweryfikować aktualny katalog przypisany do sesji;
5. otrzymać jednoznaczny błąd, jeżeli przeniesienie nie powiedzie się.

**Istotne rozróżnienie:** w tym planie „przeniesienie projektu” oznacza zmianę katalogu roboczego/kontekstu projektu przypisanego do sesji OpenCode. Nie oznacza przenoszenia plików repozytorium na dysku ani zmiany położenia samego repozytorium.

## 2. Stan wyjściowy i problem

Most udostępnia już operacje związane z projektami i sesjami, m.in.:

- listowanie projektów;
- tworzenie i listowanie sesji;
- pobieranie/ustawianie aktywnej sesji;
- dołączanie do sesji;
- wysyłanie wiadomości i pobieranie historii;
- pobieranie statusu, diffów i informacji o możliwościach.

W dotychczasowych próbach przekazanie `repoPath` przy tworzeniu sesji nie dawało pewności, że OpenCode przypisał sesję do oczekiwanego katalogu. W jednym z testów katalog sesji wskazywał katalog nadrzędny `/path/to/projects`, zamiast `/path/to/project`.

OpenCode ma natywny mechanizm przenoszenia sesji (`session_move`). W dokumentacji opisano również operację API przenoszącą sesję do wskazanego katalogu. Most nie udostępnia obecnie odpowiadającej jej jawnej operacji MCP.

Przed implementacją należy potwierdzić szczegóły kontraktu API dla faktycznie uruchomionej wersji OpenCode **2.2.5**. Nie należy zakładać, że zachowanie nowszej dokumentacji jest identyczne z zachowaniem tej wersji.

## 3. Proponowany zakres funkcjonalny

### 3.1. Nowa operacja MCP: przeniesienie sesji

Dodać narzędzie, przykładowo:

```ts
opencode_move_session({
  sessionId: string,   // identyfikator sesji mostu
  directory: string    // docelowy katalog projektu
})
```

Nazwy pól należy dopasować do konwencji istniejącego API mostu. Użytkownik powinien podawać identyfikator sesji mostu, a most powinien samodzielnie rozwiązywać go na identyfikator sesji OpenCode.

Oczekiwane zachowanie:

1. odnaleźć mapowanie identyfikatora mostu na identyfikator OpenCode;
2. zweryfikować i ujednolicić ścieżkę docelową;
3. potwierdzić, że katalog docelowy istnieje i jest katalogiem;
4. wykonać natywną operację przeniesienia sesji w OpenCode;
5. sprawdzić wynik po stronie OpenCode;
6. zaktualizować mapowanie/kontekst sesji w moście dopiero po potwierdzeniu sukcesu;
7. zwrócić identyfikator sesji, nowy katalog i status operacji.

Przeniesienie ma dotyczyć istniejącej sesji, a nie tworzyć nowej sesji z podobnym tytułem.

### 3.2. Poprawne tworzenie sesji w wybranym katalogu

Naprawić i przetestować ścieżkę tworzenia sesji tak, aby `repoPath` rzeczywiście wskazywał katalog roboczy nowej sesji.

Wymagania:

- ścieżka przekazywana przez klienta nie może być po cichu zastępowana katalogiem nadrzędnym;
- most powinien przekazywać katalog do OpenCode zgodnie z kontraktem właściwym dla używanej wersji;
- po utworzeniu sesji należy odczytać jej rzeczywisty katalog i porównać go z żądanym;
- jeśli OpenCode utworzy sesję w innym katalogu, most ma zgłosić niezgodność, a nie raportować sukces;
- nie wolno automatycznie tworzyć brakującego katalogu projektu.

### 3.3. Odczyt i weryfikacja lokalizacji sesji

Uzupełnić odpowiedź statusu sesji lub dodać odrębną operację informacyjną, tak aby klient mógł odczytać:

- identyfikator sesji mostu;
- identyfikator sesji OpenCode;
- bieżący katalog projektu;
- ewentualny stan synchronizacji mapowania;
- ostatni błąd operacji przenoszenia, jeśli wystąpił.

Nie należy wyświetlać katalogu zapisanego wyłącznie w lokalnej mapie mostu jako potwierdzonego stanu OpenCode. Źródłem prawdy po operacji jest stan zwrócony/odczytany z OpenCode.

## 4. Kontrakt i obsługa ścieżek

Przed wywołaniem OpenCode most powinien:

- wymagać ścieżki absolutnej albo jawnie rozwiązywać ścieżkę względną względem ustalonego katalogu bazowego;
- normalizować ścieżkę i obsługiwać końcowy separator;
- sprawdzać istnienie katalogu oraz typ obiektu;
- wykrywać ścieżki niepoprawne i błędy uprawnień;
- nie utożsamiać katalogu repozytorium z katalogiem nadrzędnym;
- nie wykonywać `mkdir`, kopiowania, przenoszenia ani usuwania plików w ramach operacji zmiany kontekstu sesji.

Warto jawnie rozróżniać w odpowiedziach błędy:
- `DESTINATION_NOT_FOUND`;
- `DESTINATION_NOT_DIRECTORY`;
- `SESSION_NOT_FOUND`;
- `SESSION_MAPPING_NOT_FOUND`;
- `OPENCODE_MOVE_FAILED`;
- `POST_MOVE_VERIFICATION_FAILED`.

Nazwy są propozycją — powinny zostać dostosowane do istniejącego formatu błędów mostu.

## 5. Spójność mapowania i odporność na błędy

Najważniejsza zasada: **nie aktualizować lokalnego mapowania sesji przed potwierdzeniem przeniesienia przez OpenCode.**

Proponowana sekwencja:

1. odczyt aktualnego mapowania;
2. walidacja katalogu;
3. wywołanie API OpenCode;
4. odczyt stanu sesji po operacji;
5. porównanie katalogu docelowego z rzeczywistym;
6. zapis nowego katalogu w mapowaniu;
7. zwrócenie wyniku.

Jeśli OpenCode odrzuci operację, mapowanie pozostaje bez zmian. Jeśli OpenCode wykona przeniesienie, ale most nie zdoła zapisać mapowania, most powinien zgłosić błąd synchronizacji i umożliwić ponowne uzgodnienie stanu przez odczyt z OpenCode. Nie wolno w takim przypadku udawać, że operacja nie została wykonana.

Należy uwzględnić bezpieczny punkt wykonania operacji: jeżeli OpenCode stosuje przeniesienie na granicy kroku/żądania, most powinien poczekać na zakończenie operacji i nie wysyłać w tej samej sekwencji zadania, które zakłada już nowy katalog.

## 6. Testy akceptacyjne

### A. Tworzenie sesji

1. Utworzyć sesję w istniejącym katalogu `/path/to/project`.
2. Odczytać lokalizację sesji bezpośrednio z OpenCode.
3. Potwierdzić dokładną zgodność ścieżki — nie wystarczy zgodność katalogu nadrzędnego.
4. Wysłać wiadomość i potwierdzić, że sesja odpowiada.

### B. Przenoszenie istniejącej sesji

1. Utworzyć lub wskazać istniejącą sesję w katalogu źródłowym.
2. Zapisać jej identyfikator i liczbę/ostatnie wiadomości historii.
3. Przenieść ją do istniejącego katalogu docelowego.
4. Potwierdzić, że identyfikator sesji pozostał ten sam.
5. Potwierdzić, że historia sesji jest zachowana.
6. Potwierdzić, że OpenCode raportuje katalog docelowy.
7. Wysłać kolejną wiadomość w tej samej sesji i potwierdzić odpowiedź.

### C. Negatywne przypadki

- katalog docelowy nie istnieje;
- wskazana ścieżka jest plikiem, a nie katalogiem;
- nieznany identyfikator sesji;
- brak mapowania mostu;
- OpenCode zwraca błąd;
- timeout podczas wywołania;
- przeniesienie zakończone po stronie OpenCode, ale zapis mapowania w moście nie powiódł się;
- ponowne wykonanie przeniesienia do tego samego katalogu.

### D. Regresja

Po dodaniu funkcji ponownie sprawdzić:

- tworzenie sesji;
- listowanie i pobieranie sesji;
- wybór aktywnej sesji;
- kontynuowanie istniejącej sesji;
- wysyłanie wiadomości;
- pobieranie historii i diffów;
- usuwanie sesji — bez wykonywania go w ramach testów przenoszenia.

## 7. Plan realizacji — małe, niezależne kroki

| Krok | Zakres | Warunek zakończenia |
|---|---|---|
| 1 | Audyt repozytorium mostu, mapowań i aktualnego API OpenCode 2.2.5 | Ustalony rzeczywisty przepływ identyfikatorów i katalogów |
| 2 | Test ręczny natywnego przenoszenia sesji w OpenCode | Potwierdzony kontrakt i zachowanie wersji 2.2.5 |
| 3 | Test kontraktu tworzenia sesji w wybranym katalogu | Wiadomo, dlaczego wcześniej wybrano katalog nadrzędny |
| 4 | Testy jednostkowe walidacji ścieżek i mapowań | Testy negatywne i pozytywne przygotowane przed implementacją |
| 5 | Implementacja operacji przenoszenia sesji w moście | Nowa operacja MCP działa na jednej sesji testowej |
| 6 | Weryfikacja stanu po przeniesieniu i synchronizacja mapowania | Brak fałszywych potwierdzeń sukcesu |
| 7 | Naprawa tworzenia sesji w zadanym katalogu | Rzeczywisty katalog sesji zgadza się z żądaniem |
| 8 | Testy integracyjne i regresyjne | Wszystkie kryteria akceptacyjne zaliczone |
| 9 | Dokumentacja narzędzi i przykład użycia | Opisane parametry, błędy i ograniczenia |

Każdy krok powinien być realizowany osobno, z ograniczonym zakresem zmian i raportem wyniku. Nie należy łączyć całej implementacji w jedno długie zadanie.

## 8. Ograniczenia i zasady ochronne

- **Nie modyfikować kodu, konfiguracji ani instalacji OpenCode.** OpenCode traktujemy jako zewnętrzny, natywny serwer/API.
- Zmiany implementacyjne ograniczyć do repozytorium `.`.
- Nie restartować serwera OpenCode w ramach zwykłego przenoszenia sesji.
- `opencode reload` nie jest wymagany do przenoszenia sesji; służy do przeładowania konfiguracji.
- Nie wykonywać fizycznego przenoszenia katalogów repozytoriów.
- Nie usuwać sesji ani mapowań w ramach operacji przenoszenia.
- Przed zmianami sprawdzić `git status`; zachować wszystkie istniejące i cudze zmiany.
- Nie używać `git reset`, `git clean) ani nie tworzyć commitów bez odrębnego polecenia.
- Nie raportować zaliczenia testu bez rzeczywistego wyniku jego wykonania.

## 9. Proponowany rezultat końcowy

Most MCP udostępnia spójny zestaw operacji:

- `opencode_create_session(repoPath)` — tworzy sesję w dokładnie wskazanym katalogu;
- `opencode_move_session(sessionId, directory)` — przenosi istniejącą sesję do innego katalogu projektu;
- `opencode_get_session_status(sessionId)` — zwraca aktualną lokalizację potwierdzoną przez OpenCode;
- dotychczasowe operacje kontynuowania sesji działają po przeniesieniu bez utraty historii.

**Kryterium gotowości:** ta sama sesja OpenCode, z zachowaną historią i identyfikatorem, może zostać przeniesiona do innego istniejącego katalogu projektu, a most potrafi niezależnie potwierdzić nową lokalizację. Nowa sesja również trafia dokładnie do katalogu wskazanego przez klienta.

## 10. Rekomendacja

Wdrożenie rozpocząć od kroków 1–3: audytu mostu oraz potwierdzenia natywnego zachowania OpenCode 2.2.5. To pozwoli rozstrzygnąć, czy problem leży w sposobie wywołania API, w obsłudze ścieżki przy tworzeniu sesji, czy w mapowaniu sesji po stronie mostu.

Dopiero po tym należy implementować `opencode_move_session`. Dzięki temu nie powstanie druga, równoległa logika zarządzania projektami, a most będzie korzystał z natywnego mechanizmu OpenCode.
