#!/bin/bash

echo "🚀 Building Pawn Star Chess Log with PWA files..."

# Step 1: Copy PWA files to client/public
echo "📋 Copying PWA files..."
node copy-pwa-files.js

# Step 2: Build the frontend
echo "🏗️ Building frontend..."
vite build

# Step 3: Build the backend
echo "⚙️ Building backend..."
esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

echo "✅ Build complete! Ready for Firebase deployment."
echo "📦 Run 'firebase deploy' to deploy to Firebase Hosting."