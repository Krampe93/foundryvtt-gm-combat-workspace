# Changelog

## 0.8.6 – 2026-08-08

- Dauerlayout nach der freigegebenen Skizze aufgebaut: vollständige linke Statblock-Spalte und exakt halbierte rechte Spalte.
- Gegnerdashboard auf bis zu zehn kompakte, scrollbar angeordnete Zeilen in der oberen Hälfte verdichtet.
- Normale Rettungswürfe bleiben direkt sichtbar; Vorteil und Nachteil erscheinen platzsparend beim Überfahren oder Tastaturfokus.
- Untere Hälfte im Verhältnis 50/25/25 für Reaktionen und Hinweise, zukünftige Würfelergebnisse sowie zukünftige Minimap gegliedert.
- Noch nicht implementierte Würfelergebnisse und Minimap ausdrücklich nur als inaktive Reserveflächen dargestellt.
- Diagnose aus der Daueransicht entfernt und in ein kompaktes Drei-Punkte-Menü im Kopf verschoben.
- Mehrfach-TP-Werkzeuge werden nur eingeblendet, sobald mindestens ein Gegner ausgewählt wurde.

## 0.8.5 – 2026-08-08

- Künstliche, nicht ausgelöste Mausereignisse aus direkten Statblock-Aktivitätsaufrufen entfernt.
- Inline-Schaden, Angriffe und Save-Aktivitäten werden mit leerer D&D5e-Konfiguration und deaktiviertem Dialog ausgeführt.
- Den dadurch ausgelösten Fehler `Cannot read properties of null (reading 'closest')` beim Klick auf Death Gazes `3d10 psychic` behoben.
- Automatischen Regressionstest ergänzt, der sicherstellt, dass direkte Aktivitätsaufrufe kein `event` mehr enthalten.

## 0.8.4 – 2026-08-08

- Separate Aktivitätsschaltflächen unter ergänzten Statblock-Eigenschaften wieder vollständig entfernt.
- Save- und Schadensangaben innerhalb des normalen Beschreibungstexts als kompakte anklickbare D&D5e-Aktivitätslinks aufgebaut.
- Inline-Schaden bevorzugt eine ausdrücklich als `damage` typisierte Aktivität; dadurch verwendet Death Gaze zuverlässig seine separate Schadensaktivität.
- Bei Fähigkeiten wie Fire Breath ohne separate Damage-Aktivität wird die schadensführende Save-Aktivität verwendet.
- Der funktionierende Namensklick ergänzter Fähigkeiten bleibt unverändert erhalten.

## 0.8.3 – 2026-08-07

- Ergänzte Statblock-Fähigkeiten führen über ihren Namen jetzt ihre erste ausführbare D&D5e-Aktivität statt des bei mehreren Aktivitäten wirkungslosen allgemeinen Item-Aufrufs aus.
- Für ergänzte Fähigkeiten kompakte Aktivitätslinks hinzugefügt; insbesondere erzeugt `Schaden würfeln` über D&D5es natives `rollDamage()` unmittelbar einen Schadenswurf ohne Dialog.
- Save-, Attack- und sonstige Aktivitäten werden über ihre jeweils passende native D&D5e-Methode ausgeführt.
- Teilweise von Foundry zerlegte Quellenreste wie `Cone [Area of Effect|XPHB]Cone` vollständig zu `Cone` bereinigt.

## 0.8.2 – 2026-08-06

- Vom nativen D&D5e-Statblock übersehene passive `feat`- und `weapon`-Items ergänzt; eine leere Aktivierungsart der ersten Aktivität wird dabei als Eigenschaft behandelt.
- Bereits dargestellte Fähigkeiten und die besonderen Beschreibungs-Items für legendäre beziehungsweise mythische Aktionen werden nicht dupliziert.
- Rohe Foundry-Befehle für Rettungswürfe, Proben, Schaden, Zustände, Referenzen, Zauber und Variantenregeln lesbar aufbereitet; von Foundry unterstützte Links bleiben anklickbar.
- Zughinweise semantisch eingegrenzt: `Death Gaze` und echte, actorbezogene Start-/End-of-Turn-Effekte bleiben erhalten, während `Command` und `Detect Magic` keine falschen Aura-Warnungen mehr erzeugen.

