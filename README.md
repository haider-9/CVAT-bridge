# CVAT Copy/Paste Annotations

A small static site ([Astro](https://astro.build) + TypeScript + Tailwind) that
distributes two bookmarklet scripts for copying annotations between frames in
[CVAT](https://www.cvat.ai/), plus a **Selection Editor** page section where you
can filter exactly which shapes get pasted.

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
