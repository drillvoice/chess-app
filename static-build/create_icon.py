import struct

def create_png_icon(width, height, filename):
    # Create a simple blue square with white chess pattern
    pixels = []
    for y in range(height):
        row = []
        for x in range(width):
            # Create checkerboard pattern in center
            if 20 <= x < width-20 and 20 <= y < height-20:
                board_x = (x - 20) // ((width-40) // 8)
                board_y = (y - 20) // ((height-40) // 8)
                if (board_x + board_y) % 2 == 0:
                    row.extend([255, 255, 255])  # White
                else:
                    row.extend([30, 64, 175])    # Blue
            else:
                row.extend([30, 64, 175])        # Blue background
        pixels.extend(row)
    
    # Simple PNG creation
    with open(filename, 'wb') as f:
        # PNG signature
        f.write(b'\x89PNG\r\n\x1a\n')
        
        # IHDR chunk
        ihdr = struct.pack('>2I5B', width, height, 8, 2, 0, 0, 0)
        f.write(struct.pack('>I', len(ihdr)))
        f.write(b'IHDR')
        f.write(ihdr)
        crc = 0
        f.write(struct.pack('>I', crc))
        
        # IDAT chunk (simplified)
        import zlib
        raw_data = b''.join([b'\x00' + bytes(pixels[i:i+width*3]) for i in range(0, len(pixels), width*3)])
        compressed = zlib.compress(raw_data)
        f.write(struct.pack('>I', len(compressed)))
        f.write(b'IDAT')
        f.write(compressed)
        f.write(struct.pack('>I', 0))
        
        # IEND chunk
        f.write(struct.pack('>I', 0))
        f.write(b'IEND')
        f.write(struct.pack('>I', 0))

create_png_icon(192, 192, 'icon-192.png')
create_png_icon(512, 512, 'icon-512.png')
print('Created PNG icons')