## 0.8.1 – 2026-08-05

- Actorlose Spieler-Platzhalter als Spielerzug erkannt, damit der Reaktionsbereich zuverlässig blau hervorgehoben wird.
- Gegnerzüge normal als `Gegnerzug: Name` bezeichnet, ohne die Reaktionsübersicht auszugrauen.
- Gelegenheitsangriffe ohne künstliches, zielloses Klickereignis ausgeführt und damit den D&D5e-Fehler bei `target.closest()` behoben.
- Aura-Erkennung um Zugende-Auslöser und ausdrücklich als Aura benannte Fähigkeiten erweitert; damit wird insbesondere die Bodak-Fähigkeit `Aura of Annihilation` erkannt.
- Warntexte unterscheiden jetzt zwischen Beginn des Zuges, Ende des Zuges und allgemein zu prüfenden Auren.

## 0.8.0 – 2026-08-05

- Eigene Reaktionsübersicht unterhalb der Gegnerliste ergänzt und bei Spielerzügen hervorgehoben.
- Explizite D&D5e-Reaktionsaktivitäten mit Auslöser, Kurztext und aufklappbarer Beschreibung erkannt.
- Reaktionsstatus pro Gegner dauerhaft als `Verfügbar` oder `Verwendet` gespeichert und manuell umschaltbar gemacht.
- Erfolgreich ausgeführte Reaktionen automatisch als verwendet markiert; abgebrochene oder fehlgeschlagene Verwendungen verändern den Status nicht.
- Vorhandene Zustände des optionalen Moduls `reaction-tracker` kompatibel eingelesen, ohne eine neue Pflichtabhängigkeit einzuführen.
- Verwendete Reaktionen abgedunkelt und durchgestrichen, versteckte Gegner mit Augensymbol gekennzeichnet und besiegte Gegner ausgeblendet.
- Gelegenheitsangriffe für jeden Gegner ergänzt: ein eindeutiger Nahkampfangriff wird direkt gewürfelt, mehrere Angriffe werden zur Auswahl angeboten und bei fehlender Zuordnung wird der Statblock geöffnet.
- Start-of-Turn-Auren und Flächeneffekte während Spielerzügen als gesonderte Warnung angezeigt.
- Automatische Reaktionsrücksetzungen bleiben der folgenden Roadmap-Etappe vorbehalten.

## 0.7.2 – 2026-08-02

- Die obere Anzeige des aktuellen NPC-Zugs neutral gestaltet; Gold kennzeichnet nur noch die aktive Gegnerzeile.
- Den separaten Bereich „Statblock-Steuerung“ entfernt.
- Die Anheftfunktion kompakt in den Statblock-Kopf neben die Auswahlquelle verschoben.

## 0.7.1 – 2026-08-02

- Statusanzeigen zwischen Gegnername und RK in eine feste Spalte verschoben.
- Feste Spaltenbreiten verhindern, dass RK, TP oder Rettungswürfe durch `Am Zug` und `Ausgewählt` verrutschen.
- Der normale Rettungswurfknopf ist exakt so hoch wie die beiden Knöpfe für Vorteil und Nachteil zusammen.
- Ein Klick oder Tastaturfokus markiert den vollständigen aktuellen TP-Wert zur direkten Eingabe.

## 0.7.0 – 2026-08-02

- Alle sechs Rettungswurf-Modifikatoren direkt in jeder Gegnerzeile ergänzt.
- Normaler Rettungswurf wird über den großen Werteknopf sofort und ohne Dialog ausgeführt.
- Separate kompakte Knöpfe für Vorteil (`V`) und Nachteil (`N`) ergänzt.
- Native D&D5e-Rettungswurf- und Chat-Auswertung mit dem zugehörigen Token als Sprecher beibehalten.
- Etappe 4 nach vollständigem Foundry-Test abgenommen.

## 0.6.0 – 2026-08-01

