# Puts the online modes back into index.html after someone replaces the whole file.
# The online code itself lives in online.js; index.html only needs the line that loads it (and the warning comment).
import re, sys

TAG = '<script src="online.js"></script>'
WARN = '''<!-- HELLBALL: the online modes (1V1 ONLINE, KING OF THE HILL) live in online.js, loaded by the line just before </body>.
     When you edit or replace this file, KEEP that <script src="online.js"></script> line, and keep these game names unchanged:
     hud step doServe goMenu fmStep fmOn clickServe serveStep strike reset show MODE st ball pad (full list at the top of online.js).
     Do not paste online code into this file. -->'''

raw = open("index.html", "rb").read().decode("utf-8")
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")
changed = []

if "online.js" not in s:
    i = s.lower().rfind("</body>")
    s = (s[:i] + "\n" + TAG + s[i:]) if i >= 0 else (s.rstrip("\n") + "\n" + TAG + "\n")
    changed.append("restored the online.js line")

if "live in online.js" not in s:
    m = re.match(r"\s*<!doctype[^>]*>\n?", s, re.I)
    at = m.end() if m else 0
    s = s[:at] + WARN + "\n" + s[at:]
    changed.append("restored the warning comment")

if changed:
    open("index.html", "wb").write(s.replace("\n", nl).encode("utf-8"))
    print("; ".join(changed))
else:
    print("index.html already loads online.js - nothing to do")
