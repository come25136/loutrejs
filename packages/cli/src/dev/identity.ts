type DevtoolsUrl<Kind extends string> = string & {
  readonly '~loutre.cli-devtools-url': Kind
}
export type DevtoolsBaseUrl = DevtoolsUrl<'base'>
export type DevtoolsClientEndpoint = DevtoolsUrl<'client'>
export type DevtoolsApplicationEndpoint = DevtoolsUrl<'application'>
export const devtoolsBaseUrl = (port: number): DevtoolsBaseUrl =>
  `http://127.0.0.1:${port}` as DevtoolsBaseUrl
export const devtoolsClientEndpoint = (
  port: number,
  path: string,
): DevtoolsClientEndpoint =>
  `ws://127.0.0.1:${port}${path}` as DevtoolsClientEndpoint
export const devtoolsApplicationEndpoint = (
  port: number,
  path: string,
): DevtoolsApplicationEndpoint =>
  `ws://127.0.0.1:${port}${path}` as DevtoolsApplicationEndpoint
