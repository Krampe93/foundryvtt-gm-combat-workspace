# Changelog

All notable changes to GM Combat Workspace will be documented in this file.

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
