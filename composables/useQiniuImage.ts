import { parseURL, parseQuery } from 'ufo'

export const useQiniuImage = () => {
  const { $imageCache, $dayjs } = useNuxtApp()

  /**
   * Get image url from cache or oss
   * @param key image key
   */
  async function get(key: string) {
    if (!key) return key
    const cached = $imageCache.get(key)
    if (cached && cached.deadline) {
      if ($dayjs().isBefore($dayjs.unix(cached.deadline))) {
        return cached.url || key
      }
    }
    const url = await useApi<string>('/api/common/gen-access-url', {
      method: 'POST',
      body: {
        key,
      },
    })
    const { search } = parseURL(url)
    $imageCache.set(key, {
      url,
      deadline: parseInt(parseQuery(search).e as string),
    })
    return url
  }
  return { get }
}
