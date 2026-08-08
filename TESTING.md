# Manual test checklist

## Compact reaction and dashboard design – Version 0.8.8

- [ ] Im linken Kopf steht exakt **Version 0.8.8**.
- [ ] Der Dashboard-Kopf zeigt nur **Runde X**, den aktuellen Zug, Gegneranzahl, Verbindung und Menü.
- [ ] Der Name des aktiven Teilnehmers ist deutlich größer und nutzt den verfügbaren Platz.
- [ ] In den Gegnerzeilen erscheinen weder `sichtbar` noch `auf Szene`.
- [ ] Ein versteckter Gegner erhält im Statusbereich hinter seinem Namen ein Augensymbol; sichtbare Gegner erhalten dort kein Symbol.
- [ ] STR, DEX, CON, INT, WIS und CHA sowie die Modifikatoren füllen ihre normalen Rettungswurfbuttons besser aus.
- [ ] Normalwurf, Vorteil und Nachteil funktionieren weiterhin bei allen sechs Rettungswürfen.
- [ ] Im Reaktionskopf erscheint keine zusätzliche Angabe zum aktuellen Gegner- oder Spielerzug.
- [ ] Reaktionszeilen enthalten weder Sichtbarkeits- noch Szenenangaben und keine dauerhaft sichtbaren Beschreibungen.
- [ ] Jeder geeignete Gegner besitzt einen Button **Gelegenheitsangriff**.
- [ ] Beim Stone Giant stehen **Deflect Missile** und **Gelegenheitsangriff** gleichzeitig als getrennte Buttons bereit.
- [ ] Ein Klick auf **Deflect Missile** führt ausschließlich diese Reaktion aus.
- [ ] Ein Klick auf **Gelegenheitsangriff** führt bei genau einem Angriff direkt aus und öffnet bei mehreren Angriffen die Auswahl.
- [ ] Beim Überfahren jedes Reaktionsbuttons erscheint dessen Beschreibung beziehungsweise verwendeter Angriff.
- [ ] Verwendete Reaktionen bleiben erkennbar und können weiterhin manuell korrigiert werden.
- [ ] Über Würfelergebnissen steht nicht mehr `Protokoll`; über der Minimap steht nicht mehr `Gesamte Szene`.
- [ ] In beiden Fenstern erscheinen keine roten Fehler von `gm-combat-workspace`.

## Optimized design checkpoint – Version 0.8.7

- [ ] Im Workspace-Kopf steht exakt **Version 0.8.7**.
- [ ] Es gibt keine ungenutzte globale Kopfzeile mehr; Modultitel und Version stehen nur über dem linken Statblock.
- [ ] Die rechte Spalte beginnt am oberen Bildschirmrand und endet am unteren Bildschirmrand.
- [ ] Encounter, aktueller Zug, Gegneranzahl, **Verbunden** und das Drei-Punkte-Menü stehen in einem gemeinsamen Dashboard-Kopf.
- [ ] Zehn lebende Gegner passen ohne Scrollbalken gleichzeitig in die obere Liste; erst weitere Gegner lassen die Liste scrollen.
- [ ] Bei jedem Gegner sind Normalwurf, **V** und **N** für STR, DEX, CON, INT, WIS und CHA dauerhaft sichtbar.
- [ ] Der normale Rettungswurf ist exakt so hoch wie die beiden übereinanderliegenden V/N-Schaltflächen zusammen.
- [ ] Normale Rettungswürfe sowie Würfe mit Vorteil und Nachteil funktionieren weiterhin ohne Dialog.
- [ ] Der untere Bereich zeigt links Reaktionen über die gesamte Höhe.
- [ ] Rechts stehen Würfelergebnisse oben und die deutlich größere Minimap unten.
- [ ] Der reservierte Minimap-Ausschnitt besitzt ein sichtbares 16:9-Seitenverhältnis.
- [ ] Zehn normale Gelegenheitsangriffe passen ohne abgeschnittene letzte Zeile in die Reaktionsliste.
- [ ] Gegner mit mehreren oder ausführlichen Reaktionen können innerhalb der Reaktionsliste scrollen.
- [ ] TP-Eingabe, Mehrfachaktionen, Statblock, Anpinnen und Diagnose funktionieren unverändert.
- [ ] In beiden Fenstern erscheinen keine roten Fehler von `gm-combat-workspace`.

## Design checkpoint – Version 0.8.6

