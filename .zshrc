# Path to your oh-my-zsh installation.
export ZSH="$HOME/.oh-my-zsh"

plugins=(git autojump fzf)

source $ZSH/oh-my-zsh.sh

# User configuration

# export MANPATH="/usr/local/man:$MANPATH"

# You may need to manually set your language environment
# export LANG=en_US.UTF-8

# Preferred editor for local and remote sessions
# if [[ -n $SSH_CONNECTION ]]; then
#   export EDITOR='vim'
# else
#   export EDITOR='mvim'
# fi

# Compilation flags
# export ARCHFLAGS="-arch x86_64"

# Set personal aliases, overriding those provided by oh-my-zsh libs,
# plugins, and themes. Aliases can be placed here, though oh-my-zsh
# users are encouraged to define aliases within the ZSH_CUSTOM folder.
# For a full list of active aliases, run `alias`.
#
# Example aliases
# alias zshconfig="mate ~/.zshrc"
# alias ohmyzsh="mate ~/.oh-my-zsh"
bindkey '^ ' autosuggest-accept
source $(brew --prefix)/share/zsh-autosuggestions/zsh-autosuggestions.zsh
alias vim='nvim'

eval "$(starship init zsh)"
# Created by `pipx` on 2024-08-14 10:33:54
export PATH="$PATH:/Users/ramjav/.local/bin"
export CPATH=/opt/homebrew/include:$CPATH
export LIBRARY_PATH=/opt/homebrew/lib:$LIBRARY_PATH

# The next line updates PATH for the Google Cloud SDK.
if [ -f '/Users/ramjav/google-cloud-sdk/path.zsh.inc' ]; then . '/Users/ramjav/google-cloud-sdk/path.zsh.inc'; fi

# The next line enables shell command completion for gcloud.
if [ -f '/Users/ramjav/google-cloud-sdk/completion.zsh.inc' ]; then . '/Users/ramjav/google-cloud-sdk/completion.zsh.inc'; fi

alias cursor="/Applications/Cursor.app/Contents/MacOS/Cursor"
alias vim="nvim"
