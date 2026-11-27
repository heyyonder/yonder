#!/bin/zsh
# The watchdog of Yonder. launchd keeps it running (`zsh bridge/watchdog.sh install`), so that Yonder repairs
# itself when nobody is at the Mac. Every 30 seconds it checks the app and the bridge:
# - It does not keep the Mac awake. The bridge does that while a worker runs or a call is live.
# - It opens Yonder when the app does not run, at most once in 10 minutes.
# - When the bridge does not answer, or has lost the phone relay, for 1 minute, it starts the bridge again. While Yonder
#   runs, it only stops the bridge, and the app starts it (source_bridge).
# - After 3 minutes, it runs the last bridge that worked, a bundle in ~/.config/yonder/bridge-fallback. When a
#   file of the bridge changes, it tries the source again.
# - A bridge that works for 10 minutes becomes the new fallback.
# It does nothing while install-app runs. The log is ~/.config/yonder/watchdog.log.
# `uninstall` stops it. `check` runs the steps on a test port with a copy of the bridge.

zmodload zsh/datetime
export LC_ALL=C
# launchd gives a short PATH, without bun.
path=($HOME/.bun/bin /opt/homebrew/bin /usr/local/bin $path)

SCRIPT=${0:A}
ROOT=${SCRIPT:h:h}
# A check: YONDER_PORT names another port, and the bridge gets its own folder, as in the bridge (TEST in bridge/main.ts).
TEST=0
[[ -n $YONDER_PORT && $YONDER_PORT != 7787 ]] && TEST=1
CONFIG=$HOME/.config/yonder
(( TEST )) && CONFIG+=-$YONDER_PORT
# The port of the bridge: YONDER_PORT of a check, else `port` of config.json, which the bridge writes. It is not always
# 7787: when another user of this Mac has that port, the bridge takes the next free one (bridge/peer.ts).
port() { if (( TEST )); then print $YONDER_PORT; else plutil -extract port raw -o - $CONFIG/config.json 2>/dev/null || print 7787; fi }
PORT=$(port)
FALLBACK=$CONFIG/bridge-fallback
EVERY=${YONDER_WATCHDOG_EVERY:-30}
LABEL=com.vladartym.yonder.watchdog
PLIST=$HOME/Library/LaunchAgents/$LABEL.plist

log() { print -r -- "$(strftime '%F %T' $EPOCHSECONDS) $*" }

# The process that listens on the port of the bridge.
# Only a process of this user: another user of the Mac can run a bridge of their own.
listener() { lsof -a -u $UID -tiTCP:$PORT -sTCP:LISTEN 2>/dev/null | head -1 }

