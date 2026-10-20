# LAN compatibility

The launcher enables this internal Java agent by default for Minecraft 1.20.1 / Forge 47.x. It is not placed in the mods directory. The selected pack can opt out in Settings; restart Minecraft after changing the setting.

Build with `node launcher/tools/build-lan-agent.cjs`. `ASTRAL_BUILD_JDK` may point to a JDK 17–21 bin directory. JDK 25 no longer includes the internal ASM API used here. Runtime is Java 17.

Only IntegratedServer.initServer's single setUsesAuthentication invocation is changed, in memory. Unexpected class layouts remain unchanged and produce a diagnostic. Dedicated server classes and client authentication to other hosts are unchanged. Use distinct nicknames and a trusted private LAN/VPN network.

The agent is bundled inside app.asar and copied by Electron into the selected installation's launcher-runtime/lan/SHA256 directory before Java starts. Java cannot read Electron archives. Missing or corrupt copies are restored atomically. Do not depend on portable EXE temporary extraction of app.asar.unpacked. Keep the existing atmosphere agent in launch arguments alongside this agent.

Tests: launcher/tests/lan.test.cjs, launcher/tests/catalog-ipc-electron.cjs, and an actual launcher Play-button integration check with an isolated world. The network probe checks reaching Forge's login handshake without requesting an official account session; it does not simulate a complete second modded client.
