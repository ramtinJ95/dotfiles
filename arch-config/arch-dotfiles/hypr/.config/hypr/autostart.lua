-- Extra autostart processes.
-- o.launch_on_start("my-service")

-- Workaround for omacom/omarchy#16941: Omarchy 4.5.0's startup cursor disables
-- hyprcursor before its style loads, then re-enables it without loading one,
-- so Hyprland 0.56.2 segfaults on every cold login (null cairo surface in
-- setCursorFromName). Fixed upstream by omacom/omarchy#17999 (removes the
-- feature); delete this once on a release that includes it (4.5.1+).
omarchy_startup_cursor_pending = false
