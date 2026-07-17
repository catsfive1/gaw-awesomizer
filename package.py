"""GAW Awesomizer packager: validate manifest, publish unpacked dist dir +
versioned zip, mirror last-2 iterations to Google Drive archive (fail-soft)."""
import json
import os
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).parent
EXT_DIR = ROOT / "extension"
DIST_ROOT = Path(r"D:\AI\_PROJECTS\dist")
UNPACKED_DIR = DIST_ROOT / "gaw-awesomizer-dist" / "gaw-awesomizer"
DRIVE_ARCHIVE = Path(r"E:\My Drive\_PROJECTS\GAW-awesomizer")
KEEP_LAST_N = 2

SKIP_NAMES = {".DS_Store", "Thumbs.db"}


def validate_manifest():
    manifest_path = EXT_DIR / "manifest.json"
    data = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert data.get("manifest_version") == 3, "manifest_version must be 3"
    assert data.get("name"), "name is required"
    assert data.get("version"), "version is required"
    assert "background" in data and "service_worker" in data["background"], "background.service_worker required"
    assert data.get("content_scripts"), "content_scripts required"
    matches = [m for cs in data["content_scripts"] for m in cs.get("matches", [])]
    assert any("greatawakening.win" in m for m in matches), "must match greatawakening.win"
    assert any("patriots.win" in m for m in matches), "must match patriots.win"
    for f in ["background.js"] + [js for cs in data["content_scripts"] for js in cs.get("js", [])]:
        assert (EXT_DIR / f).exists(), f"referenced file missing: {f}"
    for size, path in data.get("icons", {}).items():
        assert (EXT_DIR / path).exists(), f"icon missing: {path}"
    return data


def publish_unpacked():
    if UNPACKED_DIR.exists():
        shutil.rmtree(UNPACKED_DIR)
    shutil.copytree(EXT_DIR, UNPACKED_DIR, ignore=shutil.ignore_patterns(*SKIP_NAMES))
    return UNPACKED_DIR


def build_zip(version):
    DIST_ROOT.mkdir(parents=True, exist_ok=True)
    zip_path = DIST_ROOT / f"gaw-awesomizer-v{version}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, dirs, files in os.walk(EXT_DIR):
            for name in files:
                if name in SKIP_NAMES:
                    continue
                full = Path(root) / name
                rel = full.relative_to(EXT_DIR)
                zf.write(full, arcname=str(rel))
    return zip_path


def mirror_to_drive_archive(zip_path, version):
    try:
        DRIVE_ARCHIVE.mkdir(parents=True, exist_ok=True)
        dest = DRIVE_ARCHIVE / zip_path.name
        shutil.copy2(zip_path, dest)
        existing = sorted(DRIVE_ARCHIVE.glob("gaw-awesomizer-v*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)
        pruned = 0
        for old in existing[KEEP_LAST_N:]:
            old.unlink()
            pruned += 1
        return f"[archive OK] {dest} (pruned {pruned} older)"
    except Exception as e:
        return f"[archive WARNING] Drive mirror skipped: {e}"


def main():
    manifest = validate_manifest()
    version = manifest["version"]
    unpacked = publish_unpacked()
    zip_path = build_zip(version)
    archive_report = mirror_to_drive_archive(zip_path, version)

    print(f"GAW Awesomizer v{version} packaged.")
    print(f"  Unpacked (load-unpacked target): {unpacked}")
    print(f"  Zip: {zip_path} ({zip_path.stat().st_size:,} bytes)")
    print(f"  {archive_report}")


if __name__ == "__main__":
    main()
