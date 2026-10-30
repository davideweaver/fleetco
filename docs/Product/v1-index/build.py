"""Build index.html from index.template.html and the media each section produced.

Reads ../v1-video/flows/*/manifest.json, copies shared videos into media/, makes a
480px JPEG thumbnail for every video and picture in media/thumbs/, and fills in MEDIA.
Also writes files.json: the media paths to publish alongside the page.
"""
import json, pathlib, shutil, subprocess

here = pathlib.Path(__file__).parent
video_dir = here.parent / "v1-video"
media = here / "media"
thumbs = media / "thumbs"
thumbs.mkdir(parents=True, exist_ok=True)

# Videos that live in v1-video/ rather than being written straight to media/.
shutil.copyfile(video_dir / "v1-walkthrough.mp4", media / "overview.mp4")
shutil.copyfile(video_dir / "doing-the-job.mp4", media / "doing-the-job.mp4")


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout
    return float(out)


def thumb(src, dest, at=None):
    args = ["ffmpeg", "-loglevel", "error", "-y"]
    if at is not None:
        args += ["-ss", f"{at:.2f}"]
    subprocess.run(args + ["-i", str(src), "-frames:v", "1", "-vf", "scale=480:-1", "-q:v", "5", str(dest)], check=True)


thumb(media / "overview.mp4", thumbs / "overview.jpg", at=60)
entries = {}
for manifest in sorted(video_dir.glob("flows/*/manifest.json")):
    for e in json.loads(manifest.read_text()):
        src = media / e["file"]
        if not src.exists():
            print("missing", src)
            continue
        item = {"kind": e["kind"], "file": e["file"]}
        if e["kind"] == "video":
            item["seconds"] = round(duration(src))
            thumb(src, thumbs / f"{e['key']}.jpg", at=duration(src) * 0.45)
        else:
            thumb(src, thumbs / f"{e['key']}.jpg")
        entries[e["key"]] = item

page = (here / "index.template.html").read_text().replace("{{MEDIA}}", json.dumps(entries, sort_keys=True))
(here / "index.html").write_text(page)
files = sorted({f"media/{e['file']}" for e in entries.values()} | {f"media/thumbs/{k}.jpg" for k in entries}
               | {"media/overview.mp4", "media/thumbs/overview.jpg"})
(here / "files.json").write_text(json.dumps(files, indent=1))
print(len(entries), "media entries:", ", ".join(sorted(entries)))
