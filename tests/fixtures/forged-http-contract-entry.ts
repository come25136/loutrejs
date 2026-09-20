export default {
  kind: 'http-contract',
  routes: {
    get: {
      method: 'GET',
      path: '/forged',
      responses: { ok: { status: 200 } },
    },
  },
}
