# GM Combat Workspace – Roadmap

## Arbeitsweise

Diese Roadmap ist gleichzeitig Plan, Prüfliste und Abnahmeprotokoll.

Wir bearbeiten immer nur eine Etappe. Die nächste Etappe beginnt erst, wenn:

1. der Code der aktuellen Etappe vollständig ist,
2. automatische Prüfungen erfolgreich sind,
3. die beschriebenen Foundry-Tests durchgeführt wurden,
4. bekannte Abweichungen dokumentiert sind,
5. die Etappe von Tim freigegeben wurde.

Änderungswünsche sollen möglichst vor Beginn einer Etappe direkt in dieser Datei ergänzt werden. Während einer laufenden Etappe werden neue Wünsche entweder:

- in die aktuelle Etappe aufgenommen, wenn sie für deren Abnahme notwendig sind, oder
- unter „Später / Backlog“ notiert, damit der aktuelle Testumfang stabil bleibt.

Jede Etappe erhält einen eigenen Git-Branch und einen eigenen Pull Request. Dadurch kann der Patch vor dem Zusammenführen vollständig angesehen und kommentiert werden.

## Unterstützte Umgebung

### Pflicht

- Foundry Virtual Tabletop 14
- Dungeons & Dragons Fifth Edition 5.3 oder neuer
- GM-Benutzer

### Fremde Pflichtmodule

Keine.

### Optionale Integrationen

- RSReforged (`rsreforged`)
- Monk's Combat Details (`monks-combat-details`)

Das Modul muss ohne diese optionalen Module starten und alle nativen D&D5e-Grundfunktionen bereitstellen.

## Statuslegende

- `[ ]` nicht begonnen
- `[~]` in Arbeit
- `[x]` implementiert und abgenommen
- `[!]` blockiert oder mit bekannter Abweichung

---

## Etappe 0 – Entwicklungs- und Testfundament

**Status:** `[x]` – Abgenommen am 2026-07-30

### Ziel

Eine stabile Grundlage schaffen, auf der jede weitere Funktion isoliert implementiert und geprüft werden kann.

### Umfang

- Modulstruktur in klar getrennte Bereiche aufteilen
- zentralen Modul-Namespace und Logger einführen
- Einstellungen und Konstanten zentralisieren
- Entwicklungsmodus mit ausführlicheren Konsolenmeldungen ergänzen
- Test- und Freigabecheckliste anlegen
- Installationspaket als ZIP reproduzierbar erzeugen
- GitHub-Release-Struktur vorbereiten
- vorhandenes Manifest überprüfen

### Noch nicht enthalten

- Dashboard
- automatisches Öffnen von Statblocks
- Reaktionen
- Legendary Actions
- Bewegungstracker
- Encounter-Vorbereitung

### Vorgesehene Struktur

```text
gm-combat-workspace/
├─ scripts/
│  ├─ main.js
│  ├─ config.js
│  ├─ settings.js
│  ├─ core/
│  ├─ applications/
│  ├─ services/
│  └─ integrations/
├─ styles/
├─ templates/
├─ lang/
├─ module.json
├─ README.md
├─ ROADMAP.md
└─ CHANGELOG.md
```

### Automatische Prüfungen

- `module.json` ist gültiges JSON
- alle Sprachdateien sind gültiges JSON
- alle im Manifest genannten Dateien existieren
- JavaScript-Dateien enthalten keine Syntaxfehler
- das erzeugte ZIP enthält genau einen Modulordner mit dem richtigen Modul-ID-Pfad

### Foundry-Test

1. Modul in Foundry installieren.
2. Welt mit D&D5e 5.3+ starten.
3. Modul aktivieren.
4. Welt neu laden.
5. prüfen, dass keine Fehlermeldung erscheint.
6. Einstellungen des Moduls öffnen.
7. prüfen, dass alle vorhandenen Einstellungen lesbar sind.
8. Welt einmal ohne RSReforged und Monk's Combat Details laden.

### Abnahme

