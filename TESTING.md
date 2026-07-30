# Manual test checklist

## Stage 0 – Development and test foundation

Test this pull request in a disposable or backed-up Foundry VTT world.

Record the result of each item as:

- PASS
- FAIL, with the exact step and observed behavior
- NOT TESTED, with the reason

### A. Installation

- [ ] Open the Stage 0 pull request and its successful **Validate module** workflow.
- [ ] Download the `gm-combat-workspace-stage-0` artifact from the workflow run.
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
