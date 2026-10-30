export class AuthenticationError extends Error {
  constructor(readonly status: 400 | 401) {
    super('認証に失敗しました。')
  }
}

export function webSocketAuthorization(
  request: Request,
  params: Readonly<Record<string, unknown>> | undefined,
): unknown {
  const header = request.headers.get('authorization')
  if (params && Object.hasOwn(params, 'authorization')) {
    if (header !== null || typeof params.authorization !== 'string')
      throw new AuthenticationError(400)
    return params.authorization
  }
  return header
}