- Modul startet fehlerfrei.
- Es existiert höchstens eine klar gekennzeichnete Debugmeldung in der Konsole.
- Keine optionale Integration wird als Pflicht verlangt.
- Ein installierbares Test-ZIP steht zur Verfügung.

---

## Etappe 1 – Zentraler Combat Coordinator

**Status:** `[x]` – Abgenommen am 2026-08-01

### Ziel

Combat- und Zugwechsel genau einmal erkennen und als verlässliche Grundlage für alle späteren Funktionen bereitstellen.

### Umfang

- aktuellen Encounter der sichtbaren Szene bestimmen
- Beginn und Ende eines Encounters erkennen
- Rundenwechsel erkennen
- Zugwechsel erkennen
- Spieler-, NPC- und Placeholder-Combatants unterscheiden
- aktiven Combatant, Actor, Token und Szene auflösen
- Änderungen durch Aktualisieren, Erstellen und Löschen von Combatants erkennen
- Szenenwechsel und `canvasReady` behandeln
- doppelte Verarbeitung desselben Zugwechsels verhindern
- internen Ereignisverteiler für spätere Dienste bereitstellen

### Noch nicht enthalten

- sichtbares Dashboard
- Statblock automatisch öffnen
- Reaktions- oder Legendary-Logik
- Zeichnungen für Bewegung

### Zu prüfende Fälle

- Encounter starten und beenden
- vorwärts und rückwärts durch die Initiative wechseln
- Runde erhöhen und manuell verändern
- Combatant hinzufügen oder entfernen
- Initiative eines Combatants ändern
- aktiven Gegner löschen
- Szene bei laufendem Encounter wechseln
- Spieler-Placeholder ohne Actor
- versteckter NPC
- mehrere Tokens desselben Actors

### Foundry-Test

Im Entwicklungsmodus wird für jedes tatsächlich neue Ereignis genau ein strukturierter Eintrag ausgegeben:

- `combatStarted`
- `combatEnded`
- `roundChanged`
- `turnChanged`
- `activeCombatantChanged`

### Abnahme

- Ein Zugwechsel erzeugt niemals doppelte Folgeaktionen.
- Actor und Token des aktiven NPCs werden korrekt erkannt.
- Placeholders ohne Actor verursachen keinen Fehler.
- Szenenwechsel hinterlassen keine veralteten Referenzen.

---

## Etappe 2 – Zwei-Monitor-Workspace und nativer Gegner-Statblock

**Status:** `[-]` – Etappe 2A abgenommen, Etappe 2B als Version 0.4.0 im Foundry-Test

### Ziel

Die Karte und Tokensteuerung bleiben vollständig im Laptop-Fenster. Ein zweiter vollständiger Foundry-Client zeigt den GM Workspace und bettet links den normalen D&D5e-Statblock des aktiven, angeklickten oder angepinnten Gegners ein.

### Etappe 2A – Zwei-Fenster-Verbindung

**Status:** `[x]`

- getrenntes Companion-Fenster über den GM-Workspace-Knopf öffnen
- Kampfzustand und aktive Teilnehmer zwischen beiden Fenstern synchronisieren
- Laptop-Tokenauswahl über BroadcastChannel übertragen
- bestehendes Companion-Fenster fokussieren, ohne es neu zu laden
- denselben GM-Account in beiden Fenstern verwenden

### Etappe 2B – Nativer Statblock

**Status:** `[-]` – Version 0.4.0

- endgültiges Zweispalten-Grundlayout im Companion-Fenster
- nativen, konfigurierten Actor-Sheet-Typ links einbetten
- Auswahlpriorität: angepinnt, auf Laptop angeklickt, aktiver NPC
- Auswahlquelle sichtbar anzeigen
- Gegner anpinnen und Anheftung lösen
- Spieler und Placeholders nicht als Gegner-Statblock öffnen
- klassischen ActorSheet- und ApplicationV2-Renderweg unterstützen
- große Statblocks innerhalb der linken Spalte scrollbar halten

