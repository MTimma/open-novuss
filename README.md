# Open Novuss

A realistic Novuss (Baltic carrom) table built with Phaser 3 and Matter physics. It reproduces the pacing and pocketing feel from tournament footage, including striker slide lanes, pocket sensors, and scoreboard UI.

## Getting started

```bash
npm install
npm run dev
```

The Vite dev server starts on port 5173 by default. Run `npm run build` for a production bundle and `npm run preview` to serve the static build locally.

## Gameplay & controls

- Use `← / →` or `A / D` to slide the striker along the baseline before shooting.
- Click and drag from the striker opposite the direction you want to shoot, then release to fire.
- Pocket the discs that match your player color (Player 1 = light, Player 2 = dark). Scratching the striker is a foul and forfeits the turn.
- The right-side panel reports scores, current turn, shot power, and control reminders.

## Security notes

- No secrets or credentials are stored in the repository.
- All DOM interactions are scoped to the component mount node to avoid leaking references outside the game wrapper.