# The code of the bridge: its folder, the files that it imports from other folders, and the packages.
# shortcut: a list by hand. Add a file here when the bridge imports a new file outside bridge/.
# The glob runs at each call, so that a new file of the bridge counts too.
code() { print -l $ROOT/bridge/*.ts $ROOT/src/{link,brain,pcm}.ts $ROOT/version.ts $ROOT/README.md $ROOT/bun.lock }

# The time of the newest change to the code of the bridge.
changed() { stat -f %m ${(f)"$(code)"} 2>/dev/null | sort -n | tail -1 }

# True when the bridge answers, and has the phone relay when .env names one. A relay that the Mac cannot
# reach, for example with no internet, is not a fault of the bridge.
healthy() {
  curl -sf -m 5 http://127.0.0.1:$PORT/version >/dev/null || return 1
  (( TEST )) && return 0
  local relay=$(sed -n 's/^YONDER_RELAY=wss:/https:/p' $CONFIG/.env 2>/dev/null)
  [[ -z $relay || $(curl -s -m 5 http://127.0.0.1:$PORT/relay) == *'"connected":true'* ]] && return 0
  [[ $(curl -s -m 5 -o /dev/null -w '%{http_code}' $relay) != 200 ]]
}

# Stops the bridge on the port. A bridge in a busy loop never runs its SIGTERM handler, so after 5 seconds it gets
# SIGKILL. Else such a bridge holds the port at 100% CPU, and each new bridge stops with EADDRINUSE.
stop() {
  local pid=$(listener) i
  if [[ -n $pid ]]; then
    kill $pid
    for i in {1..10}; do [[ -z $(listener) ]] && break; sleep 0.5; done
    pid=$(listener)
    if [[ -n $pid ]]; then
      kill -9 $pid
      log "The old bridge did not stop, so the watchdog killed it."
      for i in {1..10}; do [[ -z $(listener) ]] && break; sleep 0.5; done
    fi
  fi
}
# Starts a bridge as the app does (launch_bridge in src-tauri/src/main.rs): in the login shell, so that the
# workers get the PATH of a terminal. It stops the old bridge first, because two bridges cannot share the port.
start() {
  stop
  mkdir -p $CONFIG
  /bin/zsh -lic "$1 >> '$CONFIG/bridge.log' 2>&1" </dev/null >/dev/null 2>&1 &!
}
# While Yonder runs, the watchdog only stops the bridge, and the app starts the source again within 15 seconds. macOS then
# holds the app responsible for the bridge and its agents, so they get the Full Disk Access of the app (`responsible` in
# bridge/main.ts). A bridge that the watchdog starts gets only the grants of the watchdog. The fallback starts as before.
source_bridge() {
  if (( ! TEST )) && pgrep -u $UID -x yonder >/dev/null; then stop; else start "exec bun '$ROOT/bridge/main.ts'"; fi
}
# The bundle finds its copies of CLAUDE.md and the wiki in the working folder.
fallback_bridge() { start "cd '$FALLBACK' && exec bun '$FALLBACK/main.js'" }

# Keeps a bundle of the running bridge, for the day a change breaks the bridge. It counts only after 10 minutes
# up, when no file of the bridge changed after its start. The first bundle does not wait. `--define` keeps the
# folder of the source, so that the bundle serves dist/ and runs rebuild_app as the source does.
save() {
  local code=$(changed) up
  local -a started=(${=$(ps -o lstart= -p $1)})
  strftime -r -s up '%a %b %e %H:%M:%S %Y' "$started" 2>/dev/null || return
  (( code < up )) || return
  if [[ -f $FALLBACK/main.js ]]; then
    (( EPOCHSECONDS - up >= 600 && $(stat -f %m $FALLBACK/main.js) < code )) || return
  fi
  rm -rf $FALLBACK.new
  bun build --target=bun $ROOT/bridge/main.ts --outdir $FALLBACK.new --define "import.meta.dir=\"$ROOT/bridge\"" >/dev/null 2>&1 &&
    rm -rf $FALLBACK && mv $FALLBACK.new $FALLBACK && log "Saved the running bridge as the fallback."
}

watch() {
  local bad=0 last= opened=0 failed=$EPOCHSECONDS pid cmd
  log "The watchdog runs for the bridge on port $PORT."
  while sleep $EVERY; do
    PORT=$(port)
    # install-app quits the app and the bridge, and then opens the new app.
    pgrep -f 'run install-app|tauri build' >/dev/null && continue
    # During `tauri dev`, the dev app is about to open.
    if (( ! TEST && EPOCHSECONDS - opened >= 600 )) && ! pgrep -u $UID -x yonder >/dev/null && ! pgrep -f 'tauri dev' >/dev/null; then
      opened=$EPOCHSECONDS
      if open -g /Applications/Yonder.app; then log "Yonder did not run, so the watchdog opened it."
      else log "Yonder did not run, and the watchdog could not open /Applications/Yonder.app."; fi
    fi
    pid=$(listener)
    cmd=${pid:+$(ps -o command= -p $pid)}
    if healthy; then
      # The same process at two checks: the bridge stays up. A new process can still stop at once.
      if [[ -n $pid && $pid == $last ]]; then
        bad=0
        if [[ $cmd == *bridge-fallback* ]]; then
          # A change to the bridge can be the fix.
          if (( $(changed) > failed )); then
            log "The code of the bridge changed, so the watchdog tries the source again."
            source_bridge
          fi
        elif [[ $cmd == *$ROOT/bridge/main.ts* ]]; then
          save $pid
        fi
      fi
      last=$pid
      continue
    fi
    last=
    (( ++bad ))
    if (( bad == 2 )) && [[ $cmd != *bridge-fallback* ]]; then
      log "The bridge did not work for a minute, so the watchdog started it again."
      source_bridge
    elif (( bad >= 6 )); then
      bad=0
      if [[ $cmd != *bridge-fallback* && -f $FALLBACK/main.js ]]; then
        failed=$EPOCHSECONDS
        log "The bridge did not work for 3 minutes, so the watchdog runs the last bridge that worked."
        fallback_bridge
      else
        log "The bridge still does not work, so the watchdog starts the source again."
        source_bridge
      fi
    fi
  done
}

# Runs the steps on port 7797 with a copy of the bridge: the start, the first bundle, a source that breaks, the
# fallback, and the source again after a fix. The live bridge, the app and the relay do not change.
check() {
  local port=7797 tmp=$(mktemp -d)
  tmp=${tmp:A}
  local test=$HOME/.config/yonder-$port
  mkdir -p $tmp/bridge $tmp/relay $tmp/src $tmp/docs
  local file
  for file in ${(f)"$(code)"} $SCRIPT $ROOT/CLAUDE.md $ROOT/docs/wiki.md; do cp $file $tmp/${file#$ROOT/}; done
  ln -s $ROOT/node_modules $tmp/node_modules
  rm -rf $test
  YONDER_PORT=$port YONDER_WATCHDOG_EVERY=1 zsh $tmp/bridge/watchdog.sh > $tmp/watchdog.log 2>&1 &
  trap "kill $!; sleep 2; pkill -9 -f '$tmp/'; pkill -f '$test/'; rm -rf $tmp $test" EXIT
  # Waits until the bridge on the test port answers and runs $1.
  runs() {
    local i
    for i in {1..60}; do
      [[ $(ps -o command= -p "$(lsof -tiTCP:$port -sTCP:LISTEN | head -1)" 2>/dev/null) == *$1* ]] &&
        curl -sf -m 2 http://127.0.0.1:$port/version >/dev/null && return
      sleep 1
    done
    return 1
  }
  saved() { local i; for i in {1..60}; do [[ -f $test/bridge-fallback/main.js ]] && return; sleep 1; done; return 1 }
  step() {
    local what=$1; shift
    if "$@"; then print "ok: $what"; else print "FAIL: $what"; cat $tmp/watchdog.log; return 1; fi
  }
  step "the watchdog starts a bridge that does not run" runs $tmp/bridge/main.ts || return 1
  step "the first bridge that works becomes the fallback" saved || return 1
  print 'throw new Error("broken on purpose");' | cat - $ROOT/bridge/main.ts > $tmp/bridge/main.ts
  kill $(lsof -tiTCP:$port -sTCP:LISTEN)
  step "a bridge that cannot start gives way to the fallback" runs $test/bridge-fallback/main.js || return 1
  cp $ROOT/bridge/main.ts $tmp/bridge/main.ts
  step "a change to the bridge brings the source back" runs $tmp/bridge/main.ts || return 1
  # A bridge in a busy loop holds the port and ignores SIGTERM.
  print "process.on('SIGTERM', () => {}); Bun.serve({ port: $port, fetch() { for (;;); } });" > $tmp/stuck.ts
  kill $(lsof -tiTCP:$port -sTCP:LISTEN)
  for i in {1..20}; do [[ -z $(lsof -tiTCP:$port -sTCP:LISTEN) ]] && break; sleep 0.25; done
  bun $tmp/stuck.ts &!
  step "a bridge in a busy loop gives way to the source" runs $tmp/bridge/main.ts || return 1
  print PASS
}

case $1 in
  install)
    # launchd runs the script of the main checkout, never one of a worktree, which an agent can delete.
    common=$(git -C $ROOT rev-parse --path-format=absolute --git-common-dir)
    script=${common:h}/bridge/watchdog.sh
    [[ -f $script ]] || { print "Merge the watchdog into main first: $script is missing."; exit 1 }
    zsh -n $script || exit 1
    mkdir -p $CONFIG ${PLIST:h}
    cat > $PLIST <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>/bin/zsh</string><string>$script</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <!-- A bridge that the watchdog started keeps running when launchd stops the watchdog. -->
  <key>AbandonProcessGroup</key><true/>
  <key>StandardOutPath</key><string>$CONFIG/watchdog.log</string>
  <key>StandardErrorPath</key><string>$CONFIG/watchdog.log</string>
</dict>
</plist>
EOF
    launchctl bootout gui/$UID/$LABEL 2>/dev/null && sleep 1
    launchctl bootstrap gui/$UID $PLIST && print "The watchdog runs. The log is $CONFIG/watchdog.log."
    ;;
  uninstall)
    launchctl bootout gui/$UID/$LABEL 2>/dev/null
    rm -f $PLIST
    print "The watchdog stopped. Yonder and the bridge keep running."
    ;;
  check) check ;;
  *) watch ;;
esac
