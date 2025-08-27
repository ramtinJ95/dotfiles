# All the default Omarchy aliases and functions
# (don't mess with these directly, just overwrite them here!)

# This export line has to be here to ignore a bs warning from zoxide each time i use it
# that warning is simply because i have added startship and then zoxide is not the last thing
# that happens anymore which it does not like
export _ZO_DOCTOR=0
source ~/.local/share/omarchy/default/bash/rc
source -- ~/share/blesh/ble.sh
# Add your own exports, aliases, and functions here.
#
# Make an alias for invoking commands you use constantly
# alias p='python'
#
# Use VSCode instead of neovim as your default editor
# export EDITOR="code"
#
# Set a custom prompt with the directory revealed (alternatively use https://starship.rs)
# PS1="\W \[\e]0;\w\a\]$PS1"

# Battery information alias
alias battime='upower -i $(upower -e | grep "BAT") | grep "time to empty" | awk "{print \$4\" \"\$5}"'
alias batinfo='sudo tlp-stat -b && echo "Time remaining:" && upower -i $(upower -e | grep 'BAT') | grep "time to empty"'
alias battery='upower -i $(upower -e | grep "BAT")'

# System Performance profiles
# Show current performance profile
alias tlp-prof='echo -n "Platform: "; cat /sys/firmware/acpi/platform_profile; echo -n "Boost: "; cat /sys/devices/system/cpu/cpufreq/boost; echo -n "CPU min: "; cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_min_freq; echo -n "CPU max: "; cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_max_freq'
# ⚡ Performance (min 1.1 GHz, max 4.77 GHz, boost on)
alias tlp-perf='echo performance | sudo tee /sys/firmware/acpi/platform_profile; \
                echo 1100000 | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_min_freq; \
                echo 4769852 | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_max_freq; \
                echo 1 | sudo tee /sys/devices/system/cpu/cpufreq/boost; \
                echo "⚡ Performance mode"'

# 🔋 Balanced (min 0.8 GHz, max 3.5 GHz, boost on)
alias tlp-bal='echo balanced | sudo tee /sys/firmware/acpi/platform_profile; \
               echo 800000 | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_min_freq; \
               echo 3500000 | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_max_freq; \
               echo 1 | sudo tee /sys/devices/system/cpu/cpufreq/boost; \
               echo "🔋 Balanced mode"'

# 💤 Power Saver (min 0.6 GHz, max 2.7 GHz, boost off)
alias tlp-save='echo low-power | sudo tee /sys/firmware/acpi/platform_profile; \
                echo 600000 | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_min_freq; \
                echo 2700000 | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_max_freq; \
                echo 0 | sudo tee /sys/devices/system/cpu/cpufreq/boost; \
                echo "💤 Power Saver mode"'
# Git aliases
alias ga='git add'
alias gaa='git add --all'
alias gc='git commit'
alias gdif='git diff --word-diff'

# Neovim aliases
alias vim='nvim'
alias n='nvim'

# eza (better 'ls')
alias ls='eza --icons'
alias ll='eza -lg --icons'
alias lz='eza -lag --icons'
alias lt='eza -lTg --icons'
alias lt1='eza -lTg --level=1 --icons'
alias lt2='eza -lTg --level=2 --icons'
alias lt3='eza -lTg --level=3 --icons'
alias lta='eza -lTag --icons'
alias lta1='eza -lTag --level=1 --icons'
alias lta2='eza -lTag --level=2 --icons'
alias lta3='eza -lTag --level=3 --icons'

# Random c++ alias to make my life easier
alias cr='cmake --build build && ./build/main'

# Qualtiy of life aliases
alias oc='opencode'
# Function for yazi to put you in the directory you have navigated to
# when exiting yazi
function y() {
  local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
  yazi "$@" --cwd-file="$tmp"
  IFS= read -r -d '' cwd <"$tmp"
  [ -n "$cwd" ] && [ "$cwd" != "$PWD" ] && builtin cd -- "$cwd"
  rm -f -- "$tmp"
}

ssh_auth() {
  # Location to store ssh-agent environment variables
  AGENT_ENV="$HOME/.ssh/agent_env"

  # Check if agent is already running
  if [ -f "$AGENT_ENV" ]; then
    source "$AGENT_ENV" >/dev/null 2>&1
    if ! ps -p "$SSH_AGENT_PID" >/dev/null 2>&1; then
      echo "Old ssh-agent not running, starting a new one..."
      eval "$(ssh-agent -s)" >"$AGENT_ENV"
    else
      echo "ssh-agent already running (PID $SSH_AGENT_PID)"
    fi
  else
    echo "Starting ssh-agent..."
    eval "$(ssh-agent -s)" >"$AGENT_ENV"
  fi

  # Add key if not already loaded
  ssh-add -l >/dev/null 2>&1
  if [ $? -ne 0 ]; then
    echo "Adding SSH key..."
    ssh-add ~/.ssh/id_ed25519
  else
    echo "SSH key already added"
  fi
}

eval "$(starship init bash)"

export NVM_DIR="$HOME/.config/nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"                   # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" # This loads nvm bash_completion

export PATH=$PATH:/home/ramtin/.spicetify

. "$HOME/.local/share/../bin/env"