- [ ] Im Workspace-Kopf steht exakt **Version 0.8.6**.
- [ ] Die linke Spalte gehört über die gesamte verfügbare Höhe dem Statblock.
- [ ] Die rechte Spalte ist sichtbar in eine obere und eine untere Hälfte gegliedert.
- [ ] Zehn lebende Gegner passen gleichzeitig in die obere Hälfte; ab dem elften Gegner scrollt nur die Liste.
- [ ] Name, Zug-/Auswahlstatus, RK, TP und sechs normale Rettungswürfe bleiben in jeder Zeile bündig.
- [ ] Ein normaler Rettungswurf würfelt weiterhin sofort; beim Überfahren oder Tastaturfokus erscheinen die kleinen Schaltflächen für Vorteil und Nachteil.
- [ ] Die Mehrfach-TP-Werkzeuge sind ohne Auswahl verborgen und erscheinen nach Auswahl mindestens eines Gegners.
- [ ] Reaktionen, Gelegenheitsangriffe, Auren und Zughinweise funktionieren in der unteren linken Hälfte weiter.
- [ ] Die Felder **Würfelergebnisse** und **Minimap** sind als reserviert erkennbar und besitzen noch keine anklickbare Scheinfunktion.
- [ ] Die Diagnose ist nicht dauerhaft sichtbar und lässt sich über das Drei-Punkte-Menü im Kopf öffnen.
- [ ] Statblock, Gegnerdashboard und Reaktionen besitzen jeweils einen eigenen Scrollbereich; die gesamte Workspace-Seite scrollt nicht.
- [ ] In beiden Fenstern erscheinen keine roten Fehler von `gm-combat-workspace`.

## Stage 6 inline roll bugfix – Version 0.8.5

- [ ] Im Workspace-Kopf steht exakt **Version 0.8.5**.
- [ ] Beim Klick auf Death Gazes `3d10 psychic` erscheint kein Fehler mit `target.closest()`.
- [ ] Der Klick erzeugt ohne Abfragedialog genau einen nativen D&D5e-Schadenswurf.
- [ ] Der Schadenswert und Schadensart entsprechen der Death-Gaze-Aktivität.
- [ ] Der Namensklick auf Death Gaze und der inline Save-Ausdruck funktionieren weiterhin.
- [ ] Inline-Schaden anderer Fähigkeiten, insbesondere Fire Breath, funktioniert ebenfalls ohne `target.closest()`-Fehler.
- [ ] Der Statblock bleibt nach allen Ausführungen sichtbar.
- [ ] Es erscheinen weiterhin keine zusätzlichen Aktivitätsschaltflächen.
- [ ] In beiden Fenstern erscheinen keine roten Fehler von `gm-combat-workspace`.

## Stage 6 inline activity design bugfix – Version 0.8.4

- [ ] Im Workspace-Kopf steht exakt **Version 0.8.4**.
- [ ] Unter Death Gaze, Sunlight Hypersensitivity und anderen Eigenschaften erscheinen keine separaten Aktivitätsschaltflächen mehr.
- [ ] Ein Klick auf den Namen `Death Gaze` erzeugt weiterhin genau eine native Save-Chatkarte.
- [ ] Der Schadensausdruck `3d10 psychic` im Death-Gaze-Text ist anklickbar.
- [ ] Ein Klick darauf würfelt ohne Abfragedialog genau einmal den hinterlegten Schaden.
- [ ] Der Save-Ausdruck im Death-Gaze-Text ist anklickbar und erzeugt genau eine Save-Chatkarte.
- [ ] Bei Fire Breath ist der inline dargestellte Feuerschaden anklickbar und verwendet die richtige Damage-Auswertung.
- [ ] Der Statblock bleibt nach jedem Klick sichtbar und nimmt keinen zusätzlichen vertikalen Platz für Steuerflächen ein.
- [ ] Die bereits bereinigten Foundry- und Quellenreste bleiben verschwunden.
- [ ] Bestehende Angriffe, Reaktionen, legendäre Aktionen und Zughinweise funktionieren weiterhin.
- [ ] In beiden Fenstern erscheinen keine roten Fehler von `gm-combat-workspace`.

## Stage 6 statblock activity bugfix – Version 0.8.3

- [ ] Im Workspace-Kopf steht exakt **Version 0.8.3**.
- [ ] Beim Bodak startet ein Klick auf `Death Gaze` dessen erste ausführbare Save-Aktivität und erzeugt eine Chatkarte.
- [ ] Unter Death Gaze erscheinen kompakte Links für `Rettungswurf` und `Schaden würfeln`.
- [ ] `Rettungswurf` erzeugt genau eine native D&D5e-Auswertung beziehungsweise Chatkarte.
- [ ] `Schaden würfeln` würfelt ohne Abfragedialog genau einmal den hinterlegten Schaden.
- [ ] Der Statblock bleibt nach beiden Ausführungen sichtbar.
- [ ] Bei Fire Breath steht lesbar `Cone`; der Rest `[Area of Effect|XPHB]Cone` ist verschwunden.
- [ ] Im Statblock sind keine weiteren rohen Save-, Check-, Damage-, Status-, Reference-, Spell- oder VariantRule-Befehle sichtbar.
- [ ] Death Gaze und Aura of Annihilation erzeugen weiterhin die richtigen Zughinweise.
- [ ] Command und Detect Magic erzeugen weiterhin keine falschen Zughinweise.
- [ ] Vorhandene Angriffe, Reaktionen und legendäre Aktionen funktionieren weiterhin genau einmal.
- [ ] In beiden Fenstern erscheinen keine roten Fehler von `gm-combat-workspace`.

