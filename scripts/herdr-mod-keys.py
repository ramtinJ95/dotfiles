"""Adds Herdr mods' key bindings to the app's keys.json.

Usage: herdr-mod-keys.py <app keys.json> <mod keys.json>...

A key the person has not bound is added. A key already bound to the same action is left as it is. A key bound to
something else keeps the person's action and is reported, never replaced. The file is rewritten only when a key was
added, atomically. Note that Herdr treats any edit as making keys.json the person's own: it then stops adding new
default shortcuts to it on upgrade.
"""

import json
import os
import sys
import tempfile


def main(app_path, mod_paths):
    with open(app_path, encoding="utf-8") as f:
        app = json.load(f)
    added = []
    for mod_path in mod_paths:
        with open(mod_path, encoding="utf-8") as f:
            wanted = json.load(f)
        for section, bindings in wanted.items():
            have = app.setdefault(section, {})
            for key, action in bindings.items():
                if key not in have:
                    have[key] = action
                    added.append(f"{section} {key} -> {action}")
                elif have[key] != action:
                    print(f"WARN: {section} {key} stays {have[key]!r}; {os.path.basename(os.path.dirname(mod_path))} wanted {action!r}", file=sys.stderr)
    if not added:
        print("OK: mod key bindings already present")
        return
    directory = os.path.dirname(os.path.abspath(app_path))
    fd, tmp = tempfile.mkstemp(dir=directory, prefix=".keys.", suffix=".json")
    try:
        os.chmod(tmp, os.stat(app_path).st_mode & 0o777)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(app, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, app_path)
    except BaseException:
        os.unlink(tmp)
        raise
    for line in added:
        print(f"==> bind {line}")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2:])
