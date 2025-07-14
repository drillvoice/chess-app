import struct

def create_png_icon(width, height, filename):
    # Create a basic PNG with blue background and white chess pattern
    pixels = []
    for y in range(height):
        row = []
        for x in range(width):
            # Create a simple pattern
            if (x // 20 + y // 20) % 2 == 0:
                row.extend([30, 64, 175])    # Blue
            else:
                row.extend([70, 120, 200])   # Light blue
        pixels.extend(row)
    
    # Create PNG manually with proper structure
    with open(filename, 'wb') as f:
        # PNG signature
        f.write(b'\x89PNG\r\n\x1a\n')
        
        # IHDR chunk
        ihdr = struct.pack('>2I5B', width, height, 8, 2, 0, 0, 0)
        f.write(struct.pack('>I', len(ihdr)))
        f.write(b'IHDR')
        f.write(ihdr)
        import zlib
        crc = zlib.crc32(b'IHDR' + ihdr) & 0xffffffff
        f.write(struct.pack('>I', crc))
        
        # IDAT chunk
        raw_data = b''
        for i in range(height):
            raw_data += b'\x00'  # No filter
            for j in range(width):
                idx = i * width + j
                raw_data += bytes([pixels[idx * 3], pixels[idx * 3 + 1], pixels[idx * 3 + 2]])
        
        compressed = zlib.compress(raw_data)
        f.write(struct.pack('>I', len(compressed)))
        f.write(b'IDAT')
        f.write(compressed)
        crc = zlib.crc32(b'IDAT' + compressed) & 0xffffffff
        f.write(struct.pack('>I', crc))
        
        # IEND chunk
        f.write(struct.pack('>I', 0))
        f.write(b'IEND')
        crc = zlib.crc32(b'IEND') & 0xffffffff
        f.write(struct.pack('>I', crc))

if __name__ == '__main__':
    create_png_icon(192, 192, 'icon-192.png')
    create_png_icon(512, 512, 'icon-512.png')
    print('Created PNG icons')
