"""Install personal Herdr appearance/navigation without editing shipped files.

Usage: herdr-app-look.py <app home>
The app must be running. No settings, theme palettes or session state are copied.
"""

import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile


SLOT = {
    "id": "terminal-chrome",
    "content": {"mod": "terminal-chrome", "props": {"enabled": True}},
    "edge": "bottom", "align": "end",
}
OLD_BORDER = ".border_color(c.active ? t.border : t.chrome)"
NEW_BORDER = ".border_color(c.active ? t.accent : t.chrome)"
NAV_IMPORT = 'import { NavigationController } from "./navigation/controller.js";\n'
NAV_INIT = '  init(_props, cx) {\n    this.navigation = new NavigationController(cx);\n'
NAV_RENDER = '  render() {\n    this.navigation.observe();\n'


def personal_layout(layout):
    result = copy.deepcopy(layout)
    found = []

    def visit(node):
        if node.get("id") == "tabs":
            if node.get("content", {}).get("mod") not in ("tabs", "focus-tabs"):
                raise ValueError("tabs block uses a custom mod; refusing to replace it")
            node["content"]["mod"] = "focus-tabs"
            found.append(node)
        for child in node.get("children", []):
            visit(child)

    visit(result)
    if len(found) != 1:
        raise ValueError("expected one main-style tabs block; select Herdr's main layout first")
    floating = result.setdefault("floating", [])
    slots = [slot for slot in floating if slot.get("id") == SLOT["id"]]
    if slots and slots != [SLOT]:
        raise ValueError("terminal-chrome floating slot already exists with different settings")
    if not slots:
        floating.append(copy.deepcopy(SLOT))
    return result


def focus_tabs(source):
    if source.count(OLD_BORDER) == 1 and NEW_BORDER not in source:
        return source.replace(OLD_BORDER, NEW_BORDER)
    if source.count(NEW_BORDER) == 1 and OLD_BORDER not in source:
        return source
    raise ValueError("tabs source changed: cannot locate the active-tab border; update the appearance installer")


def navigation_tabs(source):
    if NAV_IMPORT in source:
        if NAV_INIT not in source or NAV_RENDER not in source:
            raise ValueError("focus-tabs has an incomplete navigation integration")
        return source
    if source.count("  init() {\n") != 1 or source.count("  render() {\n") != 1:
        raise ValueError("tabs lifecycle changed: cannot attach navigation safely")
    return NAV_IMPORT + source.replace("  init() {\n", NAV_INIT).replace("  render() {\n", NAV_RENDER)


def navigation_assets(mod):
    destination = mod / "navigation"
    marker = destination / ".dotfiles-owned"
    if destination.exists():
        if destination.is_symlink() or not marker.is_file() or marker.read_text() != "herdr-navigation\n":
            raise ValueError("focus-tabs/navigation exists but is not owned by dotfiles")
    else:
        destination.mkdir()
        marker.write_text("herdr-navigation\n")
    source = Path(__file__).resolve().parent.parent / "common-config/herdr-app/mods/navigation"
    for name in ("controller.js", "model.js"):
        path = destination / name
        wanted = (source / name).read_text()
        if path.exists():
            replace(path, path.read_text(), wanted)
        else:
            with path.open("x") as output:
                output.write(wanted)


def replace(path, source, next_text):
    if source == next_text:
        return
    if path.is_symlink() or path.read_text() != source:
        raise ValueError(f"{path} changed or is a symlink; refusing to overwrite it")
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.")
    try:
        os.chmod(temporary, path.stat().st_mode & 0o777)
        with os.fdopen(fd, "w") as output:
            output.write(next_text)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def configure(home, command):
    status = command("status")
    if status.get("errors"):
        raise ValueError("Herdr has configuration errors: " + "; ".join(status["errors"]))
    name = status["layout"]
    if Path(name).name != name:
        raise ValueError("invalid layout name from Herdr")
    manifest = json.loads((home / "installed.json").read_text())
    path = home / "layouts" / f"{name}.json"
    layout = json.loads(path.read_text())
    # Preflight before creating anything. Preserve custom layouts and all their panels.
    personal_layout(layout)
    clone_layout = False
    if f"layout:{name}" in manifest:
        if name != "main":
            raise ValueError("select Herdr's main layout before installing these tweaks")
        name = "main-personal"
        path = home / "layouts" / f"{name}.json"
        if path.exists():
            raise ValueError("main-personal already exists; select it explicitly and rerun")
        clone_layout = True

    mod = home / "mods" / "focus-tabs"
    if not mod.exists():
        command("do", "mod.clone", json.dumps({"name": "tabs", "as": "focus-tabs"}))
    metadata = json.loads((mod / "mod.json").read_text())
    if metadata.get("cloned_from", {}).get("name") != "tabs":
        raise ValueError("focus-tabs exists but is not a clone of tabs; refusing to modify it")
    source = (mod / "main.js").read_text()
    next_source = navigation_tabs(focus_tabs(source))
    navigation_assets(mod)
    replace(mod / "main.js", source, next_source)
    command("check", str(mod))
    command("check", str(home / "mods" / "terminal-chrome"))
    command("check", str(home / "mods" / "navigation"))

    if clone_layout:
        command("do", "layout.clone", json.dumps({"name": "main", "as": name}))
    source = path.read_text()
    layout = json.loads(source)
    next_layout = personal_layout(layout)
    if next_layout != layout:
        replace(path, source, json.dumps(next_layout, indent=2, ensure_ascii=False) + "\n")
    print(f"OK: {name} follows terminal themes; active tabs use the focus accent; navigation enabled")


def main():
    home = Path(sys.argv[1]).resolve()

    def command(*args):
        result = subprocess.run(
            ["herdr-app", *args], env={**os.environ, "HERDR_APP_HOME": str(home)},
            text=True, capture_output=True, timeout=15,
        )
        if result.returncode:
            raise ValueError(f"herdr-app {args[0]}: {result.stderr.strip() or result.stdout.strip()}")
        if args[0] == "check":
            return None
        value = json.loads(result.stdout)
        if value.get("ok") is False:
            raise ValueError(result.stdout)
        return value

    try:
        configure(home, command)
    except (ValueError, OSError, KeyError, subprocess.SubprocessError) as error:
        sys.exit(f"FAIL: Herdr appearance setup: {error}. Keep the Herdr app open and retry.")


if __name__ == "__main__":
    main()
