"""Focused appearance-install fixtures; no live app, network or user configuration."""

import copy
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


spec = importlib.util.spec_from_file_location("look", Path(__file__).with_name("herdr-app-look.py"))
look = importlib.util.module_from_spec(spec)
spec.loader.exec_module(look)


class AppearanceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="herdr-look-test-")
        self.addCleanup(self.temporary.cleanup)
        self.home = Path(self.temporary.name)
        self.active = "main"
        self.calls = []
        self.put("installed.json", {"layout:main": {}})
        self.put("layouts/main.json", {
            "id": "root", "children": [
                {"id": "tabs", "content": {"mod": "tabs"}},
                {"id": "panel", "hidden": True},
            ], "floating": [{"id": "keep", "content": {"mod": "my-mod"}}],
        })
        self.put("mods/tabs/mod.json", {"title": "Tabs"})
        (self.home / "mods/tabs/main.js").write_text("element" + look.OLD_BORDER + ";\n")
        self.put("mods/terminal-chrome/mod.json", {"place": "none"})
        self.put("settings.json", {"theme": "local", "font_size": 19})
        self.put("shared.json", {"layout": "main", "private-state": "keep"})

    def put(self, path, value):
        destination = self.home / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(json.dumps(value))

    def command(self, *args):
        self.calls.append(args)
        if args == ("status",):
            return {"layout": self.active, "errors": []}
        if args[0] == "check":
            self.assertTrue((Path(args[1]) / "mod.json").exists())
            return
        self.assertEqual(args[0], "do")
        options = json.loads(args[2])
        if args[1] == "layout.clone":
            layout = json.loads((self.home / "layouts" / f'{options["name"]}.json').read_text())
            layout["cloned_from"] = {"name": options["name"], "version": "fixture"}
            self.put(f'layouts/{options["as"]}.json', layout)
            self.active = options["as"]
        elif args[1] == "mod.clone":
            shutil.copytree(self.home / "mods" / options["name"], self.home / "mods" / options["as"])
            self.put(f'mods/{options["as"]}/mod.json', {"cloned_from": {"name": "tabs"}})
        else:
            self.fail(f"unexpected app command: {args}")
        return {"ok": True}

    def snapshot(self):
        return {str(p.relative_to(self.home)): (p.read_bytes(), p.stat().st_mtime_ns)
                for p in self.home.rglob("*") if p.is_file()}

    def test_clean_machine_and_repeat_install(self):
        original = self.snapshot()
        look.configure(self.home, self.command)
        self.assertEqual(self.active, "main-personal")
        layout = json.loads((self.home / "layouts/main-personal.json").read_text())
        self.assertEqual(layout["children"][0]["content"]["mod"], "focus-tabs")
        self.assertIn(look.SLOT, layout["floating"])
        self.assertEqual(layout["floating"][0]["id"], "keep")
        self.assertTrue(layout["children"][1]["hidden"])
        self.assertIn(look.NEW_BORDER, (self.home / "mods/focus-tabs/main.js").read_text())
        for path in ["settings.json", "shared.json", "layouts/main.json", "mods/tabs/main.js"]:
            self.assertEqual(self.snapshot()[path], original[path], path)
        first = self.snapshot()
        self.calls.clear()
        look.configure(self.home, self.command)
        self.assertEqual(self.snapshot(), first, "rerun must not rewrite files")
        self.assertFalse(any(call[0] == "do" for call in self.calls))

    def test_existing_custom_layout_is_kept(self):
        self.active = "my-work"
        custom = json.loads((self.home / "layouts/main.json").read_text())
        custom["children"].append({"id": "nvim", "content": {"mod": "herdr-nvim"}})
        self.put("layouts/my-work.json", custom)
        look.configure(self.home, self.command)
        self.assertEqual(self.active, "my-work")
        result = json.loads((self.home / "layouts/my-work.json").read_text())
        self.assertEqual(result["children"][-1], custom["children"][-1])
        self.assertFalse((self.home / "layouts/main-personal.json").exists())

    def test_conflicting_tab_mod_or_slot_fails_without_changes(self):
        baseline = json.loads((self.home / "layouts/main.json").read_text())
        for kind in ["tabs", "slot"]:
            custom = copy.deepcopy(baseline)
            if kind == "tabs":
                custom["children"][0]["content"]["mod"] = "my-tabs"
            else:
                custom["floating"].append({"id": "terminal-chrome", "content": {"mod": "other"}})
            self.put("layouts/main.json", custom)
            before = self.snapshot()
            with self.assertRaises(ValueError):
                look.configure(self.home, self.command)
            self.assertEqual(before, self.snapshot())

    def test_unowned_focus_mod_is_not_changed(self):
        self.put("mods/focus-tabs/mod.json", {"title": "Mine"})
        self.put("mods/focus-tabs/main.js", "keep")
        before = self.snapshot()
        with self.assertRaisesRegex(ValueError, "not a clone"):
            look.configure(self.home, self.command)
        self.assertEqual(self.snapshot(), before)

    def test_upstream_source_change_fails_explicitly(self):
        for text in ["different tabs implementation", look.OLD_BORDER * 2]:
            with self.assertRaisesRegex(ValueError, "tabs source changed"):
                look.focus_tabs(text)

    def test_inactive_tabs_and_other_colors_are_untouched(self):
        source = f"tab{look.OLD_BORDER}.bg(t.raised).text_color(t.foreground)"
        self.assertEqual(look.focus_tabs(source), source.replace(look.OLD_BORDER, look.NEW_BORDER))

    def test_full_install_with_isolated_app_and_checkout(self):
        root = Path(__file__).resolve().parent.parent
        binaries = self.home / "bin"
        binaries.mkdir()
        for name in ["bash", "python3", "dirname", "basename", "mkdir", "readlink", "ln"]:
            (binaries / name).symlink_to(shutil.which(name))
        git = binaries / "git"
        git.write_text("#!/bin/sh\nexit 0\n")  # local checkout fixture; no network
        git.chmod(0o755)
        app = binaries / "herdr-app"
        app.write_text(f"#!{sys.executable}\n" +
                       "import runpy, sys\n" +
                       f"sys.argv = [{str(Path(__file__).resolve())!r}, '--fake-app', *sys.argv[1:]]\n" +
                       f"runpy.run_path({str(Path(__file__).resolve())!r}, run_name='__main__')\n")
        app.chmod(0o755)
        stuff = self.home / "stuff"
        (stuff / ".git").mkdir(parents=True)
        (stuff / "mods/example").mkdir(parents=True)
        (stuff / "mods/example/mod.json").write_text('{"title":"Example"}')
        (stuff / "mods/example/keys.json").write_text('{"global":{"ctrl-alt-x":"mod.open:example"}}')
        self.put("keys.json", {"global": {"ctrl-alt-x": "keep-my-binding"}})
        # The fixture's inert placeholder is replaced by the real installer's source link.
        shutil.rmtree(self.home / "mods/terminal-chrome")
        env = {**os.environ, "HOME": str(self.home), "PATH": str(binaries),
               "HERDR_APP_HOME": str(self.home), "HERDR_STUFF_DIR": str(stuff)}
        def install():
            return subprocess.run([str(root / "scripts/herdr-mods"), "install"], env=env,
                                  text=True, capture_output=True, timeout=30, check=True)
        result = install()
        self.assertIn("main-personal follows terminal themes", result.stdout)
        controller = self.home / "mods/terminal-chrome"
        self.assertTrue(controller.is_symlink())
        self.assertEqual(controller.resolve(), root / "common-config/herdr-app/mods/terminal-chrome")
        self.assertEqual(json.loads((self.home / "shared.json").read_text())["layout"], "main-personal")
        self.assertEqual(json.loads((self.home / "keys.json").read_text())["global"]["ctrl-alt-x"], "keep-my-binding")
        first = self.snapshot()
        install()
        self.assertEqual(first, self.snapshot())


