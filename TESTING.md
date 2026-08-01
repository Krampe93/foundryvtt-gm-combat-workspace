# Manual test checklist

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

## Stage 3 – Encounter dashboard (0.5.0)

Complete and approve Stage 2B first. Keep the map on the laptop and the companion workspace maximized on the second monitor.

### A. Layout and empty states

- [ ] Update GM Combat Workspace and confirm version `0.5.0`.
- [ ] Hard-reload both Foundry windows once with Ctrl+F5.
- [ ] Confirm that the native statblock uses roughly 30 percent and the dashboard roughly 70 percent of the companion width.
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
