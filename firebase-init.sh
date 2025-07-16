#!/bin/bash

# Firebase Hosting Initialization Script
# This script properly initializes Firebase Hosting for static web app

echo "🔧 Setting up Firebase Hosting for static web app..."

# Step 1: Login to Firebase
echo "1. Logging in to Firebase..."
firebase login --no-localhost

# Step 2: Initialize Firebase project
echo "2. Initializing Firebase project..."
firebase init hosting --project chess-logger

echo "✅ Firebase Hosting initialized!"
echo "📝 Next steps:"
echo "   1. Run 'npm run build' to build your app"
echo "   2. Run 'firebase deploy --only hosting' to deploy"
echo "   3. Visit https://chess-logger.web.app"