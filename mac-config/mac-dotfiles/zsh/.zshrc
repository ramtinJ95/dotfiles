export EZA_CONFIG_DIR="$HOME/.config/eza"
export XDG_CONFIG_HOME="$HOME/.config"
export BAT_THEME="Catppuccin Mocha"
export EDITOR="nvim"

setopt SHARE_HISTORY

bindkey '^y' autosuggest-accept
source $(brew --prefix)/share/zsh-autosuggestions/zsh-autosuggestions.zsh

# Yazi function for cwd changes when moving around filesystem
function y() {
	local tmp="$(mktemp -t "yazi-cwd.XXXXXX")" cwd
	yazi "$@" --cwd-file="$tmp"
	IFS= read -r -d '' cwd < "$tmp"
	[ -n "$cwd" ] && [ "$cwd" != "$PWD" ] && builtin cd -- "$cwd"
	rm -f -- "$tmp"
}

# Neovim aliases
alias vim='nvim'
alias n='nvim'

# Git aliases
alias gs='git status'
alias gp='git push'
alias gpl='git pull'
alias gaa='git add .'
alias gc='git commit --verbose'
alias gcm='git checkout main && git pull'

# eza (better 'ls')
alias ls='eza --icons'
alias lsa='eza -a -lg --icons'
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
alias cr='cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DCMAKE_EXPORT_COMPILE_COMMANDS=ON && cmake --build build && ./build/main'

# Quality of life aliases
alias ..='cd ..'
alias ...='cd ../..'
alias py='python3'
alias decompress='tar -xvf'
alias compress='tar -cvf'

function control() {
	local target="$1" host

	case "$target" in
		macmini|ramtins-mac-mini)
			host="ramtins-mac-mini.tailc817d3.ts.net"
			;;
		"")
			echo "usage: control macmini"
			return 2
			;;
		*)
			host="$(ssh -G "$target" 2>/dev/null | awk '/^hostname / { print $2; exit }')"
			[[ -z "$host" ]] && host="$target"
			;;
	esac

	open "vnc://$host"
}

eval "$(starship init zsh)"
eval "$(zoxide init zsh)"
# Created by `pipx` on 2024-08-14 10:33:54
export PATH="$PATH:$HOME/.local/bin"
export CPATH=/opt/homebrew/include:$CPATH
export LIBRARY_PATH=/opt/homebrew/lib:$LIBRARY_PATH


# Created by `pipx` on 2025-06-28 08:41:46
export PATH="$PATH:$HOME/.local/bin"

export PATH="$PATH:$HOME/.spicetify"

source /opt/homebrew/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh

# fzf key bindings and completions
source /opt/homebrew/opt/fzf/shell/key-bindings.zsh
source /opt/homebrew/opt/fzf/shell/completion.zsh

# added by Snowflake SnowflakeCLI installer v1.0
export PATH=/Applications/SnowflakeCLI.app/Contents/MacOS/:$PATH

# bun completions
[ -s "$HOME/.bun/_bun" ] && source "$HOME/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
export PATH="$HOME/.local/bin:$PATH"

# opencode
export PATH=/Users/ramtin/.opencode/bin:$PATH
export PATH="$HOME/go/bin:$PATH"
