# Back up and move your setup

Your setup stays in `~/.config/yonder/` on your computer. An update, a new
install or a delete of the app does not touch it.

## Safe saves

Yonder saves its settings files through a copy, so a crash never leaves
half a file. The file before each save stays as `<file>.bak`. When a file
is broken, Yonder reads its `.bak`.

## Export and Import

Open **Settings › General**, and tap **Export**. The file goes to the
Downloads folder of the computer, also when you tap it on the phone.

The export holds your workspaces, profiles, settings, schedules,
reminders and own screens. It does not hold the agents and their chats,
because those stay in the folders of each CLI.

- **Without keys** (the default), the export leaves out the keys, the
  pairing of your phones and the variables of your profiles. It is safe
  to keep anywhere.
- **With keys**, it also holds them. Anyone with that file can use your
  computer, so keep it private.

To move to a new computer, install Yonder there, open **Settings ›
General**, and tap **Import**. Import merges the file with what is there.
Before it writes, it copies the current files to
`~/.config/yonder/backups/before-import-<time>/`, so you can undo it.

An agent can do both for you: "export my Yonder setup" or "import the
setup in my Downloads folder".