### Wichtige Funktionsregel

Das Modul baut keinen Ersatz-Statblock. Angriffe, Features, Rettungswürfe, Recharge und legendäre Aktionen müssen über das konfigurierte native D&D5e-Sheet und optionale RSReforged-Abläufe funktionieren.

### Abnahme

- Der Laptop erhält niemals ein automatisch geöffnetes Sheet.
- Der richtige NPC-Statblock erscheint vollständig im Companion-Workspace.
- Angriffe, Features und Würfe bleiben normal verwendbar.
- Aktive, angeklickte und angepinnte Auswahl funktionieren in der festgelegten Priorität.
- Beim Wechsel entstehen keine doppelten Sheets oder Würfe.
- Große Statblocks bleiben scrollbar und vollständig erreichbar.
- Beide Foundry-Fenster bleiben nach der Erstladung flüssig und fehlerfrei.

---

## Etappe 3 – Dashboard-Grundfenster und Gegnerliste

**Status:** `[ ]`

### Ziel

Ein kompaktes, verschiebbares GM-Fenster bereitstellen, ohne die Map oder Token-Steuerung zu blockieren.

### Umfang

- ApplicationV2-basiertes Dashboard
- Fenster öffnen, schließen und minimieren
- Position und Größe merken
- nur für GMs anzeigen
- Gegner des aktuellen Encounters auflisten
- Status darstellen:
  - aktiver Zug
  - sichtbar oder versteckt
  - besiegt
  - Token auf aktueller Szene vorhanden
- Name anklicken: Token auswählen
- Name doppelklicken: Statblock öffnen
- Hover: Token lokal hervorheben
- Aktualisierung bei Actor-, Token-, Combatant- und Combat-Änderungen
- Aktualisierungen bündeln, um Flackern zu vermeiden
- leerer Zustand ohne Encounter oder ohne Gegner

### Noch nicht enthalten

- HP-Bearbeitung
- Rettungswürfe
- Reaktionen
- Legendary Actions

### Foundry-Test

- 0, 1, 10 und 30 Gegner im Encounter
- Gegner hinzufügen und entfernen
- Gegner verstecken und sichtbar machen
- Gegner besiegen und wiederherstellen
- Token auf anderer Szene
- mehrere gleichnamige Gegner
- mehrere Tokens desselben Actors
- Dashboard mehrfach öffnen und schließen

### Abnahme

- Die Map bleibt bedienbar.
- Das Dashboard erzeugt keine zweite Instanz.
- Gegnerliste bleibt bei Änderungen aktuell.
- Hover und Auswahl verschieben die Kamera nicht.
- Gleichnamige Gegner sind unterscheidbar.

---

## Etappe 4 – HP, RK und Mehrfachauswahl

**Status:** `[ ]`

### Ziel

Die wichtigsten Gegnerwerte direkt im Dashboard verwalten.

### Umfang

- Rüstungsklasse anzeigen
- aktuelle und maximale Trefferpunkte anzeigen
- temporäre Trefferpunkte anzeigen
- HP-Eingabe:
  - `50` setzt aktuelle HP auf 50
  - `-20` wendet 20 Schaden an
  - `+10` wendet 10 Heilung an
- Untergrenze und Obergrenze nachvollziehbar behandeln
- Mehrfachauswahl von Gegnern
- Schaden oder Heilung auf mehrere ausgewählte Gegner anwenden
- synthetische Token-Actors und verknüpfte World-Actors korrekt behandeln
- keine doppelten Änderungen auf demselben Actor
- sofortige sichtbare Aktualisierung

### Sicherheitsregel

Eine Mehrfachaktion zeigt vor der Ausführung klar Anzahl und Art der betroffenen Gegner. Die Auswahl bleibt sichtbar.

### Foundry-Test

- Schaden, Heilung und direktes Setzen
- temporäre HP
- Wert 0
- Heilung über maximale HP
- negativer Schaden und ungültige Eingaben
- mehrere verknüpfte Tokens desselben Actors
- mehrere unverknüpfte Tokens desselben Basis-Actors
- Mehrfachauswahl mit besiegtem Gegner