- Rüstungsklasse sowie aktuelle und maximale TP in der Gegnerübersicht ergänzt.
- Direkte TP-Eingaben zum Setzen, Schädigen und Heilen ergänzt.
- Mehrfachauswahl mit Schaden, halbem Schaden und Heilung ohne Bestätigungsdialog ergänzt.
- Temporäre TP werden nicht angezeigt, bei Schaden aber zuerst verbraucht.
- Verknüpfte Actors werden bei Mehrfachaktionen nur einmal verändert; synthetische Token-Actors bleiben unabhängig.

All notable changes to GM Combat Workspace will be documented in this file.

## [0.5.3] - 2026-08-01

### Fixed

- Expands the native statblock column to 40 percent with a 760 pixel minimum width
- Displays the exact installed module version from the Foundry manifest in the workspace header
- Prevents the companion client from issuing duplicate automatic D&D5e Dead/Bloodied deletions when a defeated token is healed
- Keeps both creation and deletion guards limited to the companion client and the canonical Dead/Bloodied ids

## [0.5.2] - 2026-08-01

### Fixed

- Expands the native statblock column to 35 percent with a 640 pixel minimum width
- Identifies automatic D&D5e Dead and Bloodied effects across all pre-create representations instead of depending on the temporary parent document type
- Keeps the broader status guard isolated to the companion client and the two canonical D&D5e status ids

## [0.5.1] - 2026-08-01

### Fixed

- Separates the prominent current-turn marker from the independently selected dashboard row
- Shows the current player name without marking an enemy as active during a player turn
- Assigns collision-free encounter palette colors in the companion and broadcasts the authoritative mapping to laptop token outlines
- Reads token visibility even when the Combatant document itself is not hidden
- Clears pinning, selection, statblock, hover, colors, enemy list, and laptop token control when an encounter ends
- Blocks duplicate automatic D&D5e Dead and Bloodied ActiveEffect creation only inside the companion client for synthetic ActorDelta tokens

### Changed

- Selected enemies use a blue dashed outline and label; the active enemy uses a strong gold `Am Zug` treatment

## [0.5.0] - 2026-08-01

### Added

- Stage 3 encounter dashboard in the right 70 percent of the companion workspace
- Live list of undefeated NPC combatants with active, hidden, and scene-presence states
- Stable per-combatant colors shared by dashboard rows and local laptop-token outlines
- Dashboard click selects the laptop token and displays its native statblock without moving the camera
- Dashboard hover highlights the matching laptop token without selecting it
- Empty states for encounters without available enemies

### Changed

- Native statblock column now uses 30 percent of the companion workspace
- Defeated enemies are removed from the dashboard and their local color outline is removed
- Diagnostic panels are collapsed behind an optional details section

## [0.4.9] - 2026-08-01

### Fixed

- Prevents Foundry from minimizing the embedded native statblock after a successful feature use
- Recovers the managed statblock if a sheet still enters Foundry's `minimizing` or `minimized` state
- Keeps Foundry's native notification area visible in the fullscreen companion workspace, including errors for unavailable feature uses

### Planned

- Recharge display and manual recharge rolls are recorded for a later roadmap stage

## [0.4.8] - 2026-08-01

### Added

- Read-only statblock lifecycle diagnostics in the companion workspace
- Records native sheet render and close hooks, Actor update paths, direct host replacements, and item-use timing
- Captures sheet and host connectivity, parent, child count, and text length at 0, 50, 200, 500, and 1000 milliseconds after an item use or Actor update

### Changed

- This release intentionally observes the disappearing-statblock failure without attempting another lifecycle fix

## [0.4.7] - 2026-08-01

### Added

- Read-only roll diagnostics panel in the companion workspace
- Captures click modifiers, keyboard state before and after cleanup, and configured D&D5e fast-roll keybindings
- Captures the resulting D&D5e attack formula, advantage mode, option flags, d20 count, modifiers, individual results, and active/discarded state

### Changed

- This release intentionally adds observation only and does not attempt another roll-behavior correction

## [0.4.6] - 2026-08-01

### Fixed

- Plain item-action clicks in 5e Statblock Sheet are intercepted at the action link before its delegated ApplicationV2 handler
- The normal D&D5e `item.use()` workflow is invoked exactly once with a clean, unmodified click event
- Explicit modifier-key clicks continue through the native Statblock Sheet handler unchanged

## [0.4.5] - 2026-08-01

### Fixed

