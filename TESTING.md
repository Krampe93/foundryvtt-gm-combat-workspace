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
