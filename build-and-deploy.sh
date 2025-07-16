#!/bin/bash

# Build and deploy with PWA Builder fixes
echo "Building application for PWA Builder compliance..."

# Build the app
npm run build

# Check if build was successful
if [ $? -ne 0 ]; then
    echo "Build failed! Please fix the errors and try again."
    exit 1
fi

# Copy the fixed manifest to the build directory
cp public/manifest.json dist/public/manifest.json

echo "Build completed successfully!"
echo "To deploy to Firebase, run:"
echo "  firebase deploy --only hosting --project chess-logger"
echo ""
echo "After deployment, test manifest at:"
echo "  https://chess-logger.web.app/manifest.json"