### Abnahme

- Alle HP-Operationen ändern exakt die erwarteten Actors.
- Kein Actor wird durch Mehrfachauswahl unbeabsichtigt doppelt geändert.
- RK und HP stimmen mit dem normalen Statblock überein.
- Ungültige Eingaben verändern keine Daten.

---

## Etappe 5 – Rettungswürfe

**Status:** `[ ]`

### Ziel

Alle sechs Rettungswürfe eines Gegners direkt aus dem Dashboard auslösen.

### Umfang

- STR, DEX, CON, INT, WIS und CHA mit Modifikator anzeigen
- native D&D5e-Rettungswurf-API verwenden
- korrekten Actor-, Token- und Scene-Speaker setzen
- Würfe pro Gegner ausführen
- optionaler Sammelrettungswurf für ausgewählte Gegner erst nach Einzelwurf-Abnahme
- normale D&D5e- und RSReforged-Chatkarten erhalten

### Foundry-Test

- alle sechs Rettungswürfe eines NPCs
- kompetenter und nicht kompetenter Save
- Token-Actor und World-Actor
- versteckter Gegner
- ohne und mit RSReforged
- Abbrechen eines Würfeldialogs

### Abnahme

- Modifikator im Dashboard entspricht dem normalen Statblock.
- Ergebnis und Chatkarte entsprechen einem direkt aus dem Statblock ausgelösten Wurf.
- Der richtige Token wird als Sprecher verwendet.

---

## Etappe 6 – Reaktionsübersicht

**Status:** `[ ]`

### Ziel

Bei Spielerzügen und zwischen Spieleraktionen schnell erkennen, welche Gegner reagieren können.

### Umfang

- Reaktionsaktivitäten aus D&D5e-Items erkennen
- Gegner nach Reaktionen gruppieren
- Kurzbeschreibung und vollständige Beschreibung zugänglich machen
- Status „verfügbar“ und „verwendet“
- Status manuell umschalten
- vorhandene `reaction-tracker`-Flags migrieren oder kompatibel lesen
- besiegte Gegner ausblenden oder klar kennzeichnen
- Start-of-Turn-Effekte erkennen
- Aura- und Flächeneffekte kennzeichnen
- Reaktionsbereich im Dashboard bei Spielerzügen hervorheben
- Reaktion direkt ausführen, wenn eine eindeutige D&D5e-Aktivität vorhanden ist

### Entscheidungsbedarf vor Beginn

- Sollen verwendete Reaktionen vollständig ausgeblendet oder durchgestrichen angezeigt werden?
- Soll eine ausgeführte Reaktionsaktivität automatisch als verwendet gelten?
- Sollen Reaktionen von versteckten Gegnern besonders gekennzeichnet werden?

### Foundry-Test

- NPC ohne Reaktion
- NPC mit einer und mehreren Reaktionen
- mehrere identische NPCs
- manuelles Markieren
- Reaktion direkt ausführen
- Spielerzug, Gegnerzug und Rundenwechsel
- bestehende Flags aus den bisherigen Makros

### Abnahme

- Übersicht zeigt nur tatsächlich relevante Gegner.
- Der Status überlebt Dashboard-Neurendering und Browser-Neuladen.
- Eine Reaktion wird niemals allein aufgrund ihres Namens falsch ausgeführt.

---

## Etappe 7 – Reaktions-Reset

**Status:** `[ ]`

### Ziel

Verwendete Reaktionen entsprechend ihrer tatsächlichen Regel automatisch zurücksetzen.

### Umfang

- per-round- und per-turn-Verhalten getrennt behandeln
- bestehende Makroerkennung für „per turn“ übernehmen und härten
- Reset bei korrektem Combat-Ereignis auslösen
- manuell überschriebene Zustände nachvollziehbar behandeln
- Reset im Dashboard sichtbar machen
- doppelten Reset verhindern

### Foundry-Test

