#!/usr/bin/env python3

from PIL import Image
import os

def create_icon_sizes():
    # Open the source icon
    source = "public/pawnstar-icon-new.png"
    
    if not os.path.exists(source):
        print(f"Error: Source file {source} not found")
        return
    
    # Load the image
    img = Image.open(source)
    
    # Convert to RGBA if not already
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    # PWA icon sizes needed
    sizes = [
        (16, 16),
        (32, 32), 
        (48, 48),
        (72, 72),
        (96, 96),
        (120, 120),
        (144, 144),
        (152, 152),
        (180, 180),
        (192, 192),
        (512, 512)
    ]
    
    print("Creating PWA icon sizes...")
    
    for width, height in sizes:
        # Resize with high quality
        resized = img.resize((width, height), Image.Resampling.LANCZOS)
        
        # Save the resized icon
        filename = f"public/icon-{width}x{height}.png"
        resized.save(filename, "PNG", optimize=True)
        print(f"✓ Created {filename}")
    
    # Also create the simplified names for manifest
    img.resize((192, 192), Image.Resampling.LANCZOS).save("public/icon-192.png", "PNG", optimize=True)
    img.resize((512, 512), Image.Resampling.LANCZOS).save("public/icon-512.png", "PNG", optimize=True)
    
    print("✓ Created icon-192.png")
    print("✓ Created icon-512.png")
    print("All PWA icons generated successfully!")

if __name__ == "__main__":
    create_icon_sizes()