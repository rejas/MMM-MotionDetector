# CURRENT-IMPLEMENTATION-STATUS.md

## 1. Aktuelles Ziel

Offene Review-Findings aus PR rejas/MMM-MotionDetector#130 (Branch `v4l2-backend`) beheben:
percentagePoweredOff im V4L2-Pfad, ffmpeg-Lifecycle/Fehlerbehandlung, scoreThreshold===0-Bug,
fehlende automatisierte Tests, sowie Konfigurations-Normalisierung. Browser-/Electron-Pfad muss
vollständig rückwärtskompatibel bleiben. ERLEDIGT (siehe Punkt 8/9).

## 2. Betroffene Repositories

- `E:\Mertineit-Workspace\projects\MMM-MotionDetector` (Fork `ManuZz80/MMM-MotionDetector`, Upstream `rejas/MMM-MotionDetector`)

## 3. Branch und aktueller HEAD

- Branch: `v4l2-backend`
- HEAD vor dieser Sitzung: `be648c9` "Add optional V4L2 motion backend"
- Neuer Commit dieser Sitzung: siehe Punkt 14 (wird nach dem Commit ergänzt)

## 4. Git-Worktree-Status

Kein separates Worktree verwendet, direkt im Klon gearbeitet. Vor Beginn `git status` geprüft:
sauber, `nothing to commit`. Am Ende der Sitzung: siehe `git status` im Abschlussbericht.

## 5. Bereits bestätigte Root Causes

- **A) percentagePoweredOff**: Der V4L2-Zweig in `MMM-MotionDetector.js` (`socketNotificationReceived`,
  `V4L2_MOTION_STATUS`) hat `percentagePoweredOff` nie berechnet/aktualisiert (nur `poweredOffTime`
  bei ON-Transition inkrementiert). Bestätigt durch Lesen des Original-Codes.
- **B) ffmpeg Lifecycle**: `V4L2_CAMERA_STARTED` wurde synchron direkt nach `spawn()` gesendet, bevor
  irgendein Frame verarbeitet wurde. Ein nachträglicher `exit`-Event (z. B. Device fehlt, Permission
  denied) wurde nur geloggt (`Log.warn`), nie als `V4L2_CAMERA_ERROR` gemeldet. Kein Unterschied
  zwischen kontrolliertem SIGTERM (Restart) und echtem Fehler-Exit. Kein Schutz gegen doppelte
  `INIT_V4L2`-Aufrufe (zwei parallele ffmpeg-Prozesse, stale Events).
- **C) scoreThreshold===0**: `node_helper.js` verwendete `score >= Number(config.scoreThreshold)`
  ohne `score > 0`-Guard, im Gegensatz zur bestehenden `DiffCamEngine.meetsScoreThreshold()`-Semantik
  (`score > 0 && score >= scoreThreshold`). Bei `scoreThreshold: 0` wurde jeder unveränderte Frame
  (`score === 0`) fälschlich als Motion gemeldet. Gleiches Muster zusätzlich im Pixel-Loop gefunden
  (`absDelta >= pixelThreshold` ohne `absDelta > 0`-Guard) – analog gefixt.
- **Konfiguration**: `Number(config.x) || default` behandelte `0` als "nicht gesetzt" für
  `pixelDiffThreshold`, `lightChangeThreshold`, `lightChangePixelRatio`, `lightChangeDirectionRatio`,
  `captureIntervalTime`, `timeout` – bestätigt durch Code-Lesen, entspricht auch dem von GitHub
  Copilot in PR #130 gemeldeten Finding zu `pixelDiffThreshold`.
- **Dokumentationslücke**: `autoHideOnNoMotion` (Default in `MMM-MotionDetector.js`) fehlte in der
  README-Konfigurationstabelle. Selbst verifiziert durch Lesen von README.md.
- Reale PR-Review-Kommentare via GitHub API abgerufen und mit den vier A–D-Punkten exakt
  abgeglichen (Zeilen 81/181/263/190 in `MMM-MotionDetector.js`/`node_helper.js`).

## 6. Getroffene Architekturentscheidungen

- Gemeinsame Hilfsmethode `computePercentagePoweredOff(currentDate)` in `MMM-MotionDetector.js`
  extrahiert, von Browser- und V4L2-Pfad gemeinsam genutzt (keine doppelte Logik).
- `toConfigNumber(value, fallback)` in `node_helper.js` eingeführt: `undefined`/`null`/NaN/nicht
  parsebar → fallback, `0` und negative Zahlen bleiben erhalten (löst das `|| default`-Problem).
- ffmpeg-Prozess-Referenzvergleich (`this.v4l2Process !== proc`) statt Generation-Zähler, um
  Stale-Events nach einem Neustart zu erkennen — einfacher und robuster.