## Stage 6 statblock and reminder bugfix – Version 0.8.2

- [ ] Im Workspace-Kopf steht exakt **Version 0.8.2**.
- [ ] Beim Bodak erscheint `Death Gaze` im Statblock unter den passiven Eigenschaften.
- [ ] `Death Gaze` erscheint dort genau einmal und bleibt über seinen Namen ausführbar.
- [ ] Während eines Spielerzugs erscheint für `Death Gaze` die Warnung `Zu Beginn des Zuges prüfen`.
- [ ] `Aura of Annihilation` erscheint weiterhin als `Am Ende des Zuges prüfen`.
- [ ] Der Adult Red Dragon erzeugt weder für `Command` noch für `Detect Magic` eine Aura- oder Zugwarnung.
- [ ] In Death Gaze steht kein rohes `[[/save ...]]`, `&Reference[...]` oder `@status[...]` mehr.
- [ ] Der Rettungswurf und der Schadenswurf von Death Gaze bleiben anklickbar und erzeugen jeweils genau eine native D&D5e-Auswertung.
- [ ] Bereits sichtbare Aktionen, Bonusaktionen, Reaktionen sowie legendäre Aktionen werden nicht doppelt dargestellt.
- [ ] Normale Statblock-Angriffe, Reaktionen, HP, Rettungswürfe und Tokenauswahl funktionieren weiterhin.
- [ ] In beiden Fenstern erscheinen keine roten Fehler von `gm-combat-workspace`.

## Stage 6 bugfix – Version 0.8.1

- [ ] Im Workspace-Kopf steht exakt **Version 0.8.1**.
- [ ] Ein Spieler mit Actor löst die blaue Hervorhebung des Reaktionsbereichs aus.
- [ ] Ein actorloser Spieler-Platzhalter löst dieselbe blaue Hervorhebung aus.
- [ ] Bei einem Gegnerzug steht `Gegnerzug: Name`; der Bereich bleibt normal lesbar und wird nicht ausgegraut.
- [ ] `Angreifen` erzeugt keinen Fehler mit `Cannot read properties of null (reading 'closest')`.
- [ ] Der gewählte Gelegenheitsangriff wird genau einmal gewürfelt und markiert die Reaktion anschließend als verwendet.
- [ ] Ein Bodak mit `Aura of Annihilation` erzeugt während des Spielerzugs eine Warnung `Am Ende des Zuges prüfen`.
- [ ] Eine Aura mit Start-of-Turn-Text erzeugt stattdessen `Zu Beginn des Zuges prüfen`.
- [ ] Reaktionsstatus, direkte Reaktionen, Statblock, Karte, HP und Rettungswürfe funktionieren weiterhin.

## Stage 6 – Version 0.8.0

- [ ] Im Workspace-Kopf steht exakt **Version 0.8.0**.
- [ ] Unterhalb der Gegnerübersicht erscheint der Bereich **Reaktionen**.
- [ ] Während eines Spielerzuges wird der Reaktionsbereich blau hervorgehoben und nennt den aktiven Spieler.
- [ ] Während eines Gegnerzuges bleibt der Bereich sichtbar, ist aber nicht hervorgehoben.
- [ ] Ein NPC ohne ausdrücklich hinterlegte Reaktion besitzt trotzdem den Eintrag **Gelegenheitsangriff · Basisreaktion**.
- [ ] Ein NPC mit einer D&D5e-Reaktionsaktivität zeigt Name, Auslöser, Kurztext und aufklappbare vollständige Beschreibung.
- [ ] Bei mehreren Reaktionsaktivitäten werden alle angezeigt, aber nur ein gemeinsamer Status pro Gegner geführt.
- [ ] Ein versteckter Gegner bleibt sichtbar und trägt ein durchgestrichenes Augensymbol mit dem Text `versteckt`.
- [ ] Ein besiegter Gegner verschwindet aus Gegner- und Reaktionsübersicht.
- [ ] `Verfügbar` lässt sich manuell zu `Verwendet` umschalten und wieder zurücksetzen.
- [ ] Eine verwendete Reaktion bleibt sichtbar, ist aber abgedunkelt und durchgestrichen.
- [ ] Der Status bleibt nach Dashboard-Neurendering sowie Strg+F5 auf beiden Fenstern erhalten.
- [ ] Eine eindeutig erkannte Reaktionsaktivität lässt sich mit **Ausführen** direkt verwenden.
- [ ] Nach erfolgreicher Ausführung wechselt der Gegner automatisch zu `Verwendet`.
- [ ] Eine abgebrochene oder wegen fehlender Ressource abgewiesene Aktivität bleibt `Verfügbar`.
- [ ] Bei genau einem geeigneten Nahkampfangriff führt **Angreifen** genau diesen Angriff aus.
- [ ] Bei mehreren Nahkampfangriffen öffnet **Angriff wählen** eine kompakte Liste und der gewählte Angriff wird genau einmal ausgeführt.
- [ ] Ohne erkannten Nahkampfangriff öffnet die Gelegenheitsangriff-Zeile nur den Statblock und würfelt nichts.
- [ ] Ein erfolgreicher Gelegenheitsangriff markiert die Reaktion automatisch als verwendet.
- [ ] Ein vorhandener alter `reaction-tracker`-Status wird korrekt angezeigt, auch wenn das Fremdmodul deaktiviert ist.
- [ ] Bei einem passenden Start-of-Turn-Aura- oder Flächeneffekt erscheint während des Spielerzuges eine rote Warnzeile.
- [ ] Statblock, Karte, Kamera, Tokenauswahl, HP, Mehrfachaktionen und Rettungswürfe funktionieren weiterhin.
- [ ] Es entstehen keine doppelten Würfe oder Chatkarten und keine roten Modulfehler in einem der beiden Fenster.

