# CURRENT-IMPLEMENTATION-STATUS.md

Stand: 2026-09-14. Aufgabe: HW-03 Dark-Room-Lichtklassifikation für den Wake bei ausgeschaltetem Monitor.
**IMPLEMENTIERT, LOKAL COMMITTET, NICHT GEPUSHT – NACHTTEST AUF DEM RASPBERRY PI ERFORDERLICH.**

Frühere Aufträge (PR-#130-Findings, QA-01..07, HW-01) sind ERLEDIGT und gepusht (`67290c5`, `ee876a5`,
`9f2ffe3`). HW-02 (Mehrframe-Bestätigung) ist lokal committet als `dc34460`, auf dem Pi getestet und hat den
Nachtfehler NICHT vollständig behoben; es bleibt Basis dieser Arbeit. Die unversionierten Dateien
`QA/INDEPENDENT-QA-2026-09-12.md`, `QA/HW-01-REPORT-2026-09-12.md` und `wake-confirmation.bundle` stammen nicht
von dieser Sitzung und bleiben unverändert und uncommittet.

## 1. Aktuelles Ziel

Instrumentierter Pi-Fall (nur Raumlicht an, dunkler Raum): Kandidat score=8193, pixels=42.7 %,
brightness=42.5, direction=100 % wurde 3 Frames gehalten und dann bestätigt. Neue V4L2-Option
`wakeLightChangePixelRatio` (Default 0.30) klassifiziert solche Kandidaten bei Monitor OFF als Lichtwechsel.
`lightChangePixelRatio` (0.55) bleibt für den normalen Filter unverändert. ERLEDIGT (Simulation).

## 2. Betroffene Repositories