- Eigenes Flag `proc.v4l2Intentional`, direkt am Prozessobjekt gesetzt vor `kill("SIGTERM")`,
  um kontrollierte Beendigung von echtem Fehler-Exit zu unterscheiden.
- `V4L2_CAMERA_STARTED` wird jetzt erst gesendet, sobald der erste vollständige Frame aus dem
  Buffer geschnitten wurde (Beweis, dass Device+ffmpeg tatsächlich Frames liefern).
- Kein try/catch um `spawn()` ergänzt: Node meldet Spawn-Fehler (ENOENT etc.) laut Dokumentation
  asynchron über das `error`-Event, nicht synchron — vorhandener Handler deckt das bereits ab.
- Hardcodiertes ffmpeg `-video_size 320x240` **bewusst nicht verändert** (Copilot-Finding, aber nicht
  Teil des vom Auftraggeber vorgegebenen A–D-Katalogs; Risiko einer Regression auf dem bereits
  Pi-getesteten Hardwarepfad höher als der Nutzen ohne Hardwaretest-Möglichkeit hier). Im
  Abschlussbericht als offener Punkt für Rücksprache vermerkt.
- Keine Änderung an Buffer/Backpressure-Handling: Buffer-Wachstum ist durch die feste Framegröße
  (19200 Byte) begrenzt, kein unbegrenztes Wachstum feststellbar — geprüft, kein Fix nötig.

## 7. Bereits geänderte Dateien und Zweck jeder Änderung

- `MMM-MotionDetector.js`: neue Methode `computePercentagePoweredOff`; V4L2- und Browser-Pfad
  nutzen sie jetzt identisch (Finding A).
- `node_helper.js`: `toConfigNumber()`-Helper; `startV4L2`/neues `stopV4L2` mit robustem
  Lifecycle-Handling (Finding B); `processV4L2Frame` mit `score > 0`-Guard, `absDelta > 0`-Guard
  und durchgängiger `toConfigNumber`-Normalisierung (Finding C + Konfig-Robustheit).
- `README.md`: `autoHideOnNoMotion`-Zeile in der Konfigurationstabelle ergänzt; zusätzlich per
  `prettier --write` neu formatiert (nur diese Datei, s. Punkt 10).
- `cspell.config.json`: `"rawvideo"` zum Wörterbuch hinzugefügt (bereits vor dieser Sitzung im
  Code vorhandenes ffmpeg-Fachwort, das `cspell` fälschlich als Tippfehler meldete).
- `tests/module-mock.js`: Absturzschutz, wenn `cameraBackend: "v4l2"` getestet wird
  (`DiffCamEngine.init()` wird in diesem Zweig nie aufgerufen, `engineOptions` bleibt `undefined`).
- `tests/node-helper-mock.js`: `child_process.spawn`-Stub (`createFakeProcess`, EventEmitter-basiert)
  und `helper.sendSocketNotification`-Stub ergänzt, damit der V4L2-Pfad testbar ist.
- `tests/module-v4l2.test.js` (neu): Tests für `percentagePoweredOff` und
  `V4L2_CAMERA_STARTED`/`V4L2_CAMERA_ERROR` auf Modulseite.
- `tests/node-helper-v4l2-lifecycle.test.js` (neu): ffmpeg-Lifecycle-Tests (Spawn-Erfolg,
  Spawn-Error, non-zero Exit, kontrollierter SIGTERM/Restart, Stale-Prozess-Schutz).
- `tests/node-helper-v4l2-motion.test.js` (neu): Frame-Buffering/Chunk-Boundaries,
  Threshold-Semantik, Light-Change-Filter, Timeout/Wake, Konfig-Normalisierung.

## 8. Aktuell implementiertes Verhalten

Siehe Abschlussbericht im Chat (Punkte 1–13 der geforderten Struktur). Kurzfassung:

- percentagePoweredOff im V4L2-Pfad identisch zum Browser-Pfad (keine Doppelzählung, kein NaN).
- `V4L2_CAMERA_STARTED` erst nach erstem echten Frame; `V4L2_CAMERA_ERROR` bei Spawn-Fehler und
  unerwartetem non-zero Exit; kontrollierter SIGTERM (Restart) erzeugt keine Fehlermeldung.
- `scoreThreshold: 0` + `score: 0` → keine Motion; `score > 0` → Motion (upstream-konform).
- Alle betroffenen Config-Werte tolerieren `0` als gültigen Wert, fallen nur bei
  `undefined`/`null`/NaN auf den Default zurück.

## 9. Noch offene Arbeiten

