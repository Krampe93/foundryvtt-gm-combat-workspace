# GM Combat Workspace

GM Combat Workspace is a Foundry VTT module for running D&D 5e encounters from a compact GM-facing workspace while keeping the map visible and usable.

The project is at the initial scaffold stage. Existing macro behavior will be migrated into separate, maintainable services rather than combined into one large macro.

The implementation order, manual Foundry test cases, and acceptance gates are maintained in [ROADMAP.md](ROADMAP.md). Each stage is reviewed and tested before work begins on the next one.

The current manual acceptance checklist is maintained in [TESTING.md](TESTING.md).

## Installation

In Foundry VTT, open **Add-on Modules → Install Module**, paste the following URL into **Manifest URL**, and select **Install**:

```text
https://raw.githubusercontent.com/Krampe93/foundryvtt-gm-combat-workspace/main/module.json
```

This manifest URL is permanent. Foundry can use it to discover and install future test versions through the normal update function.

Version `0.5.1` refines the Stage 3 encounter dashboard with separate current-turn and selected states, synchronized unique encounter colors, live token visibility, a complete encounter-end reset, and a companion-only guard against duplicate automatic D&D5e Dead/Bloodied effects.

## Development

Validate the manifest, referenced files, optional-dependency policy, and matching translation keys:

```powershell
node tools/validate.mjs
```

Build an installable Foundry package:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./tools/package.ps1
```

The package is written to `dist/gm-combat-workspace.zip` and contains a single top-level module folder.

Every pull request also publishes the same ZIP as a downloadable GitHub Actions artifact.

## Planned features

- Compact enemy dashboard with HP, temporary HP, armor class, and saving throws
- Direct damage, healing, token selection, and actor-sheet access
- Automatic opening of the active enemy's normal D&D5e statblock
- Full compatibility with normal clickable attacks, activities, features, and rolls
- Enemy reaction overview and automatic per-turn reset
- Legendary action resources, actions, and follow-up attacks
- Hidden enemy movement path and destination marker
- Encounter preparation with configurable player initiative placeholders
- W12 initiative workflow and in-lair handling
- Optional RSReforged damage-breakdown integration

## Dependencies

### Required software

- Foundry Virtual Tabletop 14
- Dungeons & Dragons Fifth Edition system 5.3 or newer

The D&D5e entry is a Foundry game system, not a third-party module.

### Required third-party modules

None.

The module is intentionally designed without hard dependencies on modules owned by other developers.

### Optional integrations

- **RSReforged** (`rsreforged`): preserves and extends the current roll-card and automatic damage-breakdown workflow. The core dashboard and native D&D5e rolls must continue to work without it.
- **Monk's Combat Details** (`monks-combat-details`): compatibility with the existing player initiative placeholder flags. The finished module should also provide its own configurable placeholder workflow.

### Not a dependency

- The `reaction-tracker` namespace used by the current macros is treated as stored flag data. A separately installed module with that ID is not required for the planned implementation.

## Proposed architecture

- `CombatCoordinator`: evaluates combat, round, and turn changes once
- `Dashboard`: renders enemy resources and actions
- `ActiveStatblockController`: opens and closes the active NPC sheet
- `ReactionService`: discovers, tracks, and resets reactions
- `LegendaryActionService`: tracks resources and follow-up activities
- `HiddenMovementService`: draws and clears hidden movement paths
- `EncounterPreparationService`: creates combatants and handles initiative/lair setup
- `IntegrationService`: isolates optional RSReforged and Monk's Combat Details behavior

## Default active-enemy behavior

When an NPC turn begins:

1. Highlight the active enemy in the dashboard.
2. Select its token without moving the camera.
3. Open its normal D&D5e statblock.
4. Close the previously auto-opened NPC sheet.
5. Refresh reactions, legendary actions, and start-of-turn reminders.
6. Keep attacks and features clickable through the normal D&D5e/RSReforged workflow.

When a player turn begins, the workspace prioritizes enemy reactions and legendary actions instead of opening a player sheet.

## Development status

Version `0.1.0` contains the initial module manifest, settings, translations, styling foundation, dependency policy, and implementation plan.
