# Changelog

All notable changes to GM Combat Workspace will be documented in this file.

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
