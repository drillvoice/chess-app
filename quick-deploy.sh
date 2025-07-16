#!/bin/bash

# Quick deployment script to update Firebase hosting configuration
# This deploys only the hosting configuration changes without rebuilding

echo "🔧 Deploying Firebase hosting configuration changes..."

# Deploy only hosting configuration
firebase deploy --only hosting --project chess-logger

if [ $? -eq 0 ]; then
    echo "✅ Configuration deployed successfully!"
    echo "🌐 Testing manifest.json URL..."
    curl -I https://chess-logger.web.app/manifest.json
    echo ""
    echo "📱 Your manifest.json should now be accessible for Bubblewrap:"
    echo "   https://chess-logger.web.app/manifest.json"
else
    echo "❌ Deployment failed! Please check the errors above."
    exit 1
fi