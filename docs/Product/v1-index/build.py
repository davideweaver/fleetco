"""Inline the thumbnail JPEGs into index.template.html -> index.html."""
import base64, pathlib, re
here = pathlib.Path(__file__).parent
src = (here / "index.template.html").read_text()
def sub(m):
    data = base64.b64encode((here / "thumbs" / f"{m.group(1)}.jpg").read_bytes()).decode()
    return f"data:image/jpeg;base64,{data}"
(here / "index.html").write_text(re.sub(r"\{\{IMG:(\w+)\}\}", sub, src))