## Stage 5 design bugfix – Version 0.7.2

- [ ] Im Workspace-Kopf steht exakt **Version 0.7.2**.
- [ ] Die obere Anzeige „Aktueller Zug“ ist bei einem NPC neutral dunkel und nicht golden.
- [ ] Nur die Zeile des aktiven NPCs ist golden hervorgehoben.
- [ ] Der separate Bereich „Statblock-Steuerung“ ist vollständig entfernt.
- [ ] `Anpinnen` steht kompakt im Statblock-Kopf neben der Auswahlquelle.
- [ ] Nach dem Anpinnen steht dort `Anheften lösen`.
- [ ] Ein angepinnter Gegner bleibt bei Zug- und Tokenwechsel sichtbar.
- [ ] Nach dem Lösen greift wieder die normale Auswahlpriorität.
- [ ] Die Diagnose folgt direkt unterhalb der Gegnerübersicht.


## Stage 5 layout bugfix – Version 0.7.1

- [ ] Im Workspace-Kopf steht exakt **Version 0.7.1**.
- [ ] `Am Zug` und `Ausgewählt` stehen zwischen Gegnername und RK.
- [ ] Eine Zeile ohne Status reserviert denselben Platz wie eine Zeile mit Status.
- [ ] Ein Gegner kann gleichzeitig `Am Zug` und `Ausgewählt` anzeigen, ohne eine Spalte zu verschieben.
- [ ] Namen, RK, TP und alle sechs Rettungswürfe sind bei sämtlichen Gegnern exakt untereinander ausgerichtet.
- [ ] Jeder normale Rettungswurfknopf ist so hoch wie `V` und `N` gemeinsam.
- [ ] Klick in ein TP-Feld markiert sofort die vollständige vorhandene Zahl.
- [ ] Nach dem Klick ersetzt `-20`, `+10` oder `50` die vorherige Zahl vollständig.
- [ ] Fokus per Tabulator markiert ebenfalls die vollständige Zahl.
- [ ] Enter führt die TP-Eingabe weiterhin korrekt aus.
- [ ] Normale Rettungswürfe, Vorteil und Nachteil funktionieren weiterhin ohne Dialog.


## Stage 5 – Version 0.7.0

- [ ] Im Workspace-Kopf steht exakt **Version 0.7.0**.
- [ ] STR, DEX, CON, INT, WIS und CHA stimmen bei mehreren Gegnern mit dem Statblock überein.
- [ ] Klick auf den großen Modifikator würfelt ohne Abfrage genau einen W20.
- [ ] Klick auf `V` würfelt ohne Abfrage mit Vorteil und verwendet das höhere Ergebnis.
- [ ] Klick auf `N` würfelt ohne Abfrage mit Nachteil und verwendet das niedrigere Ergebnis.
- [ ] Jeder Klick erzeugt genau eine Rettungswurf-Auswertung im Chat.
- [ ] Chatkarte und Sprecher gehören zum richtigen Gegner beziehungsweise Token.
- [ ] Negative, neutrale und positive Modifikatoren werden korrekt angezeigt und verrechnet.
- [ ] Rettungswürfe funktionieren bei sichtbaren und versteckten Gegnern.
- [ ] Der Statblock bleibt nach jedem Wurf sichtbar und bedienbar.
- [ ] Karte, Kamera und Tokenauswahl bleiben unverändert.
- [ ] HP-Eingaben, Mehrfachaktionen, Hover, Farbrand und Zuganzeige funktionieren weiterhin.
- [ ] Es erscheinen weder im Hauptfenster noch im Workspace rote Modulfehler.


