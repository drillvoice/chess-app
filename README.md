# Chess Training Logger

A full-stack web application for tracking chess training sessions including tactics practice, games, and study sessions.

## Features

- Log tactics training with points and scores
- Track games with results, colours, platforms, and time controls
- Record study sessions with notes
- Set and track weekly goals
- Export/import training data for backup
- Mobile-first responsive design

## Deployment Options

### Option 1: Railway (Recommended)
1. Go to [railway.app](https://railway.app)
2. Connect your GitHub account
3. Deploy this repository
4. Railway will automatically detect the Node.js app and deploy it

### Option 2: Render
1. Go to [render.com](https://render.com)
2. Connect GitHub and select this repository
3. Choose "Web Service"
4. Build Command: `npm run build`
5. Start Command: `npm start`

### Option 3: Vercel (Requires setup)
1. Push the included `vercel.json` file to your repository
2. Deploy on Vercel

## Local Development

```bash
npm install
npm run dev
```

## Data Management

This app uses in-memory storage with export/import functionality:
- Data persists during your session
- Export your training data regularly to create backups
- Import previously exported files to restore your training history
- Completely free - no database subscription required

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Express.js, Node.js
- **Storage**: In-memory with JSON export/import
- **Build**: Vite for frontend, esbuild for backend