- Restored the proven visible in-panel sheet mount after the top-level positioning experiment could remain stuck in the loading state with 5e Statblock Sheet
- Retained the direct D&D5e keyboard-state cleanup from 0.4.4 for isolated roll testing

## [0.4.4] - 2026-08-01

### Fixed

- Clears stale modifier codes directly from the companion client's `game.keyboard.downKeys` set
- Normal unmodified statblock clicks clear stale Control, Alt, Shift, and Meta state before D&D5e evaluates advantage or disadvantage
- Explicitly held modifier keys are preserved so intentional roll shortcuts continue to work

## [0.4.3] - 2026-08-01

### Fixed

- Native sheets now remain top-level Foundry applications and are positioned over the statblock panel instead of being reparented inside it
- Feature and resource rerenders can replace the native application element without leaving an empty embedded frame
- The positioned sheet follows companion-window resizing while preserving the two-column appearance

## [0.4.2] - 2026-08-01

### Fixed

- Native sheets are remounted after their complete render lifecycle so feature and resource updates no longer leave an empty application frame
- The companion releases stale Control, Alt, Shift, and Meta key states when it gains focus, preventing a Ctrl+F5 reload from leaking a false roll modifier into later attacks

## [0.4.1] - 2026-08-01

### Fixed

- An automatically controlled active NPC token is now labeled **Aktiver Kampfteilnehmer** instead of **Auf Laptop angeklickt**
- Native sheet rerenders now mount the freshly rendered element instead of retaining a stale, empty sheet frame
- Actor resolution in sheet-render hooks now supports `actor`, `document`, and `object` application properties

## [0.4.0] - 2026-08-01

Stage 2B native-statblock test release.

### Added

- Final two-column companion layout with native statblock area on the left
- Automatic NPC selection from the active combatant
- Laptop token selection with higher priority than the active combatant
- Visible selection source for active, clicked, and pinned enemies
- Pin and unpin control for keeping a chosen enemy visible
- Native Actor Sheet embedding for classic Foundry applications and ApplicationV2 sheets
- Empty, loading, and error states for the statblock area

### Changed

- Replaced the Stage 2A diagnostic cards with the first permanent workspace shell
- Clearing the final laptop token selection now returns control to the active NPC

## [0.3.2] - 2026-08-01

### Fixed

- Reusing the launcher now focuses an open companion window without navigating or reloading the Foundry client

## [0.3.1] - 2026-08-01

### Fixed

- Moved the workspace launcher beside Combat Wall and raised its display layer so other modules cannot cover it

## [0.3.0] - 2026-08-01

Stage 2A test release for the dual-monitor foundation.

### Added

- GM-only **GM Workspace öffnen** launcher
- Separate full Foundry client in companion/workspace mode
- Live display of encounter, round, turn, and active participant
- Cross-window synchronization of enemy token selections through BroadcastChannel
- Public module API for opening the companion workspace
- Responsive connection-test layout for the second monitor
- Warning when the browser blocks the companion window

### Changed

- The planned primary workflow now keeps the map on the laptop and reserves a second monitor for the native statblock and enemy dashboard

## [0.2.0] - 2026-07-30

Stage 1 test release. Manual Foundry acceptance is still pending.

### Added

- Central combat coordinator for combat, round, turn, and active-combatant changes
- NPC, player, placeholder, and other combatant classification
- Active combatant context with resolved Actor, Token, and Scene documents
- Internal event bus and public read-only module API for later services
- Coalescing of simultaneous Foundry hooks and duplicate-event suppression
- Automated unit tests for combat-state transitions

### Fixed

- Development diagnostics now use an information-level console entry so they are visible under Chrome's default console levels

## [0.1.0] - 2026-07-30

Stage 0 test release. Manual Foundry acceptance is still pending.

### Added

- Modular source layout with centralized configuration and settings
- Optional development logging
- Automated manifest, translation, reference, and JavaScript validation
- Reproducible Foundry module ZIP packaging
- GitHub validation workflow for pull requests and `main`
- Draft GitHub release workflow for version tags
- Manual Foundry test checklist

### Changed

- Removed the startup notification from normal GM sessions
- Added final GitHub manifest and download URLs to `module.json`
