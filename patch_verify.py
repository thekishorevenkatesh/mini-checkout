import sys
sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', buffering=1)
src = open('client/src/pages/PublicStorePage.tsx', 'r', encoding='utf-8').read()
checks = [
    ('showCart state', 'const [showCart'),
    ('cartCount', 'const cartCount ='),
    ('openVariantPopup fn', 'function openVariantPopup'),
    ('handlePopupAddToCart fn', 'function handlePopupAddToCart'),
    ('Cart drawer', 'Cart Drawer'),
    ('Variant popup', 'Variant Selection Popup'),
    ('File upload', 'type="file" accept="image'),
    ('cartBtn in header', 'Open cart'),
    ('ADD popup trigger', 'openVariantPopup(product._id)'),
    ('single col layout', 'px-3 py-6 sm:px-5 sm:py-10"'),
    ('no grid cols', 'lg:grid-cols-3' not in src),
    ('screenshotFile state', 'screenshotFile, setScreenshotFile'),
]
for name, needle in checks:
    if isinstance(needle, bool):
        print(name, 'OK' if needle else 'MISSING')
    else:
        print(name, 'OK' if needle in src else 'MISSING')
print('Total lines:', src.count('\n'))