- normale Reaktion einmal pro Runde
- ausdrücklich „per turn“ verfügbare Reaktion
- Rundenwechsel
- Rückwärtswechsel im Combat Tracker
- manuelles Ändern der Runde
- Combat pausieren, neu laden und fortsetzen

### Abnahme

- Normale Reaktionen werden nicht zu früh zurückgesetzt.
- Per-turn-Reaktionen werden genau zum vorgesehenen Zeitpunkt zurückgesetzt.
- Reload erzeugt keine zusätzliche oder verlorene Rücksetzung.

---

## Etappe 8 – Legendary Actions und Ressourcen

**Status:** `[ ]`

### Ziel

Bei Spielerzügen verfügbare Legendary Actions und verbleibende Ressourcen schnell anzeigen und ausführen.

### Umfang

- Legendary-Action-Ressource des Actors lesen
- aktuelles und maximales Budget anzeigen
- Legendary-Action-Aktivitäten erkennen
- Kosten je Aktivität anzeigen
- Aktivität über native D&D5e-API ausführen
- Budget nach bestätigter Verwendung aktualisieren
- unzureichendes Budget anzeigen
- Reset zum korrekten Zeitpunkt
- In-Lair-Werte berücksichtigen
- bei Spielerzügen hervorheben

### Sicherheitsregel

Ressourcen werden erst verändert, wenn die Aktivität tatsächlich verwendet wurde. Abgebrochene Dialoge dürfen keine Kosten verbrauchen.

### Foundry-Test

- Monster ohne Legendary Actions
- Budget 1, 2, 3 und In-Lair-Bonus
- Aktion mit verschiedenen Kosten
- abgebrochene Verwendung
- mehrere legendäre Monster
- Rundenwechsel und Combat-Neuladen
- Aktion aus Statblock und Aktion aus Dashboard

### Abnahme

- Angezeigte Ressourcen entsprechen dem Statblock.
- Kosten werden genau einmal verbraucht.
- Reset entspricht den D&D5e-Regeln und Foundry-Daten.

---

## Etappe 9 – Legendary Follow-up Attacks

**Status:** `[ ]`

### Ziel

Nach einer Legendary Action einen ausdrücklich referenzierten Folgeangriff direkt anbieten.

### Umfang

- bisherigen `dnd5e.postUseActivity`-Ansatz übernehmen
- Beschreibung der verwendeten Legendary Action auswerten
- Angriffsaktivitäten desselben Actors abgleichen
- nur eindeutige oder bewusst auswählbare Treffer anbieten
- Follow-up im Dashboard statt ausschließlich als zusätzliche Chatkarte anzeigen
- optional weiterhin GM-Chatkarte erzeugen
- native D&D5e-/RSReforged-Verwendung beibehalten

### Foundry-Test

- eindeutiger referenzierter Angriff
- mehrere mögliche Angriffe
- kein referenzierter Angriff
- lokalisierte und formatierte Beschreibung
- Item-Name und Activity-Name unterscheiden sich
- Folgeangriff abbrechen

### Abnahme

- Das Modul führt niemals selbstständig einen geratenen Angriff aus.
- Eindeutige Folgeangriffe sind mit einem Klick erreichbar.
- Uneindeutige Fälle werden als Auswahl oder gar nicht angeboten.

---

## Etappe 10 – Hidden Enemy Movement Tracker

**Status:** `[ ]`

### Ziel

Die Bewegung des aktiven verborgenen Gegners für die vorgesehene Ansicht sichtbar machen, ohne dessen Token oder Position ungewollt offenzulegen.

### Umfang

- nur Bewegung des aktiven NPCs verfolgen
- standardmäßig nur verborgene NPC-Tokens
- mehrere Bewegungen zu einem Pfad verbinden
- Zielposition zeitlich begrenzt blinken lassen
- Pfad beim nächsten Combatant entfernen
- Pfad bei Combat-Ende, Szenenwechsel und Deaktivierung entfernen
- schnelle Bewegungsupdates in richtiger Reihenfolge verarbeiten
- Farbe, Breite, Deckkraft und Blinkdauer konfigurierbar machen
- Kamera nicht verschieben
- Sichtbarkeit und Empfängerkreis explizit definieren

