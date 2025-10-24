#!/bin/bash

# Toggle fingerprint authentication on/off
# Usage: ./toggle-fingerprint-auth.sh [on|off]

ACTION=${1:-"toggle"}

SUDO_FILE="/etc/pam.d/sudo"
POLKIT_FILE="/etc/pam.d/polkit-1"
BACKUP_SUFFIX=".backup"

# Function to enable fingerprint
enable_fingerprint() {
    echo "Enabling fingerprint authentication..."
    
    # Enable in sudo
    if ! grep -q "pam_fprintd.so" "$SUDO_FILE"; then
        sudo cp "$SUDO_FILE" "${SUDO_FILE}${BACKUP_SUFFIX}"
        sudo tee "$SUDO_FILE" > /dev/null << 'EOF'
auth    sufficient pam_fprintd.so
#%PAM-1.0
auth		include		system-auth
account		include		system-auth
session		include		system-auth
EOF
    fi
    
    # Enable in polkit-1
    if ! grep -q "pam_fprintd.so" "$POLKIT_FILE"; then
        sudo cp "$POLKIT_FILE" "${POLKIT_FILE}${BACKUP_SUFFIX}"
        sudo tee "$POLKIT_FILE" > /dev/null << 'EOF'
auth      sufficient pam_fprintd.so
auth      required pam_unix.so
account   required pam_unix.so
password  required pam_unix.so
session   required pam_unix.so
EOF
    fi
    
    echo "✅ Fingerprint authentication enabled"
}

# Function to disable fingerprint
disable_fingerprint() {
    echo "Disabling fingerprint authentication..."
    
    # Disable in sudo
    if grep -q "pam_fprintd.so" "$SUDO_FILE"; then
        sudo cp "$SUDO_FILE" "${SUDO_FILE}${BACKUP_SUFFIX}"
        sudo tee "$SUDO_FILE" > /dev/null << 'EOF'
#%PAM-1.0
auth		include		system-auth
account		include		system-auth
session		include		system-auth
EOF
    fi
    
    # Disable in polkit-1
    if grep -q "pam_fprintd.so" "$POLKIT_FILE"; then
        sudo cp "$POLKIT_FILE" "${POLKIT_FILE}${BACKUP_SUFFIX}"
        sudo tee "$POLKIT_FILE" > /dev/null << 'EOF'
auth      required pam_unix.so
account   required pam_unix.so
password  required pam_unix.so
session   required pam_unix.so
EOF
    fi
    
    echo "❌ Fingerprint authentication disabled"
}

# Function to check current status
check_status() {
    if grep -q "pam_fprintd.so" "$SUDO_FILE" && grep -q "pam_fprintd.so" "$POLKIT_FILE"; then
        echo "🔐 Fingerprint authentication: ENABLED"
        return 0
    else
        echo "🔓 Fingerprint authentication: DISABLED"
        return 1
    fi
}

# Main logic
case "$ACTION" in
    "on")
        enable_fingerprint
        ;;
    "off")
        disable_fingerprint
        ;;
    "status")
        check_status
        ;;
    "toggle")
        if check_status >/dev/null 2>&1; then
            disable_fingerprint
        else
            enable_fingerprint
        fi
        ;;
    *)
        echo "Usage: $0 [on|off|toggle|status]"
        echo "  on     - Enable fingerprint authentication"
        echo "  off    - Disable fingerprint authentication" 
        echo "  toggle - Toggle current state"
        echo "  status - Show current status"
        exit 1
        ;;
esac