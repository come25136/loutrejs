import { http } from '@loutrejs/loutre/http'

export function createApiContract(path: string) {
  return http.contract({
    graphql: { raw: true, method: '*', path },
  })
}