### Kritische Designentscheidung vor Beginn

Es muss festgelegt werden, wer den Pfad sehen soll:

- nur der aktive GM-Client,
- alle aktiven GMs,
- ein bestimmter Display-/TV-Benutzer,
- oder Spieler, ohne den Token selbst sichtbar zu machen.

Diese Entscheidung beeinflusst die technische Umsetzung erheblich und wird nicht stillschweigend angenommen.

### Foundry-Test

- eine und mehrere Bewegungen
- Diagonalbewegung
- sehr schnelle Bewegungsupdates
- sichtbarer Gegner
- versteckter Gegner außerhalb seines Zuges
- Zugwechsel während des Blinkens
- Combat-Ende
- Szenenwechsel
- Browser-Neuladen
- zwei gleichzeitig aktive GM-Clients
- vorgesehener TV-/Spieler-Client

### Abnahme

- Keine Position wird einem nicht vorgesehenen Benutzer gezeigt.
- Der Pfad entspricht der tatsächlich durchgeführten Bewegung.
- Es bleiben keine Zeichnungen oder Timer zurück.
- Die Kamera wird nicht bewegt.

---

## Etappe 11 – Encounter vorbereiten und W12-Initiative

**Status:** `[ ]`

### Ziel

Die vorhandene Encounter-Vorbereitung in das Modul integrieren und konfigurierbar machen.

### Umfang

- Encounter der aktuellen Szene erstellen oder aktivieren
- ausgewählte NPC-Tokens hinzufügen
- NPC-Initiative mit `1d12 + Initiative-Modifikator`
- keine unnötigen Chatnachrichten
- Spieler-Placeholders konfigurierbar machen
- vorhandene Monk's-Combat-Details-Placeholders erkennen
- ohne Monk's Combat Details eigene Placeholder-Daten verwenden
- bestehende Initiativewerte erhalten
- In-Lair-Kandidaten erkennen
- In-Lair-Status bewusst abfragen und speichern
- doppelte Combatants vermeiden

### Entscheidungsbedarf vor Beginn

- Spielerfiguren dauerhaft in Moduleinstellungen verwalten oder pro Welt konfigurieren?
- Sollen die bisherigen fünf Namen als Migrationsvorschlag übernommen werden?
- Soll W12-Initiative ausschließlich über diese Funktion oder optional als allgemeine Initiativeformel gelten?

### Foundry-Test

- kein Encounter vorhanden
- bestehender Encounter
- fehlende und vorhandene Spielerinitiative
- ein und mehrere ausgewählte NPCs
- NPC bereits im Encounter
- verknüpfte und unverknüpfte Tokens
- Monster mit und ohne Lair-/Legendary-Daten
- mit und ohne Monk's Combat Details

### Abnahme

- Kein Combatant wird doppelt angelegt.
- Vorhandene Initiative bleibt erhalten.
- Nur fehlende NPC-Initiativen werden gewürfelt.
- Lair-Status wird nur nach bewusster Bestätigung geändert.

---

## Etappe 12 – Optionale RSReforged-Integration

**Status:** `[ ]`

### Ziel

Die vorhandenen RSReforged-Komfortfunktionen integrieren, ohne RSReforged zur Pflicht zu machen.

### Umfang

- RSReforged zur Laufzeit sicher erkennen
- Damage Breakdown automatisch aufklappen
- Legendary Follow-up über den normalen RSReforged-Ablauf ausführen
- Dashboard-Rettungswürfe und Statblock-Angriffe mit RSReforged prüfen
- Integrationscode vollständig vom Kernmodul trennen
- verständliche Diagnose bei inkompatibler Version

### Foundry-Test

- RSReforged deaktiviert
- RSReforged aktiviert
- Schadenswurf
- Angriff plus separater Schaden
- Rettungswurf
- Legendary Follow-up
- Modul während verschiedener Chatkarten neu laden

