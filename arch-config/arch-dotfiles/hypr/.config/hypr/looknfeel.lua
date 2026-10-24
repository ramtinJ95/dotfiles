-- Change the default Omarchy look'n'feel.
-- https://wiki.hypr.land/Configuring/Basics/Variables/

hl.config({
  general = {
    gaps_in = 5,
    gaps_out = { top = 4, right = 10, bottom = 10, left = 10 },
    layout = "master",
  },

  decoration = {
    blur = {
      enabled = true,
    },
  },

  misc = {
    -- Prevent new windows from stealing focus from the external monitor.
    focus_on_activate = false,
  },

  master = {
    orientation = "right",
    mfact = 0.63,
    new_status = "slave",
  },
})

-- Bind workspaces 1-5 to whichever external monitor is connected.
for _, monitor in ipairs({ "DP-7", "DP-1" }) do -- home BenQ, work Dell
  for workspace = 1, 5 do
    hl.workspace_rule({ workspace = tostring(workspace), monitor = monitor, default = workspace == 1 or nil })
  end
end
