# Life XP

A gamified life tracking app built with React Native and Expo. Track your character stats (Energy, Focus, Health, Mental), gain XP by completing tasks, and manage status effects.

## Features

- **Character Stats**: Track Energy, Focus, Health, and Mental stats
- **XP System**: Gain experience points by completing tasks and level up
- **Status Effects**: Apply buffs and debuffs that modify your stats
- **Regeneration**: Stats regenerate over time automatically
- **Dark Mode**: Automatic dark/light mode support

## Tech Stack

- React Native with Expo
- TypeScript
- Zustand (state management)
- AsyncStorage (persistent storage)

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm or yarn
- Expo CLI (`npm install -g expo-cli`)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Run on your preferred platform:
```bash
npm run android  # Android
npm run ios      # iOS
npm run web      # Web
```

## Usage

- Tap "Completed a task" to gain XP and update your stats
- Watch your stats regenerate automatically over time
- View active status effects and their remaining duration
- Track your progress with the XP bar and level display

## Development

The app uses Zustand for state management and AsyncStorage for persistence. Character data is automatically saved and restored when the app is restarted.

