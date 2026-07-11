# Why Grok can run `npm run build` in Zed but the Zed agent often can’t

This is about **how each agent runs commands**, not about `npm` itself.

## What Grok does

When you ask Grok to `npm run build`, it calls a **shell tool** that:

1. Starts a real **PowerShell** process (your machine’s)
2. Uses the **workspace as cwd** (e.g. `C:\Users\rory\repos\newTab`)
3. Inherits a normal **user PATH** (including Node, e.g. `C:\Program Files\nodejs\`)
4. Runs with your usual permissions — not a locked-down sandbox

Example of a healthy environment:

```
NODE=v24.18.0
NPM=11.16.0
WHERE_NPM=C:\Program Files\nodejs\npm.ps1
```

That’s the same class of environment as *your* terminal if it can run `npm`.

## Why Zed’s agent often can’t

Zed’s built-in agent is a **different runner**. Common failure modes:

| Difference | Effect |
|------------|--------|
| **Sandbox / tool policy** | Agent may not be allowed to execute shell, or only a whitelist of tools |
| **Different shell / env** | May not load the same profile as your interactive terminal → `npm`/`node` “not found” |
| **cwd not the project root** | `npm run build` fails with “no package.json” |
| **Windows + `npm.ps1`** | PowerShell execution policy blocks scripts; interactive terminal may be fine, agent may not |
| **No network in sandbox** | Fails if install/scripts need the network (less common for a plain `esbuild` build) |
| **Approval / ACP config** | Command never actually runs until you allow terminal tools |

So it’s rarely “npm only works for Grok.” It’s usually **Grok’s tool is a full user shell; Zed’s agent shell is restricted, mis-enved, or not enabled.**

## How to confirm in 30 seconds

In the Zed agent session where it fails, ask it to run the same diagnostics:

```powershell
node -v
npm -v
Get-Command npm
pwd
Test-Path package.json
```

- **`npm` not found** → PATH / shell profile issue
- **package.json missing** → wrong cwd
- **running scripts is disabled** → PowerShell execution policy on `npm.ps1`
- **tool denied / no shell** → agent permissions, not Node

## Bottom line

Grok is not special-casing npm. It gets a **normal project shell with Node on PATH**. Zed’s agent is a separate integration; if its terminal tool is off, sandboxed, or missing Node’s path, the *same* `npm run build` fails even when Grok succeeds in the same editor.

If you have the exact Zed agent error, map it to one of the causes above for a precise fix.
