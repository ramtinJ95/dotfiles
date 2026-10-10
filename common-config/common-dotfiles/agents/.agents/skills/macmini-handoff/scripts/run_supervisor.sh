set -u

script_directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
attempt=1
while [ "$attempt" -le 3 ]; do
    python3 "$script_directory/supervisor.py" "$@"
    rc=$?
    if [ "$rc" -eq 0 ]; then
        exit 0
    fi
    printf 'supervisor_exit=%s attempt=%s/3\n' "$rc" "$attempt" >&2
    attempt=$((attempt + 1))
    if [ "$attempt" -le 3 ]; then
        sleep 2
    fi
done
exit "$rc"
