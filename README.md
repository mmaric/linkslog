# ⛳ Linkslog

A personal golf score and handicap tracker that runs locally in your browser. No accounts, no cloud, no subscriptions — your data stays on your machine.

![Linkslog screenshot](https://raw.githubusercontent.com/mmaric/linkslog/main/screenshot.png)

## Features

- **WHS Handicap Index** — calculated using the official World Handicap System sliding scale (3–20 rounds)
- **Hole-by-hole scorecards** — track score, putts, fairways hit (FIR), and greens in regulation (GIR auto-calculated)
- **Round history** — month-grouped view with score, differential, and stat chips per round
- **Course management** — comes with a built-in course list; add your own with custom rating, slope, and par
- **Stats & trends** — handicap trend chart, avg score, best round, FIR%, GIR%, putts per round
- **Dark / Light / System theme** — picks up your OS preference or lets you override it
- **Export & Import** — back up your rounds as JSON and restore them on any machine

## Tech

Vanilla HTML, CSS, and JavaScript — no build step, no framework, no npm. A minimal Node.js server handles local file persistence. [Chart.js](https://www.chartjs.org/) is loaded via CDN for trend charts.

```
index.html   — app shell and bottom nav
app.js       — all UI rendering and state management
engine.js    — pure WHS handicap calculations
courses.js   — built-in course database
style.css    — all styles and theme variables
server.js    — static file server + tiny JSON API (no dependencies)
data/        — auto-created on first run; holds rounds.json and courses.json
```

## Getting Started

**Requirements:** Node.js (any recent version)

```bash
git clone https://github.com/mmaric/linkslog.git
cd linkslog
node server.js
```

Then open [http://localhost:3333](http://localhost:3333) in your browser.

Data is saved automatically to `data/rounds.json` and `data/courses.json`. These files are git-ignored so your personal data is never committed.

## Handicap Calculation

Linkslog uses the [World Handicap System (WHS)](https://www.usga.org/content/usga/home-page/handicapping/world-handicap-system.html):

1. Each round produces a **Score Differential**: `(Gross Score − Course Rating) × 113 ÷ Slope Rating`
2. The best differentials from your last 20 rounds are averaged (sliding scale: 1 of 3, up to 8 of 20)
3. The average is multiplied by **0.96** (the WHS "bonus for excellence" adjustment)
4. A minimum of **3 rounds** is required to establish an index

## Contributing

Contributions are welcome — bug fixes, new courses, UI improvements, or the course search feature described in the roadmap below.

1. Fork the repo
2. Make your changes
3. Open a pull request with a short description of what you changed

To add courses to the built-in database, edit `courses.js`.

## Roadmap

- [ ] Course search / auto-fill from an open course database
- [ ] PWA support (install to home screen, offline play)
- [ ] 9-hole round support
- [ ] Stats breakdown by course

## License

MIT
