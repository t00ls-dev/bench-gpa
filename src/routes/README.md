# Routes

TanStack Start uses **file-based routing**. Every `.tsx` file in this directory
is a route. Do **not** create `src/pages/`, `src/routes/_app/index.tsx`, or
`app/layout.tsx` — those are Next.js / Remix conventions. The only root layout
is `src/routes/__root.tsx`.

## Conventions

| File                     | URL                                                     |
| ------------------------ | ------------------------------------------------------- |
| `index.tsx`              | `/`                                                     |
| `about.tsx`              | `/about`                                                |
| `users/index.tsx`        | `/users`                                                |
| `users/$id.tsx`          | `/users/:id` (dynamic — bare `$`, no curly braces)      |
| `posts/{-$category}.tsx` | `/posts/:category?` (optional segment)                  |
| `files/$.tsx`            | `/files/*` (splat — read via `_splat` param, never `*`) |
| `_layout.tsx`            | layout route (renders children via `<Outlet />`)        |
| `__root.tsx`             | app shell — wraps every page; preserve `<Outlet />`     |

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.

## The `X.tsx` ↔ `X.page.tsx` split

Every authenticated route (`_authenticated/*`) is two files, not one — e.g.
`admin.docs.tsx` + `admin.docs.page.tsx`. This is intentional, not a
leftover:

- `X.tsx` is the real file-based route: `createFileRoute(...)`, loaders,
  `validateSearch`, and a `lazy(() => import("./X.page"))` for the
  `component`. It's tiny and stays in the eagerly-loaded router bundle.
- `X.page.tsx` has the actual page implementation (data fetching, JSX,
  state). `vite.config.ts` excludes `\.page\.tsx$` from the router plugin
  (`routeFileIgnorePattern`), so it never becomes a route on its own — it
  only exists to be lazy-loaded by its `X.tsx` counterpart.

The split keeps the router's own bundle light (route tree + loaders load on
every navigation) while deferring each page's actual weight (charts, forms,
tables) to an on-demand chunk. Adding a route means creating both files;
forgetting `X.page.tsx`'s lazy import in `X.tsx` silently drops the page's
code-splitting.