## Stage 4 – Version 0.6.0

- [ ] Bei jedem Gegner stimmen RK sowie aktuelle/maximale TP mit dem Statblock überein.
- [ ] `50` plus Enter setzt die aktuellen TP auf 50.
- [ ] `-20` plus Enter verursacht genau 20 Schaden.
- [ ] `+10` plus Enter heilt genau 10 TP und niemals über das Maximum.
- [ ] Ein ungültiger Wert verändert keine TP und zeigt eine Warnung.
- [ ] Bei vorhandenen temporären TP verbraucht Schaden zuerst diese; temporäre TP erscheinen nicht im Dashboard.
- [ ] Mehrere Checkboxen auswählen und **Schaden**, **½ Schaden** sowie **Heilen** testen.
- [ ] Halber Schaden rundet bei einer ungeraden Zahl ab (9 wird 4).
- [ ] Die Mehrfachaktion wird ohne Bestätigungsdialog ausgeführt.
- [ ] Zwei verknüpfte Tokens desselben World-Actors verändern diesen Actor nur einmal.
- [ ] Zwei unverknüpfte Tokens desselben Basis-Actors werden unabhängig verändert.
- [ ] Bei TP 0 verschwindet der besiegte Gegner aus der Liste.
- [ ] Statblock-, Tokenauswahl-, Hover- und Zugmarkierung funktionieren weiterhin.


## Stage 0 – Development and test foundation

Test this pull request in a disposable or backed-up Foundry VTT world.

Record the result of each item as:

- PASS
- FAIL, with the exact step and observed behavior
- NOT TESTED, with the reason

### A. Installation

- [ ] Open the Stage 0 pull request and its successful **Validate module** workflow.
- [ ] Download the `gm-combat-workspace-test-build` artifact from the workflow run.
- [ ] Extract the artifact wrapper and locate `gm-combat-workspace.zip`.
- [ ] Confirm that the ZIP contains one top-level folder named `gm-combat-workspace`.
- [ ] Copy or extract that folder into Foundry's `Data/modules` directory.
- [ ] Start Foundry VTT 14.
- [ ] Confirm that **GM Combat Workspace** appears under **Manage Modules**.
- [ ] Confirm that Foundry does not report an incompatible core version.
- [ ] Confirm that the module lists D&D5e 5.3+ as its required game system.
- [ ] Confirm that RSReforged is not shown as a required module.
- [ ] Confirm that Monk's Combat Details is not shown as a required module.

### B. Clean startup without optional modules

- [ ] Disable RSReforged.
- [ ] Disable Monk's Combat Details.
- [ ] Activate GM Combat Workspace.
- [ ] Reload the world.
- [ ] Confirm that no error notification appears.
- [ ] Open the browser console with F12.
- [ ] Confirm that there is no red error from `gm-combat-workspace`.
- [ ] Confirm that no normal startup notification appears.

### C. Module settings

- [ ] Open **Configure Settings → Module Settings**.
- [ ] Find the **GM Combat Workspace** section.
- [ ] Confirm that all setting names and descriptions are readable.
- [ ] Confirm that **Development mode** is off by default.
- [ ] Confirm that **Open statblock on an enemy turn** is on by default.
- [ ] Confirm that **Close the previous enemy statblock** is on by default.
- [ ] Confirm that **Select the active enemy** is on by default.
- [ ] Confirm that **Pan to the active enemy** is off by default.
- [ ] Confirm that **Track hidden movement** is on by default.
- [ ] Change at least two settings, save, and reload the world.
- [ ] Confirm that the changed values were retained.

### D. Development logging

- [ ] Enable **Development mode** and save.
- [ ] Reload the world.
- [ ] Open the browser console with F12.
- [ ] Confirm that exactly one `gm-combat-workspace | Ready` message appears.
- [ ] Confirm that the message contains the Foundry and D&D5e versions.
- [ ] Disable **Development mode** and reload.
- [ ] Confirm that the Ready debug message no longer appears.

### E. Startup with optional modules

- [ ] Enable RSReforged, if installed.
- [ ] Reload the world and confirm that no module error appears.
- [ ] Enable Monk's Combat Details, if installed.
- [ ] Reload the world and confirm that no module error appears.
- [ ] If either module is not installed, mark its check as NOT TESTED.

### F. Final result

- [ ] All applicable checks pass.
- [ ] Any failed check includes a screenshot and the relevant F12 console message.
- [ ] Foundry version is recorded.
- [ ] D&D5e system version is recorded.
- [ ] RSReforged version is recorded, if tested.
- [ ] Monk's Combat Details version is recorded, if tested.

Do not approve Stage 0 if the module fails to load, produces a console error, requires an optional module, or cannot retain its settings.

---

## Stage 1 – Central Combat Coordinator

Enable **Development mode** before running these checks. Keep the browser console open and filter for `gm-combat-workspace`.

