import base64, pathlib, subprocess, sys
# Decode a stitch MCP download_file JSON result into a PNG on disk.
src, dst = sys.argv[1], sys.argv[2]
raw = pathlib.Path(src).read_text(encoding="utf-8")
import json
d = json.loads(raw)
if "image" in d:
    pathlib.Path(dst).write_bytes(base64.b64decode(d["image"]))
    print("png", dst, pathlib.Path(dst).stat().st_size)
else:
    print("no image; keys:", list(d.keys()))