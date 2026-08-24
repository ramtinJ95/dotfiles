local colors = dofile("/Users/ramtin/.config/macarchy/current/generated/sketchybar.lua")

colors.with_alpha = function(color, alpha)
  if alpha > 1.0 or alpha < 0.0 then return color end
  return (color & 0x00ffffff) | (math.floor(alpha * 255.0) << 24)
end

return colors