For each user action, count only the named coordinator events. Foundry may print unrelated messages from other modules.

### A. Startup and empty state

- [ ] Reload a scene without an active or started encounter.
- [ ] Confirm that exactly one `gm-combat-workspace | Ready` entry is visible under the default console levels.
- [ ] Confirm that no coordinator error appears.
- [ ] Confirm that no false `combatStarted`, `turnChanged`, or `activeCombatantChanged` entry appears.

### B. Start and normal turn order

- [ ] Create or open an encounter on the visible scene.
- [ ] Start the encounter.
- [ ] Confirm exactly one `combatStarted` entry.
- [ ] Confirm exactly one `activeCombatantChanged` entry for the first participant.
- [ ] Advance to the next participant.
- [ ] Confirm exactly one `turnChanged` entry.
- [ ] Confirm exactly one `activeCombatantChanged` entry.
- [ ] Advance through the end of the round.
- [ ] Confirm exactly one `roundChanged`, one `turnChanged`, and one `activeCombatantChanged` entry.
- [ ] Move backward to the previous participant and confirm the same events occur only once.

### C. Resolved participant information

- [ ] Activate an NPC participant and expand the logged event object.
- [ ] Confirm `combatantType` is `npc`.
- [ ] Confirm `actorId` and `tokenId` contain values.
- [ ] Activate a player character and confirm `combatantType` is `player`.
- [ ] Activate a player placeholder without an Actor and confirm `combatantType` is `placeholder`.
- [ ] Activate a hidden NPC and confirm `hidden` is `true`.
- [ ] If the same NPC Actor has multiple combatants, confirm the active entry reports the correct token ID.

### D. Combatant changes

- [ ] Add a participant during the encounter and confirm no false `turnChanged` event.
- [ ] Change a non-active participant's initiative and confirm no false `turnChanged` event.
- [ ] Remove a non-active participant and confirm no false `turnChanged` event.
- [ ] Remove the active participant and confirm the resulting active-combatant change appears once.

### E. Scene and encounter lifecycle

- [ ] Switch to a scene without an encounter and confirm the previous encounter does not continue producing events.
- [ ] Return to the encounter scene and confirm the current state is recognized once.
- [ ] End or delete the started encounter and confirm exactly one `combatEnded` entry.
- [ ] Reload the browser and confirm the coordinator does not duplicate later events.

### F. Final result

- [ ] No user action produces duplicate coordinator events.
- [ ] No placeholder causes a red console error.
- [ ] Actor and token IDs match the active NPC.
- [ ] Scene changes leave no stale events behind.
- [ ] Foundry, D&D5e, and optional module versions are recorded with the result.

Do not approve Stage 1 if an action produces duplicate named events, the active participant is classified incorrectly, a placeholder produces an error, or events continue from the wrong scene.

---

## Stage 2A – Dual-monitor connection test

Use the normal GM Foundry window as the laptop/map window. The newly opened companion window represents the second monitor. The statblock and finished enemy dashboard are not included in this release.

### A. Update and startup

- [ ] Update GM Combat Workspace through Foundry and confirm version `0.3.2`.
- [ ] Activate the module and reload the world.
- [ ] Confirm that exactly one **GM Workspace öffnen** button appears at the lower-left edge.
- [ ] Confirm that the normal map remains usable and no existing Foundry control is blocked.
- [ ] Confirm that no red `gm-combat-workspace` error appears in F12.

### B. Open the companion window

- [ ] Click **GM Workspace öffnen**.
- [ ] If the browser reports a blocked pop-up, allow pop-ups for the Foundry address and click again.
- [ ] Confirm that a second Foundry window opens.
- [ ] Confirm that the second window shows **GM Combat Workspace – Zwei-Fenster-Verbindungstest**.
- [ ] Confirm that its status reads **Verbunden**.
- [ ] Move it to the second monitor and maximize it.
- [ ] Confirm that the original laptop window stays logged in and fully usable.
- [ ] Click the launcher again and confirm that the existing companion window is reused instead of creating unlimited new windows.

### C. Combat synchronization

- [ ] Start with no active encounter and confirm **Kein gestarteter Kampf**.
- [ ] Start an encounter in the laptop window.
- [ ] Confirm that combat ID, round, turn, and active participant appear in the companion window.
- [ ] Advance one turn and confirm that the companion updates without reloading.
- [ ] Advance into the next round and confirm that round and turn update.
- [ ] End the encounter and confirm that the companion returns to the inactive state.

### D. Token selection synchronization

- [ ] Select an NPC token on the laptop map.
- [ ] Confirm that its name, type, Actor ID, and Token ID appear under **Auf Laptop angeklickt**.
- [ ] Select a different NPC and confirm that all four values change.
- [ ] Select two tokens that use the same Actor and confirm that the Token ID changes correctly.
- [ ] Select a player token and confirm that the displayed type changes to `character`.
- [ ] Confirm that selecting and moving tokens on the laptop remains normal.

