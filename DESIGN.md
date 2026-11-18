# SUNKEN FOUNDRY — Game Design (brief)

## Concept
Original 2D pinball roguelite for make.fun best-game-01. An ancient sunken
foundry at the bottom of the sea. The player is a salvage diver running a
clockwork pinball machine that powers the foundry. Clear 5 depths; each depth
has a clockwork sea-creature boss with armor plates (break plates, then crack
the core). Defeat THE BRASS KRAKEN at depth 5 to win.

## Core loop (30s)
Launch ball -> flip, hit bumpers/targets/lanes -> build combo multiplier ->
break boss plates -> crack core -> boss dies -> spend salvage on relics in the
shop -> next depth, harder hazard.

## Depths & bosses
1. Sunken Dock — Rivet Crab (3 plates, 8 core hits) — hazard: Rivet Crab
2. Coral Works — Barnacle Maw (4 plates, 10 core hits) — hazard: Barnacle
3. Pressure Vault — Pressure Mine Mother (4 plates, 12 core hits) — hazard: Pressure Mine
4. Furnace Deep — Ink Squid (5 plates, 14 core hits) — hazard: Ink Squid
5. The Foundry Heart — THE BRASS KRAKEN (6 plates, 18 core hits) — hazard: Gulper Eel

## Mechanics
- Custom Canvas 2D physics: ball, 2 flippers, 3 bumpers, 2 slingshots, 5 drop
  targets, 4 rollover lanes, launch rail, drain.
- Combo multiplier (x1..x8) with 3s timer; surge ability (E, 4s x2 score,
  15s cooldown); tilt/nudge with 3 warnings; ball save after launch.
- Pearls = balls (3). Salvage currency from hits. Relic shop between depths
  (3 random relics offered, 10 relics total, concrete effects).
- Win: defeat depth-5 boss. Lose: all pearls drain.
- Pause (P), sound toggle (M), best score in localStorage.
- Controls: Z / left flipper, Space launch (hold to charge), E surge,
  A/D/W nudge, P pause, M sound. Keyboard-first.

## HUD (1280x720, brass/gold + deep teal)
LEFT: depth, boss (hull/plates), win/lose, goals checklist, shoal list.
CENTER: pinball table (canvas) + controls strip.
RIGHT: score, combo, pearls, salvage, ball save, tilt, surge, relics held.
All UI text in English. Zero external requests. No three.js, no importmap.

## Tech
Static files under game/ (index.html, style.css, src/*.js, ES modules).
Canvas 2D, vanilla JS, WebAudio bleeps. Debug hooks: window.__game,
window.__debug, window.render_game_to_text(), window.__shotReady.
Deterministic shot scenes via ?shot=<name>&seed=1.