### Abnahme

- Ohne RSReforged treten keine Fehler auf.
- Mit RSReforged bleibt der gewohnte Würfelablauf erhalten.
- Schadensdetails öffnen sich zuverlässig.

---

## Etappe 13 – Gesamtintegration, Stabilität und Bedienung

**Status:** `[ ]`

### Ziel

Alle zuvor einzeln abgenommenen Funktionen gemeinsam testen und die Oberfläche für längere Kämpfe stabilisieren.

### Umfang

- vollständigen Encounter-Ablauf testen
- Performance bei vielen Gegnern prüfen
- Hook- und Listener-Aufräumen kontrollieren
- Fensterzustand nach Reload prüfen
- Tastaturbedienung und Tooltips verbessern
- Fehler- und Warnmeldungen vereinheitlichen
- GM-only-Berechtigungen prüfen
- Migrationspfad von den bisherigen Makros dokumentieren
- Konflikte durch paralleles Aktivieren alter Makros erkennen oder dokumentieren

### Langzeittest

Ein kompletter Testkampf mit:

- mindestens fünf Spieler-Placeholders,
- mindestens zehn Gegnern,
- einem versteckten Gegner,
- einem legendären Gegner,
- Reaktionen,
- mehreren Runden,
- Heilung, Schaden und Rettungswürfen,
- Szenen- oder Browser-Reload.

### Abnahme

- Keine doppelten Fenster, Hooks oder Chatkarten.
- Keine zurückbleibenden Zeichnungen oder Timer.
- Keine verlorenen Reaktions- oder Ressourcenstände.
- Dashboard bleibt reaktionsfähig.
- Alle Kernfunktionen funktionieren ohne optionale Module.

---

## Etappe 14 – Erstes installierbares Release

**Status:** `[ ]`

### Ziel

Eine installierbare und dokumentierte Version veröffentlichen.

### Umfang

- Versionsnummer festlegen
- `CHANGELOG.md` abschließen
- README mit Installation und Bedienung ergänzen
- Modulmanifest mit endgültigen GitHub-URLs aktualisieren
- signiertes oder nachvollziehbar erzeugtes ZIP bereitstellen
- GitHub Release erstellen
- Manifest- und Download-URL testen
- Upgrade-Test von der Entwicklungsfassung

### Abnahme

- Installation über die Manifest-URL funktioniert.
- Neuinstallation über das Release-ZIP funktioniert.
- Modul startet nach Welt-Neuladen.
- Dokumentierte Mindestversionen stimmen.
- Release enthält keine Entwicklungs- oder temporären Dateien.

---

## Später / Backlog

Diese Punkte sind ausdrücklich nicht Teil der ersten stabilen Version, sofern sie nicht vorab einer Etappe zugeordnet werden:

- eigene kompakte Aktionsliste als Ersatzansicht für Teile des Statblocks
- Lair-Action-Timeline
- automatische Triggerauswertung aus natürlicher Sprache
- Reichweiten- und Zielprüfung für Reaktionen
- Synchronisierung eines separaten TV-/Combat-Wall-Clients
- Sound- oder Animationseffekte
- Import/Export von Moduleinstellungen
- Unterstützung weiterer Spielsysteme
- Unterstützung älterer Foundry- oder D&D5e-Versionen

## Änderungsprotokoll der Roadmap

| Datum | Änderung | Entscheidung |
|---|---|---|
| 2026-08-01 | Etappe 1 in Foundry 14.360 / D&D5e 5.3.2 geprüft | Freigegeben |
| 2026-07-30 | Etappe 1 implementiert | Wartet auf Foundry-Abnahme |
| 2026-07-30 | Etappe 0 abgenommen | Freigegeben |
| 2026-07-30 | Etappe 0 implementiert | Wartet auf Foundry-Abnahme |
| 2026-07-29 | Erste Roadmap erstellt | Noch nicht abgenommen |
