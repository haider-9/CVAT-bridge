# CVAT Copy/Paste Annotations

A small static site ([Astro](https://astro.build) + TypeScript + Tailwind) that
distributes five bookmarklet scripts for working with annotations in
[CVAT](https://www.cvat.ai/) — COPY and PASTE to move shapes between frames, GROW
to nudge box sizes by 1–2 px on the frame you are viewing, RELABEL to replace
one label with another on that frame, and DELETE to remove the labels you tick —
plus a **Selection Editor** page section where you can filter exactly which
shapes get pasted.

## Why

CVAT has no built-in "copy annotations from this frame to that one". The COPY
and PASTE scripts run in the CVAT console and use the system clipboard as the
bridge, since this site and CVAT are different origins and cannot share
localStorage.

## Develop

```sh
npm install
npm run dev        # http://localhost:4321 (clipboard needs localhost or HTTPS)
```

If the browser blocks the modern Clipboard API, COPY also tries the legacy browser
copy command. Run the bookmarklet while the CVAT tab is focused; if both methods
are blocked, the payload remains in CVAT's local storage and the console reports
that it was not placed on the system clipboard.

## Build

```sh
npm run build      # static output in dist/
npm run preview
```

## Create a new project like this

```sh
npm create astro@latest
```
# CVAT-bridge
# CVAT-bridge