`E:\Mertineit-Workspace\projects\MMM-MotionDetector` (Fork ManuZz80, Upstream rejas, PR #130).

## 3. Branch und HEAD

Branch `v4l2-backend`. Basis `dc344600df01a42fee44463865dce3853d67e387` (lokal). Der Fix ist der lokale
Commit "Fix dark-room light wake classification" direkt auf `dc34460` (SHA: `git log -1`). Lokal 2 ahead /
0 behind; `origin/v4l2-backend` = `9f2ffe3c48e00661e6d3243652013ee8e5126370`. **Nicht gepusht.**

## 4. Git-Worktree-Status

Kein separates Worktree. Nach dem Commit keine Änderungen an versionierten Dateien; unversioniert nur die drei
fremden Dateien aus der Einleitung.

## 5. Bestätigte Root Cause

Der normale Filter verlangt `changedPixelRatio >= lightChangePixelRatio (0.55)`. Beim Lichtschalten im
dunklen Raum ändern sich nur ca. 34-43 % der Pixel stark genug für `pixelDiffThreshold`, bei eindeutiger
Helligkeit und Richtung. Kein Frame im Bestätigungsfenster erreicht 55 %, daher gibt das Fenster den Wake frei.
Das Fenster allein kann das nicht lösen. ERLEDIGT.

## 6. Architekturentscheidungen

- Wake-Lichtwechsel = Monitor OFF, Frame hat Motion (`score > 0 && score >= scoreThreshold`),
  `|brightness| >= lightChangeThreshold`, `pixels >= wakeLightChangePixelRatio`,
  `direction >= lightChangeDirectionRatio`. Brightness und Direction bleiben zwingend.
- Reihenfolge je Frame: normaler Lichtwechsel, Stabilisierungsframe, Wake-Lichtwechsel, Bestätigungsfenster,
  neuer Kandidat. Die Wake-Klassifikation greift damit sowohl für den Kandidaten selbst als auch für jeden
  Frame im Fenster und verwirft einen gehaltenen Kandidaten.
- Nach einem Wake-Lichtwechsel folgt wie beim normalen Lichtwechsel ein Stabilisierungsframe; keine
  Statusmeldung für diese Frames; Timeout unberührt.
- Nie bei Monitor ON; der normale Filter bleibt unverändert.
- Normalisierung wie `wakeConfirmationPixelRatio` über gemeinsame `ratioOption()`: endliche Zahl im Bereich
  `0..1`, sonst 0.30; `0` bleibt `0`.
- Logs mit score/pixels/brightness/direction beim Halten (`large wake candidate held back for confirmation`)
  und beim Verwerfen (`wake candidate ignored as global light change`), nur bei Kandidaten.
- Test-Fixtures: bisherige "Personen" waren gleichmäßig helle Blöcke auf gleichmäßigem Hintergrund und
  erfüllen die neue Klassifikation. Ersetzt durch texturierte Personen mit identischen Scores; keine
  erwarteten Werte geändert. Fenster-Tests nutzen eine langsame Rampe unter der Helligkeitsschwelle, damit sie
  weiterhin das Fenster und nicht die neue Klassifikation prüfen. HW-01-Restart-Tests laufen mit
  `wakeConfirmationFrames: 1`, damit ein überlebender Kandidat wieder auffällt.
- Bekannter Zielkonflikt (README dokumentiert): ein großes, gleichmäßig helleres oder dunkleres Objekt auf
  ruhigem Hintergrund wird bei OFF wie ein Lichtwechsel behandelt; Wake erst bei weiterer Bewegung.

## 7. Geänderte Dateien (im lokalen Commit)

- `node_helper.js`: `ratioOption()`, `wakeLightChangePixelRatio()`, Klassifikationszweig, Logs mit Messwerten.
- `MMM-MotionDetector.js`: Default `wakeLightChangePixelRatio: 0.30` (Browserpfad unberührt).
- `README.md`: neue Option, Abgrenzung zu `lightChangePixelRatio`, Hinweis zum Zielkonflikt.
- `tests/node-helper-v4l2-wake-light-change.test.js` (neu, 38 Tests).
- `tests/node-helper-v4l2-wake-confirmation.test.js`, `tests/node-helper-v4l2-hw01.test.js`: Fixtures.
- `QA/CURRENT-IMPLEMENTATION-STATUS.md`: dieser Stand.

## 8. Implementiertes Verhalten

Siehe Punkt 6, durch 272 Tests abgesichert.

## 9. Offene Arbeiten

- Nachttest auf dem Raspberry Pi (Plan im Abschlussbericht der Sitzung).
- Push erst nach bestandenem Nachttest und ausdrücklicher Freigabe.

## 10. Teststatus

- Baseline `dc34460`: 234/234.
- Rot-Nachweis auf unverändertem Produktcode: umgestellte Dateien grün (Wake-Confirmation 53/53, HW-01 22/22);
  neue Datei 25 fail / 13 pass, darunter beide Pi-Tests (Licht an/aus) mit Trace `[0,0,0,1,1]` statt
  `[0,0,0,0,0]`. Gesamt 247/272.
- Nach Fix: `node --test` und `test:unit` 272/272, 0 fail/skipped/cancelled; neue Datei 38/38,
  Wake-Confirmation 53/53, HW-01 22/22.
- `node --check` beide Dateien OK, `git diff --check` OK, ESLint exit 0, cspell 0 Issues.
- Prettier exit 1 nur durch die fünf bekannten CRLF-Fremddateien; daher `lint` und `npm test` exit 1 in der
  Lint-Stufe. Alle übrigen Gates einzeln grün.

## 11. Bekannte Blocker

Keine. Vorbestehende Prettier-Warnungen durch Windows-CRLF in dependabot.yaml, automated-tests.yaml,
CHANGELOG.md, package-lock.json, package.json bewusst nicht angefasst.

## 12. Datenbank/Schema

Keine.

## 13. Version

`package.json` 1.8.1, unverändert.

## 14. Build

Kein Build-Schritt.

## 15. Nächster Schritt

Commit ohne Push auf den Pi bringen (z. B. neues `git bundle` mit beiden lokalen Commits) und den
Nachttestplan abarbeiten. Logs `wake candidate ignored as global light change`,
`large wake candidate held back for confirmation` und `held-back wake confirmed` mit ihren Messwerten sammeln.

## 16. Laufender Befehl

Keiner.

## 17. Entscheidungen des Auftraggebers

- NICHT pushen; `origin/v4l2-backend` bleibt `9f2ffe3`. Kein Reset auf `9f2ffe3`, kein Force-Push, main unberührt.
- Nachttest auf dem Raspberry Pi vor jeder Veröffentlichung.
- `lightChangePixelRatio` 0.55 und bestehende Optionen semantisch unverändert; Mehrframe-Fenster bleibt.
- Keine raumspezifischen Werte als allgemeinen Default.
