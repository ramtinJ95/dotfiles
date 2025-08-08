# Path to your oh-my-zsh installation.
export ZSH="$HOME/.oh-my-zsh"
export EZA_CONFIG_DIR="/Users/ramtinjavanmardi/.config/eza"
export XDG_CONFIG_HOME=/Users/ramtinjavanmardi/.config

plugins=(git fzf)

source $ZSH/oh-my-zsh.sh
PROMPT='%~ %# '
DISABLE_AUTO_TITLE=true

bindkey '^ ' autosuggest-accept
source $(brew --prefix)/share/zsh-autosuggestions/zsh-autosuggestions.zsh

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

eval "$(starship init zsh)"
eval "$(zoxide init zsh)"
# Created by `pipx` on 2024-08-14 10:33:54
export PATH="$PATH:/Users/ramjav/.local/bin"
export CPATH=/opt/homebrew/include:$CPATH
export LIBRARY_PATH=/opt/homebrew/lib:$LIBRARY_PATH

alias cursor="/Applications/Cursor.app/Contents/MacOS/Cursor"
alias vim="nvim"

# Created by `pipx` on 2025-06-28 08:41:46
export PATH="$PATH:/Users/ramtinjavanmardi/.local/bin"

export PATH=$PATH:/Users/ramtinjavanmardi/.spicetify
