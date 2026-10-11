import { createHttpDispatchKey, parseHttpPath } from './path.js'

export interface HttpRouteDescriptor {
  readonly method: string
  readonly path: string
}

export interface HttpRouteConflict<TRoute extends HttpRouteDescriptor> {
  readonly existing: TRoute
  readonly route: TRoute
}

export function findHttpRouteConflicts<TRoute extends HttpRouteDescriptor>(
  routes: readonly TRoute[],
): readonly HttpRouteConflict<TRoute>[] {
  const dispatches = new Map<string, TRoute>()
  const conflicts: HttpRouteConflict<TRoute>[] = []

  for (const route of routes) {
    const dispatch = createHttpDispatchKey(
      route.method,
      parseHttpPath(route.path),
    )
    const existing =
      dispatches.get(dispatch) ??
      [...dispatches.values()].find(
        (candidate) =>
          (route.method === '*' || candidate.method === '*') &&
          createHttpDispatchKey('*', parseHttpPath(candidate.path)) ===
            createHttpDispatchKey('*', parseHttpPath(route.path)),
      )
    if (existing) {
      conflicts.push({ existing, route })
      continue
    }
    dispatches.set(dispatch, route)
  }

  return conflicts
}