def fake_app():
    """Only the CLI contract is faked; the installer, file edits and linking are real."""
    home = Path(os.environ["HERDR_APP_HOME"])
    args = sys.argv[2:]
    if args[0] == "status":
        print(json.dumps({"layout": json.loads((home / "shared.json").read_text())["layout"], "errors": []}))
    elif args[0] == "check":
        if not (Path(args[1]) / "mod.json").is_file():
            sys.exit("missing mod")
        print("fixture check passed")
    elif args[:2] == ["do", "mod.clone"]:
        options = json.loads(args[2])
        shutil.copytree(home / "mods" / options["name"], home / "mods" / options["as"])
        (home / "mods" / options["as"] / "mod.json").write_text(json.dumps({"cloned_from": {"name": options["name"]}}))
        print('{"ok":true}')
    elif args[:2] == ["do", "layout.clone"]:
        options = json.loads(args[2])
        layout = json.loads((home / "layouts" / f'{options["name"]}.json').read_text())
        layout["cloned_from"] = {"name": options["name"]}
        (home / "layouts" / f'{options["as"]}.json').write_text(json.dumps(layout))
        path = home / "shared.json"
        shared = json.loads(path.read_text())
        shared["layout"] = options["as"]
        path.write_text(json.dumps(shared))
        print('{"ok":true}')
    else:
        sys.exit(f"unexpected app command {args}")


if __name__ == "__main__":
    if sys.argv[1:2] == ["--fake-app"]:
        fake_app()
    else:
        unittest.main()
