from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root=Path(__file__).resolve().parents[1]
target=root/'public/source/kinnsoos-source.zip'
target.parent.mkdir(parents=True,exist_ok=True)
with ZipFile(target,'w',ZIP_DEFLATED) as archive:
    for item in sorted(root.rglob('*')):
        relative=item.relative_to(root)
        if not item.is_file() or any(p in {'node_modules','.next','.git','evidence'} for p in relative.parts): continue
        if str(relative).startswith('public/source/') or item.name.endswith('.tsbuildinfo'): continue
        if item.name.startswith('.env') and item.name!='.env.example': continue
        archive.write(item,relative)
print('Corresponding source:',target.name)
