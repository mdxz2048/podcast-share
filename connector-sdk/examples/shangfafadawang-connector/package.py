"""Build an uploadable connector ZIP without credentials or runtime state."""
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parent
repo = root.parents[2]
destination = repo / "upload-ready/shangfafadawang-xet-1.1.1.zip"
files = ["manifest.yaml", "README.md", "requirements.lock", "src/connector.py", "scripts/xet.py", "scripts/wx_login.py"]
destination.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / name, name)
print(destination)