### E. Stability and optional modules

- [ ] Keep both windows open and advance through at least one complete combat round.
- [ ] Reload only the companion window and confirm that the current combat state returns.
- [ ] Close the companion window, reopen it with the launcher, and confirm that synchronization resumes.
- [ ] Test with RSReforged and Monk's Combat Details enabled, if installed.
- [ ] Confirm that neither Foundry window shows a red module error.
- [ ] Record whether both windows remained connected with the same GM account.

### F. Acceptance

- [ ] The laptop map remains completely usable.
- [ ] The companion window stays open on the second monitor.
- [ ] Combat state updates without manual reloads.
- [ ] Laptop token selections reach the companion window reliably.
- [ ] Opening the second window does not log out, freeze, or disconnect the first window.
- [ ] Screenshots and F12 output are attached for every failed item.

Do not approve Stage 2A if the second window disconnects the main GM client, combat updates require manual reloads, token selection does not cross between windows, or either window produces a red module error.

---

## Stage 2B – Native statblock workspace (0.4.9)

Complete Stage 2A first. Use the laptop for the map and the companion window on the second monitor.

### A. Update and layout

- [ ] Update GM Combat Workspace and confirm version `0.4.9`.
- [ ] Hard-reload both Foundry windows once with Ctrl+F5.
- [ ] Open the companion workspace.
- [ ] Confirm that the left statblock area occupies roughly 60 percent of the width.
- [ ] Confirm that selection control and combat status appear on the right.
- [ ] Confirm that no sections overlap at the maximized second-monitor resolution.
- [ ] Confirm that the laptop map remains usable.

### B. Active-enemy selection

- [ ] Start an encounter with an NPC as active participant.
- [ ] Confirm that the NPC name appears over the left statblock area.
- [ ] Confirm that **Aktiver Kampfteilnehmer** is shown as the source.
- [ ] Confirm that the configured native NPC sheet appears on the left.
- [ ] Advance to another NPC and confirm that the statblock changes exactly once.
- [ ] Advance to a player or placeholder and confirm that no player sheet opens.

### C. Laptop token selection

- [ ] Click a different NPC token on the laptop.
- [ ] Confirm that its statblock replaces the active NPC statblock.
- [ ] Confirm that **Auf Laptop angeklickt** is shown as the source.
- [ ] Click another NPC and confirm one clean change.
- [ ] Clear the laptop token selection.
- [ ] Confirm that the active NPC statblock returns.
- [ ] Select two unlinked tokens based on the same Actor and confirm the correct token Actor is used.

### D. Pinning

- [ ] Display an NPC and click **Gegner anpinnen**.
- [ ] Confirm that the button changes to **Anheften lösen**.
- [ ] Advance the combat turn and confirm that the pinned statblock remains.
- [ ] Click another NPC on the laptop and confirm that the pinned statblock remains.
- [ ] Click **Anheften lösen**.
- [ ] Confirm that the currently clicked NPC, otherwise the active NPC, is displayed immediately.

### E. Native sheet interaction

Run these checks once with a simple NPC and once with the Adult Red Dragon or another large NPC.

- [ ] The complete sheet is reachable with vertical scrolling.
- [ ] An attack can be clicked and rolled.
- [ ] Damage can be rolled.
- [ ] An action or feature can be used.
- [ ] Use Fire Breath while a use is available and confirm that the statblock remains fully visible.
- [ ] Use Fire Breath again without an available use and confirm that Foundry's red error notification is visible in the companion workspace.
- [ ] Confirm that the failed second use creates no chat card and the statblock remains visible.
- [ ] An ability check or saving throw can be rolled.
- [ ] Recharge and legendary actions remain clickable where provided by the sheet.
- [ ] Roll cards appear normally in Foundry chat.
- [ ] No second sheet opens over the laptop map.
- [ ] The sheet does not become a separate floating window on the companion monitor.

### F. Switching and stability

- [ ] Switch repeatedly between at least three differently sized NPC sheets.
- [ ] Confirm that only one statblock exists at a time.
- [ ] Confirm that the same NPC is not reloaded when selected again.
- [ ] Confirm that the sheet does not flicker continuously.
- [ ] Keep both Foundry windows open for one complete encounter round.
- [ ] Confirm that the laptop map remains responsive after the companion has loaded.
- [ ] Confirm that reopening the launcher only focuses the companion.

### G. Compatibility

- [ ] Repeat one attack and damage workflow with RSReforged enabled, if installed.
- [ ] Keep Monk's Combat Details enabled and advance through grouped or placeholder entries.
- [ ] Confirm that no red `gm-combat-workspace` error appears in either F12 console.
- [ ] Record the configured NPC sheet module and version, especially when using 5e Statblock Sheet.

### H. Acceptance

