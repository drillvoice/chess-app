#!/bin/bash

# Firebase Deployment Script for Chess Training Logger
# This script builds and deploys the app to Firebase Hosting

echo "🚀 Starting Firebase deployment process..."

# Step 1: Build the application
echo "📦 Building the application..."
npm run build

if [ $? -ne 0 ]; then
    echo "❌ Build failed! Please fix the errors and try again."
    exit 1
fi

# Step 2: Deploy to Firebase Hosting
echo "🔥 Deploying to Firebase Hosting..."
firebase deploy

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful! Your app is now live on Firebase Hosting."
    echo "🌐 Visit your app at: https://chess-logger.web.app"
else
    echo "❌ Deployment failed! Please check the errors above."
    exit 1
fi