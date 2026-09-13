# Architecture

This project is a local visual layer for the Codex desktop app. It changes the app's appearance while leaving Codex's product behavior, account state, and native controls intact.

```text
one-click launcher
        |
        +--> prepare theme payload
        |        |
        |        +--> selected background image
        |        +--> theme CSS and runtime metadata
        |
        +--> start ChatGPT/Codex normally
        |
        +--> inject the visual layer into the running window
                         |
                         +--> native Codex UI remains the owner
                         +--> theme layer supplies colors, glass, wallpaper and pet
```

## What belongs to this project

- `theme/` contains the two supported background compositions, visual rules, selectors, and runtime metadata.
- `pet/` contains the optional companion pet asset and its animation manifest.
- `scripts/build-injector.mjs` assembles the local payload.
- `scripts/inject-theme.mjs` applies that payload to the already running desktop window.
- `scripts/launch-theme.mjs` starts the app and performs one injection. It does not watch the process or close the app.

## Layouts

The default layout is `melody-background-standard-right.png`, where the large subject stays toward the right side of the window. `melody-background-subject-centered.png` is the centered alternative. The launcher selects the layout explicitly; the native Codex window keeps control of its own sidebar, composer, panels, resizing, and zoom semantics.

## Runtime boundary

The theme is presentation-only. It does not replace Codex services, alter Computer Use permissions, add a background daemon, or intercept the app's quit command. Closing the terminal after launch does not terminate the app; quitting the app remains the normal native `Command-Q` action.

## Restore

`npm run restore` removes the injected visual layer and returns the desktop app to its prior appearance.
