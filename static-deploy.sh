#!/bin/bash

# Quick Firebase Hosting Deployment for Static Frontend Only
# This deploys the app as a pure client-side static app

echo "🚀 Quick Firebase Hosting deployment..."

# Create a simple static build directory
mkdir -p static-build

# Copy all the necessary static files from public directory
cp -r public/* static-build/ 2>/dev/null || echo "No public directory found"

# Create a simple index.html that loads the app
cat > static-build/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chess Training Logger</title>
    <link rel="manifest" href="/manifest.json">
    <link rel="icon" type="image/svg+xml" href="/icon-192.svg">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            max-width: 400px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            text-align: center;
        }
        .message {
            text-align: center;
            color: #666;
            margin: 20px 0;
        }
        .redirect-button {
            background: #1976d2;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
            font-size: 16px;
        }
        .redirect-button:hover {
            background: #1565c0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Chess Training Logger</h1>
        <div class="message">
            <p>Your chess training app is being prepared for deployment.</p>
            <p>This is a static deployment test page.</p>
        </div>
        <button class="redirect-button" onclick="window.location.href='/'">
            Access Training App
        </button>
    </div>
    
    <script>
        // Simple PWA registration
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js');
        }
        
        // Firebase configuration
        const firebaseConfig = {
            apiKey: "AIzaSyAi_YUEMC5-9-iSKChB2TBCor9hU3b5oDI",
            authDomain: "chess-logger.firebaseapp.com",
            projectId: "chess-logger",
            storageBucket: "chess-logger.firebasestorage.app",
            messagingSenderId: "174377329737",
            appId: "1:174377329737:web:003bfcbb44e2700e290b98"
        };
        
        console.log('Firebase config loaded:', firebaseConfig);
    </script>
</body>
</html>
EOF

# Update firebase.json to use static-build directory
cat > firebase.json << 'EOF'
{
  "hosting": {
    "public": "static-build",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
EOF

echo "📁 Static build created in static-build/"
echo "🔥 Deploying to Firebase Hosting..."

# Deploy to Firebase Hosting
firebase deploy --only hosting --project chess-logger

if [ $? -eq 0 ]; then
    echo "✅ Static deployment successful!"
    echo "🌐 Visit: https://chess-logger.web.app"
else
    echo "❌ Deployment failed!"
fi