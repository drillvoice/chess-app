#!/usr/bin/env python3
"""Convert the PawnStar icon to required PWA icon sizes"""

from PIL import Image
import os

# Open the source image
source_path = "pawnstar-icon.jpg"
source_image = Image.open(source_path)

# Convert to RGB if needed (for PNG output)
if source_image.mode != 'RGB':
    source_image = source_image.convert('RGB')

# Icon sizes needed for PWA/Android
sizes = [
    (192, 192),  # Standard PWA icon
    (512, 512),  # Large PWA icon
    (180, 180),  # iOS
    (152, 152),  # iPad
    (144, 144),  # Android
    (120, 120),  # iPhone
    (96, 96),    # Android
    (72, 72),    # Android
    (48, 48),    # Android
    (32, 32),    # Favicon
    (16, 16)     # Favicon
]

print("Converting PawnStar icon to multiple sizes...")

for width, height in sizes:
    # Resize the image
    resized = source_image.resize((width, height), Image.Resampling.LANCZOS)
    
    # Save as PNG
    png_path = f"icon-{width}x{height}.png"
    resized.save(png_path, 'PNG', optimize=True)
    print(f"Created: {png_path}")

# Create the main icon files
main_sizes = [(192, 192), (512, 512)]
for width, height in main_sizes:
    resized = source_image.resize((width, height), Image.Resampling.LANCZOS)
    
    # Save as PNG
    png_path = f"icon-{width}.png"
    resized.save(png_path, 'PNG', optimize=True)
    print(f"Created: {png_path}")

print("Icon conversion complete!")