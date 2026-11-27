#!/bin/bash
# Installs Yonder on Linux (docs/omarchy.md):  curl -fsSL https://download.yonder.so/install.sh | bash
#
# It puts the bridge and the window in ~/.local/share/yonder, the `yonder` command in ~/.local/bin, and the service in
# ~/.config/systemd/user. On a Linux desktop it adds the launcher and the key Super + Y: on Omarchy also the module of
# the bar, and on another desktop the start of the bridge with the desktop. On a server with no desktop (over SSH), the
# service starts at boot and stays after the logout. Then it shows the QR code that pairs the phone. It installs no agent:
# the user installs Claude Code, Hermes or another CLI from the Agents tab of the phone. Run it again to
# update: the mode, the settings and the pairings in ~/.config/yonder stay.
# YONDER_TARBALL=<file> installs from a local file, for a test. YONDER_SERVER=1 installs the server mode on a desktop,
# and YONDER_DESKTOP=1 the desktop mode over SSH.
# The bridge runs it each time that a new version comes out (YONDER_VERSION, the update of the bridge in
# bridge/main.ts). That run gets the tarball of that version and shows no QR code.
set -euo pipefail

fail() {
  echo "$*" >&2
  exit 1
}

[[ $(uname -s) == Linux ]] || fail "This installer is for Linux. Yonder for the Mac is at https://yonder.so."
case $(uname -m) in
x86_64) arch=x64 ;;
aarch64) arch=arm64 ;;
*) fail "Yonder has no build for $(uname -m)." ;;
esac
missing=()
for cmd in curl jq tar; do
  command -v "$cmd" >/dev/null || missing+=("$cmd")
done
# The command that installs a package, for the hints.
if command -v apt-get >/dev/null; then
  get="sudo apt-get install"
elif command -v dnf >/dev/null; then
  get="sudo dnf install"
elif command -v zypper >/dev/null; then
  get="sudo zypper install"
else
  get="sudo pacman -S"
