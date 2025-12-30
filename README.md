# Trick Taking Trainer

Browser-based training tool for trick-taking card games, focused on card counting and void tracking.

Live site: https://gsingh93.github.io/trick-taking-trainer/

## Development
Requirements: Node.js (LTS recommended).

```sh
npm install
npm run dev
```

## Tests
Engine tests use Vitest.

```sh
npm test
```

## Project Structure
- `src/engine/`: game engine (types, rules, state, AI)
- `src/App.tsx`: UI + training flows

## Notes
- This is a trainer, not a competitive AI game.
- Game rules are intentionally generic and designed for extensibility.
