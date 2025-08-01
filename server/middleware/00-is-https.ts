export default defineEventHandler((event) => {
  const proto = event.node.req.headers['x-forwarded-proto']
  const isHttps = proto === 'https'
  event.context.isHttps = isHttps
})