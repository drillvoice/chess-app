#!/bin/bash
# Create a simple mobile screenshot PNG
if command -v convert &> /dev/null; then
    echo "Using ImageMagick to create screenshot"
    convert -size 360x640 xc:'#f8fafc' \
        -fill '#1E40AF' -draw "rectangle 0,0 360,80" \
        -fill '#ffffff' -pointsize 24 -annotate +120+50 "Pawn Star Chess Log" \
        -fill '#000000' -pointsize 16 -annotate +50+150 "Track your chess training sessions" \
        -fill '#1E40AF' -draw "rectangle 50,200 310,240" \
        -fill '#ffffff' -pointsize 14 -annotate +160+225 "Add Session" \
        screenshot-mobile.png
else
    echo "Creating basic screenshot"
    # Copy the basic PNG and rename it
    cp temp.png screenshot-mobile.png
fi
