#!/bin/bash
# Create a simple PNG icon using ImageMagick if available, otherwise copy temp
if command -v convert &> /dev/null; then
    echo "Using ImageMagick to create PNG icons"
    convert -size 192x192 xc:'#1E40AF' icon-192.png
    convert -size 512x512 xc:'#1E40AF' icon-512.png
else
    echo "Creating basic PNG icons"
    # Copy the temp PNG multiple times to create larger files
    cp temp.png icon-192.png
    cp temp.png icon-512.png
fi