- [ ] The native sheet is embedded entirely inside the companion workspace.
- [ ] Attacks, features, checks, saves, recharge, and damage use the normal D&D5e workflow.
- [ ] Active, clicked, and pinned selection priorities are correct.
- [ ] The laptop never receives an automatic statblock window.
- [ ] Large sheets remain usable.
- [ ] No duplicate sheets, duplicate rolls, or module errors occur.

Do not approve Stage 2B if the configured native sheet cannot be embedded, its actions stop working, it opens on the laptop, selection priority is wrong, or switching NPCs creates duplicate applications.

---

## Stage 3 – Encounter dashboard (0.5.3)

Complete and approve Stage 2B first. Keep the map on the laptop and the companion workspace maximized on the second monitor.

### A. Layout and empty states

- [ ] Update GM Combat Workspace and confirm version `0.5.3` in Foundry and in the workspace header.
- [ ] Hard-reload both Foundry windows once with Ctrl+F5.
- [ ] Confirm that the native statblock uses roughly 40 percent and the dashboard roughly 60 percent of the companion width.
- [ ] Confirm that the Adult Red Dragon sheet remains readable, scrollable, and clickable in the narrower column.
- [ ] Without an encounter, confirm that the dashboard shows a clear empty state.
- [ ] With an encounter containing no undefeated NPCs, confirm that no enemy rows appear.

### B. Enemy list and status

- [ ] Add 1, then 10 NPCs and confirm that every undefeated NPC appears exactly once.
- [ ] Confirm that player characters and placeholder combatants do not appear.
- [ ] Confirm that the active NPC row is visibly highlighted.
- [ ] Hide an NPC token and confirm that its row changes to `Versteckt`.
- [ ] Unhide it and confirm that its row returns to `Bereit`.
- [ ] Mark an NPC defeated and confirm that its row disappears immediately.
- [ ] Remove the defeated state and confirm that the row returns with the same color.
- [ ] Add several identically named NPCs and confirm numbered names such as `Stirge 1`, `Stirge 2`, and `Stirge 3`.

### C. Dashboard selection

- [ ] Click an enemy row once.
- [ ] Confirm that its native statblock appears on the left.
- [ ] Confirm that the matching token becomes selected on the laptop.
- [ ] Confirm that the map position and zoom do not change.
- [ ] Double-click an enemy row and confirm that the map position and zoom still do not change.
- [ ] Pin one enemy, then click another dashboard row and confirm that the clicked row becomes the displayed and selected enemy.

### D. Color and hover

- [ ] Confirm that every dashboard row has a colored stripe.
- [ ] Confirm that the corresponding laptop token has the same colored local outline.
- [ ] Confirm that players do not see these GM-local outlines.
- [ ] Hover an enemy row and confirm that only its matching laptop token is highlighted.
- [ ] Move the pointer away and confirm that the temporary hover highlight disappears.
- [ ] Confirm that hovering never selects a token or moves the camera.
- [ ] Change turns and confirm that colors stay assigned to the same combatants.

### E. Live updates and stability

- [ ] Add and remove an NPC while the dashboard is open and confirm an immediate clean update.
- [ ] Advance through NPCs, players, grouped entries, and placeholders.
- [ ] Move tokens and confirm that their color outlines follow them.
- [ ] Open or focus the workspace repeatedly and confirm that no duplicate dashboard appears.
- [ ] Complete one encounter round and confirm that both windows remain responsive.
- [ ] Confirm that no red `gm-combat-workspace` error appears in either F12 console.

Do not approve Stage 3 if the dashboard moves the laptop camera, selects the wrong token, shows defeated enemies, duplicates equal-name enemies, loses color assignments during ordinary turn changes, or interferes with native statblock actions.

### F. Version 0.5.1 regression patch

- [ ] Select an NPC while a player is active and confirm that the NPC shows only `Ausgewählt`, never `Am Zug`.
- [ ] Confirm that the player name is prominently displayed above the enemy list.
- [ ] Advance to an NPC and confirm that only this NPC receives the gold `Am Zug` marker.
- [ ] Select a different NPC and confirm that `Am Zug` and `Ausgewählt` remain visibly distinct.
- [ ] Confirm that no two current enemies share the same dashboard color.
- [ ] Hide and reveal a token and confirm an immediate `Versteckt`/`Bereit` update.
- [ ] On an unlinked token, set HP to zero through the token HUD and confirm that Dead/Bloodied is applied without duplicate ActorDelta errors.
- [ ] Repeat the HP-zero test with a linked token.
- [ ] Heal a defeated unlinked token through the token HUD and confirm that Dead/Bloodied is removed without `ActiveEffect does not exist` errors.
- [ ] End the encounter and confirm that pin, statblock, dashboard rows, token colors, hover, and laptop token selection all clear.
- [ ] Start a new encounter and confirm that no enemy from the previous encounter remains selected or pinned.
