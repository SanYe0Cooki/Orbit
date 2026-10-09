#!/usr/bin/env python
"""Derive any missing icon densities from the 1024px master assets.

make-icons.py generates the full set; this helper only fills gaps (for example
the 48px mdpi Android launcher icon) so install-assets.mjs always finds a source.

Usage: python assets/derive-missing-icons.py
"""
import os
from PIL import Image

ASSETS = os.path.dirname(os.path.abspath(__file__))

# (output name, master file, box)  box=None means scale the whole image.
# The -android variants carry the rounded-square background; the plain ones fill
# the square edge to edge (what iOS and the store listings expect).
JOBS = [
    ('icon-48-android.png', 'icon-1024-android.png', None),
    ('icon-48.png', 'icon-1024.png', None),
]

made = []
for out_name, master_name, box in JOBS:
    out_path = os.path.join(ASSETS, out_name)
    if os.path.exists(out_path):
        print('skip   %s (already present)' % out_name)
        continue
    master_path = os.path.join(ASSETS, master_name)
    if not os.path.exists(master_path):
        print('MISS   %s needs %s' % (out_name, master_name))
        continue
    image = Image.open(master_path).convert('RGBA')
    if box:
        image = image.crop(box)
    size = int(out_name.split('-')[1].replace('.png', ''))
    resized = image.resize((size, size), Image.LANCZOS)
    resized.save(out_path, 'PNG', optimize=True)
    made.append((out_name, size, os.path.getsize(out_path)))
    print('wrote  %s (%dx%d, %d bytes)' % (out_name, size, size, os.path.getsize(out_path)))

print('')
print('derived %d file(s)' % len(made))
