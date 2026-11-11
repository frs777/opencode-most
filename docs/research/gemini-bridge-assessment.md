# Ocena integracji Gemini z OpenCode — materiał badawczy

> **Status: niezaimplementowane i niepotwierdzone.** Materiał opisuje kierunki weryfikacji; nie deklaruje działającej integracji.

## 1. Cel

Celem jest udostępnienie Gemini w OpenCode jako dodatkowego modelu lub wyspecjalizowanego agenta, z możliwością korzystania z narzędzi projektowych OpenCode oraz — po potwierdzeniu możliwości — delegowania zadań równolegle.

Ważne rozróżnienie: OpenCode ma natywną obsługę providerów/modeli Gemini. Ten plan nie zakłada budowania od nowa obsługi Gemini w OpenCode. Dotyczy zbadania, czy i po co wykorzystywać istniejący, osobny most Gemini, oraz ewentualnego podłączenia go tylko wtedy, gdy wnosi funkcje niedostępne w natywnej integracji (np. dostęp do konkretnej wersji web/Gemini lub specjalistycznego Gem).

## 2. Stan wyjściowy

Z dostarczonego pliku `most Gemini.txt` wynika, że:
- most odpowiada na endpoint `/healthz`;
- udostępnia listę modeli;
- żądanie kierowane do Gemini zawiesiło się po 45 sekundach;
- nie potwierdzono poprawnego generowania odpowiedzi.

Wniosek: integracja jest widoczna, ale nie ma dowodu, że działa poprawnie jako wykonawca. Nie należy uznawać jej za gotową do pracy.

## 3. Najpierw rozstrzygnąć: Gemini API czy Gemini web

To decyzja architektoniczna, od której zależy sens dalszego wdrożenia.

### Wariant A — Gemini przez natywny provider OpenCode

- Użyć natywnej konfiguracji provider/model Gemini w OpenCode.
- Nie dodawać pośredniego mostu, jeśli nie jest potrzebny.
- Sprawdzić wybór modelu, generowanie, sesję, narzędzia i limity.
- Zachować istniejące modele i możliwość wyboru.

To wariant preferowany, jeżeli celem jest zwykłe korzystanie z modeli Gemini w OpenCode.

### Wariant B — zewnętrzny most do Gemini API

Rozważać tylko wtedy, gdy most zapewnia konkretną funkcję, której nie daje natywny provider.

Zakres audytu:
- format żądania i odpowiedzi;
- zgodność interfejsu z providerem obsługiwanym przez OpenCode;
- obsługa streamingu;
- timeouty, anulowanie i ponawianie żądań;
- przekazywanie błędów i limitów API;
- dostępne modele i ich rzeczywiste identyfikatory;
- bezpieczeństwo kluczy API.

### Wariant C — Gemini web / Gems

Jeśli celem jest korzystanie z Gemini w wersji web, w tym z konkretnym Gem, trzeba traktować to jako odrębną integrację. Należy najpierw ustalić, czy istnieje wspierany interfejs/API umożliwiający taki dostęp.

Nie wolno zakładać, że:
- Gemini API zapewnia dostęp do Gemini web;
- Gem można wywołać przez zwykły endpoint generowania;
- most API automatycznie daje dostęp do funkcji i kontekstu interfejsu web.

Jeśli brak oficjalnego i stabilnego interfejsu, należy jasno opisać ograniczenia zamiast udawać, że most obsługuje web/Gems.

## 4. Etapy wdrożenia

### Etap 1 — audyt obecnego rozwiązania

1. Zidentyfikować repozytorium, proces i konfigurację mostu.
2. Ustalić, czy most komunikuje się z Gemini API, czy próbuje pośredniczyć w Gemini web.
3. Sprawdzić endpointy, listę modeli i format protokołu.
4. Odtworzyć timeout 45 sekund.
5. Przeanalizować logi, odpowiedzi HTTP i obsługę streamingu.
6. Porównać funkcjonalność mostu z natywnym providerem Gemini w OpenCode.

**Warunek zakończenia:** udokumentowany przepływ żądania oraz jednoznaczna odpowiedź, jaką funkcję most wnosi ponad natywną obsługę Gemini.

### Etap 2 — test natywnej obsługi Gemini

