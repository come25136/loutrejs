import { http } from '@loutrejs/loutre/http'

export const ApiContract = http.contract({
  graphql: { raw: true, method: '*', path: '/graphql' },
})