fi
((${#missing[@]} == 0)) || fail "Yonder needs ${missing[*]}. Install it with: $get ${missing[*]}"
command -v systemctl >/dev/null || fail "Yonder needs systemd."
systemctl --user show-environment >/dev/null 2>&1 ||
  fail "systemctl --user does not answer. Log in as this user over SSH or on the desktop (not with su or sudo), and run the installer again."

# The mode: a server or a desktop. A server has no desktop, for example a computer that you reach over SSH, and its
# bridge starts at boot. A desktop gets the window, the launcher and the call key: Omarchy, or another Linux desktop
# (GNOME, KDE Plasma, Xfce and others). YONDER_SERVER=1 or YONDER_DESKTOP=1 picks the mode. Else a second run keeps the
# mode of the service, which names it, so an update never changes it. Else a desktop shows by the tools of Hyprland or
# Omarchy, by a display, or by a graphical session of the user. Over SSH only the session counts: the display of
# `ssh -X` is not a desktop of this computer, and an SSH session into a desktop has no display.
unit=$HOME/.config/systemd/user/yonder.service
server=""
if [[ -n ${YONDER_SERVER:-} ]]; then
  server=1
elif [[ -n ${YONDER_DESKTOP:-} ]] || grep -qs '^Environment=YONDER_DESKTOP=1' "$unit"; then
  :
elif grep -qs '^Environment=YONDER_SERVER=1' "$unit"; then
  server=1
elif ! command -v hyprctl >/dev/null && ! command -v omarchy-shell-config >/dev/null &&
  [[ -n ${SSH_CONNECTION:-} || -z ${WAYLAND_DISPLAY:-}${DISPLAY:-} ]] &&
  ! systemctl --user is-active --quiet graphical-session.target; then
  server=1
fi
# Omarchy has its own launcher of web apps, its own Claude Code and its bar. Its folder shows it also to an update from
# the bridge, whose PATH has no Omarchy commands.
omarchy=""
if [[ -z $server ]] && { [[ -d $HOME/.local/share/omarchy ]] || command -v omarchy-shell-config >/dev/null; }; then omarchy=1; fi

DATA=${XDG_DATA_HOME:-$HOME/.local/share}/yonder
CONFIG=$HOME/.config/yonder
BIN=$HOME/.local/bin
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Downloading Yonder…"
if [[ -n ${YONDER_TARBALL:-} ]]; then
  cp "$YONDER_TARBALL" "$tmp/yonder.tar.gz"
else
  # The tarball of a version has its own name, so the cache of Cloudflare never gives an older one.
  curl -fsSL "https://download.yonder.so/yonder-linux-$arch${YONDER_VERSION:+-$YONDER_VERSION}.tar.gz" -o "$tmp/yonder.tar.gz"
fi
tar -xzf "$tmp/yonder.tar.gz" -C "$tmp"
[[ -x $tmp/yonder/yonder-bridge ]] || fail "The download has no bridge."
# The new version takes the place of the old one in one step.
rm -rf "$DATA.old"
if [[ -d $DATA ]]; then mv "$DATA" "$DATA.old"; fi
mkdir -p "$(dirname "$DATA")" "$BIN" "$CONFIG"
mv "$tmp/yonder" "$DATA"
rm -rf "$DATA.old"
install -m 755 "$DATA/yonder" "$BIN/yonder"

echo "Starting the bridge…"
mkdir -p "$HOME/.config/systemd/user"
# A service does not read .bashrc, so on a server and on a desktop other than Omarchy it gets the PATH of this shell,
# which finds claude and node where npm, nvm or the installer of Claude Code put them. systemd reads % as a specifier.
# An update from the bridge has the PATH of the service already, so each folder goes in once.
path=$(printf '%s' "$PATH:$HOME/.local/bin:/usr/local/bin:/usr/bin" | tr : '\n' | awk 'NF && !seen[$0]++' | paste -sd: -)
if [[ -n $server ]]; then
  # A server has no graphical session, so the service starts with the user manager.
  sed -e 's/^WantedBy=.*/WantedBy=default.target/' -e '/graphical-session\.target$/d' -e '/graphical session/d' -e '/YONDER_DESKTOP/d' \
    -e "s|^Environment=PATH=.*|Environment=\"PATH=${path//%/%%}\"\nEnvironment=YONDER_SERVER=1|" \
    "$DATA/yonder.service" >"$unit"
  # Linger keeps the user manager, and so the bridge, alive after the SSH session ends, and starts it at boot.
  loginctl enable-linger "$(id -un)" 2>/dev/null ||
    echo "Yonder stops when you log out. To keep it running, run: sudo loginctl enable-linger $(id -un)"
elif [[ -z $omarchy ]]; then
  sed -e "s|^Environment=PATH=.*|Environment=\"PATH=${path//%/%%}\"|" "$DATA/yonder.service" >"$unit"
  # Xfce, MATE, Cinnamon and other desktops never start graphical-session.target, so there the service does not start by
  # itself. The autostart entry starts it at each login, with the display of the session. The bridge gets the display
  # of this session now too, for the clipboard and the links. Over SSH the display is not the one of the desktop.
  if [[ -z ${SSH_CONNECTION:-} ]]; then
    session=()
    for var in DISPLAY WAYLAND_DISPLAY XAUTHORITY XDG_CURRENT_DESKTOP; do [[ -z ${!var:-} ]] || session+=("$var"); done
    ((${#session[@]} == 0)) || systemctl --user import-environment "${session[@]}" || true
  fi
  mkdir -p "$HOME/.config/autostart"
  cat >"$HOME/.config/autostart/yonder.desktop" <<'EOF'
[Desktop Entry]
Type=Application
Name=Yonder
Comment=Starts the Yonder bridge with the desktop
Exec=sh -c "systemctl --user import-environment DISPLAY WAYLAND_DISPLAY XAUTHORITY XDG_CURRENT_DESKTOP; systemctl --user start yonder.service"
NoDisplay=true
EOF
else
  cp "$DATA/yonder.service" "$unit"
fi
systemctl --user daemon-reload
systemctl --user enable yonder.service >/dev/null 2>&1
systemctl --user restart yonder.service

# The call key on GNOME: a custom shortcut, as Settings > Keyboard makes it. A key that the user changed later stays.
gnome_key() {
  local media=org.gnome.settings-daemon.plugins.media-keys
  local custom=/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/yonder/ keys all
  keys=$(gsettings get $media custom-keybindings) || return 1
  [[ $keys != *"'$custom'"* ]] || return 0
  all=$(gsettings list-recursively 2>/dev/null) || true
  if grep -qi "<super>y'" <<<"$all"; then
    echo "Super + Y is taken, so Yonder binds no key. Bind \"$BIN/yonder call\" to a free key in Settings > Keyboard."
    return 1
  fi
  if [[ $keys == "@as []" ]]; then keys="['$custom']"; else keys="${keys%]}, '$custom']"; fi
  gsettings set $media custom-keybindings "$keys" &&
    gsettings set "$media.custom-keybinding:$custom" name "Yonder call" &&
    gsettings set "$media.custom-keybinding:$custom" command "$BIN/yonder call" &&
    gsettings set "$media.custom-keybinding:$custom" binding "<Super>y"
}

key=""
if [[ -z $server ]]; then
  # The launcher: Yonder in the app list of the desktop.
  icons=$HOME/.local/share/icons/hicolor/256x256/apps
  mkdir -p "$icons" "$HOME/.local/share/applications"
  cp "$DATA/yonder.png" "$icons/yonder.png"
  cat >"$HOME/.local/share/applications/yonder.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Yonder
Comment=Talk to your Claude Code agents
Exec=$BIN/yonder open
Icon=yonder
Categories=Development;
EOF
  update-desktop-database "$HOME/.local/share/applications" >/dev/null 2>&1 || true

  # Super + Y starts and ends a call, as right ⌘ on the Mac. Omarchy 4 binds keys in Lua, Omarchy 3 in hyprlang, and
  # GNOME (Ubuntu, Fedora) in its custom shortcuts. On another desktop the user binds the key.
  key="Super + Y"
  lua=$HOME/.config/hypr/bindings.lua
  conf=$HOME/.config/hypr/bindings.conf
  if grep -qs "yonder call" "$lua" "$conf"; then
    :
  elif [[ -f $lua ]] && ! grep -q '"SUPER + Y"' "$lua"; then
    printf '\n-- Yonder: start or end a call, as right ⌘ on the Mac.\no.bind("SUPER + Y", "Yonder call", "%s/yonder call")\n' "$BIN" >>"$lua"
  elif [[ ! -f $lua && -f $conf ]] && ! grep -Eq '^\s*bindd?\s*=\s*SUPER\s*,\s*Y\s*,' "$conf"; then
    printf '\n# Yonder: start or end a call, as right ⌘ on the Mac.\nbindd = SUPER, Y, Yonder call, exec, %s/yonder call\n' "$BIN" >>"$conf"
  elif [[ -f $lua || -f $conf ]]; then
    key=""
    echo "Super + Y is taken, so Yonder binds no key. Bind \"yonder call\" to a free key in ~/.config/hypr/bindings.lua."
  elif command -v hyprctl >/dev/null; then
    key=""
    echo "Bind \"$BIN/yonder call\" to a key in the config of Hyprland, to start and end a call."
  elif grep -qx org.gnome.settings-daemon.plugins.media-keys <<<"$(gsettings list-schemas 2>/dev/null)" &&
    [[ ${XDG_CURRENT_DESKTOP:-GNOME} =~ GNOME|Unity|Budgie|Pantheon ]]; then
    # An update from the bridge leaves the key as the user left it.
    [[ -n ${YONDER_VERSION:-} ]] || gnome_key || key=""
  else
    key=""
    echo "Bind \"$BIN/yonder call\" to a key in the keyboard settings of your desktop, to start and end a call."
  fi
  hyprctl reload >/dev/null 2>&1 || true

  # The module of the bar (Omarchy 4): the agents that run and wait, lit during a call. A click starts or ends the
  # call, a right click opens Yonder, and a middle click pairs a phone. omarchy-shell-config writes shell.json and
  # reloads the bar. Without it (Omarchy 3), Yonder has no module.
  module=$(jq -cn '{id: "yonder", type: "command", exec: "~/.local/bin/yonder status", interval: 3, tooltip: "Yonder",
    onClick: "~/.local/bin/yonder call", onRightClick: "~/.local/bin/yonder open",
    onMiddleClick: "xdg-terminal-exec ~/.local/bin/yonder pair --hold"}')
  if command -v omarchy-shell-config >/dev/null; then
    (
      # shellcheck disable=SC1091
      source omarchy-shell-config
      commit "$NORMALIZE | if any(.bar.layout[][]; .id == \"yonder\") then . else .bar.layout.right = [\$module] + .bar.layout.right end" \
        --argjson module "$module"
    ) || echo "Yonder could not add its module to the bar."
  fi
fi

# Dictation: the bridge gives the sound of the phone or the window to `voxtype transcribe`. When Voxtype is missing (a
# server, another desktop, or an Omarchy without Install > AI > Dictation), it comes from its GitHub release, with the
# Whisper model base.en (English, about 150 MB). The setup gets the model only when it is missing, so a run of the
# installer after a failed download gets it again.
install_voxtype() {
  if ! command -v voxtype >/dev/null; then
    local version=1.1.0 build url
    if [[ $arch == arm64 ]]; then
      build=linux-aarch64-cpu
    elif grep -qw avx512f /proc/cpuinfo; then
      build=linux-x86_64-avx512
    elif grep -qw avx2 /proc/cpuinfo; then
      build=linux-x86_64-avx2
    else
      build=linux-x86_64-baseline
    fi
    url=https://github.com/peteonrails/voxtype/releases/download/v$version
    curl -fsSL "$url/voxtype-$version-$build" -o "$tmp/voxtype" &&
      curl -fsSL "$url/SHA256SUMS.txt" -o "$tmp/sums" &&
      [[ $(sha256sum "$tmp/voxtype" | cut -d' ' -f1) == $(awk -v f="voxtype-$version-$build" '$2 == f {print $1}' "$tmp/sums") ]] &&
      install -m 755 "$tmp/voxtype" "$BIN/voxtype" || return
  fi
  # Voxtype needs the sound library of ALSA, which a server can lack (Ubuntu Server 24.04 has none). A sudo with no
  # password installs it. Else the user gets the command, and no password prompt stops the install or an update.
  if ldd "$(PATH=$BIN:$PATH command -v voxtype)" 2>/dev/null | grep -q 'libasound\.so\.2 => not found'; then
    local pkg=alsa-lib yes=-y
    case $get in
    *apt-get*) if apt-cache show libasound2t64 >/dev/null 2>&1; then pkg=libasound2t64; else pkg=libasound2; fi ;;
    *zypper*) pkg=libasound2 ;;
    *pacman*) yes=--noconfirm ;;
    esac
    ${get/sudo/sudo -n} "$yes" "$pkg" >/dev/null 2>&1 || {
      echo "Dictation needs the sound library $pkg. Install it with: $get $pkg"
      return 1
    }
  fi
  PATH=$BIN:$PATH voxtype setup --download --quiet --no-post-install
}

echo "Installing Voxtype for dictation…"
install_voxtype || echo "Voxtype did not install, so dictation does not work. Run yonder update to try again."

[[ :$PATH: == *":$BIN:"* ]] || echo "Add $BIN to your PATH to run the yonder command."
if [[ -n $server ]]; then
  echo
  echo "Yonder is installed. The bridge runs as the service yonder.service: yonder logs shows its log."
else
  command -v lsof >/dev/null || echo "The Tunnel of Yonder needs lsof: $get lsof"
  if [[ -n ${WAYLAND_DISPLAY:-} ]]; then
    command -v wl-copy >/dev/null || echo "The clipboard of Yonder needs wl-copy: $get wl-clipboard"
  elif [[ -n ${DISPLAY:-} ]] && ! command -v xclip >/dev/null && ! command -v xsel >/dev/null; then
    echo "The clipboard of Yonder needs xclip: $get xclip"
  fi
  echo
  echo "Yonder is installed.${key:+ $key starts and ends a call.} Open the window with: yonder open"
fi
[[ -z ${YONDER_VERSION:-} ]] || exit 0

echo
"$BIN/yonder" pair || echo "Pair a phone later with: yonder pair"
