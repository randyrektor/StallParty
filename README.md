# StallParty

A modern web-based score tracking application for Ultimate Frisbee games, featuring advanced line rotation management, gender ratio tracking, and real-time game statistics.

- **Live app:** [stall.party](https://stall.party)
- **Source:** [github.com/randyrektor/StallParty](https://github.com/randyrektor/StallParty)

## Features

### ✅ Team & Roster Management
- **Home Screen**: Enter your team name on startup
- **Roster Setup**: Add players for each game (no hardcoded roster)
- **Quick Entry**: Add players by name and gender with keyboard shortcuts
- **Visual Stats**: See player count breakdown (Total, Open, Women)
- **Local Storage**: Saves recent team names for quick access
- **Flexible**: Add different players each game

### 🎯 Game Tracking
- Real-time score tracking for both teams
- Point-by-point history with undo functionality
- Automatic line rotation based on gender ratios
- Support for ABBA, 4-3, 3-4, Men Only, and Women Only formats

### 👥 Player Management
- Drag-and-drop roster management during game
- Late arrival handling (players can join mid-game without disrupting current line)
- Automatic player numbering by gender
- Current and next line preview
- Pending players queue for seamless rotation

### ⏱️ Game Timers
- Configurable game start, halftime, and end times
- Live countdown timers during gameplay
- Automatic timer visibility based on game schedule

### 📊 Export & Settings
- Export game reports with full roster and scores
- Customizable team names
- Flexible gender ratio modes
- Reset game functionality

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Build for Production

```bash
npm run build
```

## Usage

### Game Flow

1. **Enter Team Name**: Start by entering your team name on the home screen
2. **Add Players**: Add each player one by one (name + gender)
   - Press Enter to quickly add players
   - See real-time stats as you add players
   - Remove players if you made a mistake
3. **Start Game**: Once you have at least one player, click "Start Game"
4. **Configure Settings**: Set opponent name, game times, and gender ratio mode
5. **Track Score**: Click on team score cards to increment points
6. **Line Rotation**: Lines automatically rotate after each point
7. **Late Arrivals**: Use the "+" button to add players mid-game
8. **Undo**: Made a mistake? Click "UNDO" to revert the last score
9. **Export**: Download a game report from the settings menu

### Player Entry Tips

- **Quick Entry**: Type name → Select gender → Press Enter → Repeat
- **Gender Toggle**: Click "Open" or "Women" button to select
- **Remove Players**: Click the "×" button on any player card
- **Stats Display**: Monitor player counts as you build your roster

## Local Storage

The app uses browser localStorage to persist:
- Recent team names (last 5 teams)
- Quick access to previously used team names

**Note**: Rosters are NOT saved - you add players fresh each game. This ensures you only track the players who are actually present.

## Future Enhancements

- Database integration for multi-device sync
- User authentication
- Save roster templates per team
- Historical game statistics
- Advanced analytics and player stats
- Import/export rosters

## Technology Stack

- React 19
- TypeScript
- Vite
- @dnd-kit (drag-and-drop)
- React Spring (animations)

## Author

Randy Rektor

## License

Copyright (c) 2025-2026 Randy Rektor

Licensed under the [MIT License](LICENSE).