1. Sprawdzić aktualną konfigurację providerów OpenCode.
2. Zweryfikować dokumentację właściwą dla zainstalowanej wersji.
3. Potwierdzić, czy natywny provider Gemini jest dostępny i poprawnie skonfigurowany.
4. Wykonać test generowania w nowej i istniejącej sesji.
5. Sprawdzić dostępność narzędzi OpenCode dla agenta korzystającego z tego modelu.

Nie zmieniać konfiguracji ani nie restartować OpenCode bez osobnej zgody.

### Etap 3 — decyzja o wykorzystaniu mostu

- Jeśli natywna integracja spełnia wymagania, zakończyć wdrożenie na niej i nie utrzymywać zbędnego pośrednika.
- Jeśli most daje dodatkową, potwierdzoną funkcję, przygotować jego integrację jako osobnego providera/adaptera.
- Jeśli chodzi o Gemini web/Gems, najpierw wykazać istnienie stabilnego i dozwolonego interfejsu.

### Etap 4 — stabilizacja mostu (tylko jeśli zostanie wybrany)

- naprawić przyczynę timeoutu;
- poprawnie obsłużyć streaming i zakończenie odpowiedzi;
- dodać obsługę anulowania, limitów i błędów;
- zapewnić bezpieczne przechowywanie kluczy;
- nie zmieniać ani nie zastępować natywnych providerów OpenCode.

### Etap 5 — agent specjalistyczny

Jeżeli celem jest odrębna specjalizacja, utworzyć agenta OpenCode z własnymi instrukcjami, zakresem zadań i uprawnieniami. Agent może korzystać z natywnego modelu Gemini — nie wymaga to osobnego mostu.

Przykładowe zadania:
- niezależny przegląd kodu;
- analiza architektury;
- wyszukiwanie błędów;
- ocena zmian wykonanych przez innego agenta;
- przygotowanie rekomendacji i testów.

Jeżeli chodzi o funkcjonalność konkretnego Gemini Gem, trzeba ją zweryfikować osobno; nie utożsamiać jej z samą instrukcją agenta OpenCode.

### Etap 6 — praca równoległa

Po sprawdzeniu samodzielnego działania można przetestować delegowanie:
- agent główny koordynuje zadanie;
- Gemini wykonuje niezależną analizę lub kontrolę;
- wyniki są porównywane;
- zmiany w tych samych plikach są koordynowane, aby uniknąć nadpisywania pracy.

## 5. Testy akceptacyjne

| Test | Kryterium |
|---|---|
| Wybór modelu | Gemini jest dostępny w OpenCode |
| Generowanie | Model zwraca odpowiedź |
| Kontynuacja sesji | Można kontynuować tę samą sesję |
| Narzędzia | Agent używa dozwolonych narzędzi OpenCode |
| Dłuższe zadanie | Brak nieuzasadnionego timeoutu |
| Anulowanie | Przerwanie żądania kończy pracę zgodnie z kontraktem |
| Błędy API | Błędy i limity są jawnie raportowane |
| Agent specjalistyczny | Agent stosuje własne instrukcje i uprawnienia |
| Delegowanie | Wyniki agentów można odebrać i zweryfikować |

Dla mostu testy należy wykonać dopiero po potwierdzeniu, że ma on uzasadnioną rolę.

## 6. Zasady ochronne

- Nie modyfikować kodu ani konfiguracji OpenCode bez wyraźnej zgody.
- Nie usuwać ani nie zastępować działających providerów.
- Nie instalować i nie usuwać pakietów bez zgody.
- Przed zmianami sprawdzić stan repozytorium i zachować istniejące modyfikacje.
- Nie ujawniać kluczy API w logach.
- Nie deklarować integracji jako działającej bez testu rzeczywistego generowania.
- Każdy etap realizować osobno, z krótkim raportem i kryterium zaliczenia.

## 7. Rekomendacja

Rekomendowana kolejność:

1. Ustalić, czy oczekiwanym celem jest Gemini API, czy Gemini web/Gems.
2. Sprawdzić i przetestować natywną obsługę Gemini w OpenCode.
3. Porównać ją z możliwościami obecnego mostu.
4. Utrzymywać most tylko wtedy, gdy zapewnia potrzebną funkcję dodatkową.
5. Dopiero potem tworzyć agenta specjalistycznego i testować pracę równoległą.

**Decyzja architektoniczna:** domyślnie używać natywnej integracji Gemini w OpenCode. Nie budować drugiego providera bez wykazanego uzasadnienia.
