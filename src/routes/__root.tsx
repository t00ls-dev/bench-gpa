import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext } from "@tanstack/react-router";

import appCss from "../styles.css?url";
import {
  RootComponent,
  RootError,
  RootNotFound,
  RootShell,
} from "@/components/root-route-components";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Internal app, behind authentication: there's no external audience to
  // attract, so indexing and social-preview metadata are an anti-feature
  // here. `description`, `og:title`, `og:description`, `twitter:title`, and
  // `twitter:description` were removed from here: don't reintroduce them.
  // `public/robots.txt` deliberately keeps `Disallow: /`: it blocks
  // indexing, which is what we want.
  //
  // What remains is functional: charset, viewport, and the tab title.
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#00724c" },
      { title: "Bench GPA" },
    ],
    links: [
      // `?v=` ties the URL to the build's commit: every deploy becomes a new
      // URL, which invalidates browser and CDN (Cloudflare) cache without
      // needing a manual purge. The icons referenced from inside
      // manifest.json get the same treatment during the prebuild
      // (scripts/prebuild-version-manifest.mjs).
      { rel: "icon", type: "image/x-icon", href: `/favicon.ico?v=${__COMMIT_HASH__}` },
      // Explicit PNG alongside the .ico: modern browsers prefer PNG when
      // available, and this file has confirmed transparency (same mark as
      // the favicon, exported directly as PNG without an ICO container).
      {
        rel: "icon",
        type: "image/png",
        sizes: "192x192",
        href: `/icons/icon-192.png?v=${__COMMIT_HASH__}`,
      },
      { rel: "apple-touch-icon", href: `/apple-touch-icon.png?v=${__COMMIT_HASH__}` },
      { rel: "manifest", href: `/manifest.json?v=${__COMMIT_HASH__}` },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => search,
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: RootNotFound,
  errorComponent: RootError,
});