- Kein offener Implementierungspunkt aus dem A–D-Katalog. Optional/offen (nur nach Rücksprache):
  Copilot-Finding "hardcodierte ffmpeg `-video_size 320x240`" – bewusst nicht angefasst
  (siehe Punkt 6). Reale Hardware-Verifikation auf Raspberry Pi steht noch aus (s. Abschlussbericht).
- Commit wurde in dieser Sitzung erstellt; Push-Status siehe Abschlussbericht/Git-Log.

## 10. Teststatus mit Ergebnissen

- `node --test "tests/**/*.test.js"`: **106 Tests, 106 pass, 0 fail** (30 Suiten), Laufzeit ~183ms.
  Davon neu: 5 (module-v4l2) + 8 (node-helper-v4l2-lifecycle) + 21 (node-helper-v4l2-motion) = 34
  neue Testfälle für den V4L2-Pfad.
- `node --run test:spelling` (cspell): **0 Issues** (nach Ergänzung von "rawvideo").
- `node --run lint` (`eslint && prettier . --check`): eslint meldet **0 Fehler**. `prettier --check`
  meldet **6 vorbestehende** CRLF-bedingte Formatierungswarnungen in Dateien, die in dieser Sitzung
  NICHT verändert wurden (`.github/dependabot.yaml`, `.github/workflows/automated-tests.yaml`,
  `CHANGELOG.md`, `cspell.config.json`, `package-lock.json`, `package.json`). Verifiziert per
  `git stash` + Lauf auf unverändertem `origin/v4l2-backend`-HEAD: **identischer Fehler besteht
  bereits vor jeder Änderung dieser Sitzung** (Ursache: lokales `core.autocrlf=true` unter Windows,
  Repository-Blobs sind LF, CI läuft auf Linux und ist nicht betroffen). `cspell.config.json` wurde
  inhaltlich geändert (Wort ergänzt), ist aber bereits vorher CRLF gewesen und daher weiterhin in
  dieser Liste – kein neuer Fehler. `README.md` wurde erfolgreich auf LF normalisiert und ist
  NICHT mehr in der Fehlerliste.
- `node --check MMM-MotionDetector.js`, `node --check node_helper.js`: **OK**.
- `git diff --check`: **keine Whitespace-Fehler**.

## 11. Bekannte Fehler/Blocker

- `node --run lint` schlägt lokal wegen der 6 o.g. vorbestehenden CRLF-Dateien fehl (exit 1),
  unabhängig von dieser Sitzung. Nicht behoben, da Root Cause eine lokale Git-Konfiguration
  (`core.autocrlf=true`) ist, die laut Vorgabe nicht verändert werden darf, und ein Reformatieren
  der 6 fremden Dateien unbeabsichtigte Diffs (u. a. in `package-lock.json`) erzeugen würde.
  CI (GitHub Actions, Linux) ist davon nicht betroffen.

## 12. Datenbank-/Schemaänderungen

Keine (Modul ohne Datenbank/Schema).

## 13. Versionsstand

`package.json` Version weiterhin `1.8.1` (PR-Beschreibung sagt nichts von einem Versionsbump;
nicht ohne ausdrückliche Freigabe geändert).

## 14. Build-/Artefaktstatus

Kein Build-Schritt im Projekt (reines JS-Modul, kein Bundling). `npm ci` erfolgreich (263 packages).

## 15. Exakter nächster sinnvoller Arbeitsschritt

1. `git status`/`git diff` final prüfen (siehe Abschlussbericht).
2. Commit erstellen: "Fix V4L2 lifecycle and motion state handling".
3. Push-Versuch zu `origin v4l2-backend`; falls nicht möglich (kein Schreibzugriff aus dieser
   Umgebung), dem Nutzer den lokalen Commit-SHA mitteilen und um manuellen Push bitten.
4. Reale Verifikation auf Raspberry-Pi-Hardware nachholen (siehe Abschlussbericht Punkt 13).

## 16. Laufender Befehl/Test

Kein Befehl/Test läuft aktuell im Hintergrund. Letzter Lauf: `node --run test` (lint+spelling+unit)
mit obigem Ergebnis (Punkt 10).

## 17. Entscheidungen des Auftraggebers, die für die Fortsetzung relevant sind

- Ausschließlich Branch `v4l2-backend`, kein `main`, kein Force-Push, keine History-Rewrites/Rebase.
- Browser-/Electron-Pfad muss unverändert funktionieren (Default `cameraBackend: "browser"`).
- Keine Hardwaretests auf dieser Windows-Maschine erfunden oder simuliert als "bestanden" —
  alle V4L2-Tests laufen gegen Mocks (kein echtes ffmpeg/Device).
- README nur dort angepasst, wo durch Code-Änderungen nötig (nur `autoHideOnNoMotion`-Zeile).
