# CURRENT-IMPLEMENTATION-STATUS.md

Stand: 2026-09-13. Aufgabe: HW-02 Mehrframe-Wake-Bestätigung (Nachfolger von HW-01).
**IMPLEMENTIERT, LOKAL COMMITTET, NICHT GEPUSHT – HARDWARE-RETEST ERFORDERLICH.**

Frühere Aufträge (PR-#130-Findings, QA-01..07, HW-01) sind ERLEDIGT und gepusht; Details siehe Git-Historie
(`67290c5`, `ee876a5`, `9f2ffe3`) sowie die unversionierten Berichte `QA/INDEPENDENT-QA-2026-09-12.md` und
`QA/HW-01-REPORT-2026-09-12.md` (nicht von dieser Sitzung, nicht verändert).

## 1. Aktuelles Ziel

Der HW-01-Pending-Wake wartete nur einen Folgeframe. Realer Pi-Log bei dunklem Raum: Wake bei Score
6532/6534/6734 (34-35 % von 19.200 Pixeln) trotz Lichtwechsel. Ziel: konfigurierbares Bestätigungsfenster
`wakeConfirmationPixelRatio` (Default 0.25) und `wakeConfirmationFrames` (Default 3), nur V4L2, nur bei
Monitor OFF. Browserbackend unverändert. ERLEDIGT (Simulation), Hardware-Retest ausstehend.

## 2. Betroffene Repositories

`E:\Mertineit-Workspace\projects\MMM-MotionDetector` (Fork ManuZz80, Upstream rejas, PR #130).

## 3. Branch und HEAD

Branch `v4l2-backend`. Ausgangs-HEAD `9f2ffe3c48e00661e6d3243652013ee8e5126370`. Der Fix ist der lokale
Commit "Fix wake confirmation for slow exposure changes" direkt auf `9f2ffe3` (SHA: `git log -1`).
Lokal 1 ahead / 0 behind `origin/v4l2-backend`. **Nicht gepusht.**

## 4. Git-Worktree-Status

Kein separates Worktree. Nach dem Commit keine Änderungen an versionierten Dateien; unversioniert nur die zwei
fremden QA-Berichte.

## 5. Bestätigte Root Cause

`processV4L2Frame` las `v4l2PendingMotionScore` im unmittelbar nächsten vollständigen Frame und löschte ihn
bedingungslos. War dieser Frame kein vollständiger globaler Lichtwechsel (z. B. zweiter Belichtungsschritt mit
45 % veränderten Pixeln), wurde sofort geweckt; ein erneutes Vormerken war durch `pendingMotionScore === 0`
ausgeschlossen. Die 25-%-Schwelle griff bei 34-35 % korrekt; nicht sie, sondern das Ein-Frame-Fenster ist
die Ursache. ERLEDIGT.

## 6. Architekturentscheidungen

- Kandidatenframe zählt NICHT als Frame 1. `wakeConfirmationFrames = N` vollständige Folgeframes werden
  beobachtet; ohne erkannten Lichtwechsel Wake genau auf Folgeframe N. `N = 1` entspricht exakt 9f2ffe3.
- Kein vorzeitiger Wake innerhalb des Fensters (der Zwischenframe war die Fehlerursache).
- Maximale Zusatzlatenz N × effektives Capture-Intervall (Default 3 × 1000 ms = 3 s).
- Lichtwechsel im Fenster verwirft den Kandidaten; danach normale Stabilization.
- Gemeldeter Score beim Wake = Maximum aus Kandidat und Fensterframes.
- Normalisierung: Ratio endliche Zahl im Bereich `0..1`, sonst 0.25; Frames Ganzzahl >= 1, sonst 3.
- Reset bei Restart, Stop, error, exit, close über die bestehenden Stellen (`v4l2PendingMotionScore = 0`);
  der Frame-Zähler gilt nur, solange ein Score vorgemerkt ist.

## 7. Geänderte Dateien (im lokalen Commit)

- `node_helper.js`: Normalisierungsfunktionen, Mehrframe-Fenster, Logmeldungen für Halten/Verwerfen/Bestätigen.
- `MMM-MotionDetector.js`: Defaults beider Optionen (Browserpfad unberührt).
- `README.md`: beide Optionen dokumentiert; Prettier hat die Tabelle neu ausgerichtet.
- `tests/node-helper-v4l2-wake-confirmation.test.js` (neu, 53 Tests).
- `tests/node-helper-v4l2-hw01.test.js`: fünf Ein-Frame-Tests mit explizitem `wakeConfirmationFrames: 1`;
  keine Assertion geändert.
- `QA/CURRENT-IMPLEMENTATION-STATUS.md`: dieser Stand.

## 8. Implementiertes Verhalten

Siehe Punkt 6, durch 234 Tests abgesichert.

## 9. Offene Arbeiten

- Raspberry-Pi-Retest (Plan im Abschlussbericht der Sitzung).
- Push erst nach bestandenem Retest und ausdrücklicher Freigabe.

## 10. Teststatus

- Baseline 9f2ffe3: 181/181 grün.
- Rot-Nachweis (Produktcode unverändert 9f2ffe3): HW-01-Datei mit explizitem `ONE_FRAME` exit 0 (22/22);
  neue Datei exit 1 (43 fail / 10 pass), u. a. alle vier Nacht-Rampen mit Trace `[0,1,1,1,1]` statt
  `[0,0,0,0,0]`.
- Nach Fix: `node --test` und `test:unit` 234/234, 0 fail/skipped/cancelled; neue Datei 53/53, HW-01 22/22.
- `node --check` beide Dateien OK, `git diff --check` OK, ESLint exit 0, cspell 0 Issues (32 Dateien).
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

Commit auf den Raspberry Pi bringen (ohne Push, z. B. per Bundle oder direktem Pull vom Entwicklungsrechner)
und den Retestplan abarbeiten. Bei Bedarf dort lokal `wakeConfirmationFrames` erhöhen und die Nachtlogs
(`large wake candidate held back`, `held-back wake discarded by light change`, `held-back wake confirmed`)
auswerten.

## 16. Laufender Befehl

Keiner.

## 17. Entscheidungen des Auftraggebers

- NICHT pushen; nur lokaler Commit. Kein Force-Push, keine Änderung an main.
- Hardware-Retest auf dem Raspberry Pi vor jeder Veröffentlichung.
- 0.25 nicht absenken; keine raumspezifischen Werte als Default.
- Browserbackend unverändert; 320x240 unverändert.
