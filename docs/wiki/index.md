# The wiki of Yonder

What Yonder does, how each part works, and why. The rules for agents are in `CLAUDE.md`.

The wiki has one file for each part. The name of the file without `.md` is the topic of the part for the
`about_yonder` tool of the bridge.

- [install](install.md): Install the app. The updates over the air, the versions, the checks on GitHub, the release
  gates, the update server, the production release and the crash reports.
- [architecture](architecture.md): Architecture. Why Grok talks to the workers through the bridge, with no session
  between them.
- [voice-agent](voice-agent.md): Voice agent (Grok). The realtime call, the voice and its volume, the other voice
  providers, and how Grok uses the tools.
- [bridge](bridge.md): Bridge. The MCP server that starts the workers: its tools, its port, the grants of macOS and
  two OS users on one computer.
- [workers](workers.md): Workers. The Claude Code sessions, the agents in other CLIs, profiles, people, schedules,
  reminders, notify, triggers, secrets from 1Password and new task links.
- [mac-app](mac-app.md): Mac app. The window, the tabs, the menu bar icon and the native parts of the Mac.
- [talking](talking.md): Talking to Yonder. The keys, the menu bar, the notch, the wake word, voice notes,
  walkie-talkie, dictation and the microphone.
- [workspaces](workspaces.md): Workspaces. The groups of agents and the config file that holds them.
- [projects](projects.md): Projects. How the workspaces with a folder work, the config file, the backup and the safe
  saves.
- [phone](phone.md): Phone. The relay, the pairing, the iPhone and Android apps, push notifications and the tabs of
  the phone.
- [screens](screens.md): Screens and styles. The default screen, the gallery of screens and the screen that an agent
  builds.
- [carplay](carplay.md): CarPlay. The car mode of the phone app.
- [watch](watch.md): Apple Watch. The watch app: a Talk button, the call and the list of the agents.
- [apps](apps.md): Apps. The Canvas tab: the pages, the sites and the approvals that the agents make.
- [preview](preview.md): Yonder Preview. The web site of an agent at a private HTTPS address, and Yonder in the
  Claude app.
- [omarchy](omarchy.md): Omarchy. Yonder on Omarchy, other Linux desktops and a Linux server.
- [windows](windows.md): Windows. Yonder on Windows 10 and 11.
- [related](related.md): Related tasks outside this repository. The site yonder.so and its accounts server.
- [open-questions](open-questions.md): Open questions. What nobody has tested or decided yet.
