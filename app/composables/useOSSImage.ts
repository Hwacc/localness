import { parseURL, parseQuery } from 'ufo'
import { OSSEngine } from '#shared/constants'

export function useOSSImage() {
  const { $imageCache, $dayjs } = useNuxtApp()
  /**
   * Get image url from cache or oss
   * @param key image key
   */
  async function get(key: string): Promise<string> {
    if (!key) return key
    const { ossEngine, ossBaseUrl } = useRuntimeConfig().public

    // get from cache
    const cached = $imageCache.get(key)
    if (cached && cached.deadline) {
      if ($dayjs().isBefore($dayjs.unix(cached.deadline))) {
        return cached.url
      }
    }
    
    // if ossEngine is QINIU, generate oss url
    if (ossEngine === OSSEngine.QINIU) {
      const url = await useApi<string>('/api/common/gen-oss-url', {
        method: 'POST',
        body: { key },
      })
      const { search } = parseURL(url)
      $imageCache.set(key, {
        url,
        deadline: parseInt(parseQuery(search).e as string),
      })
      return url
    }

    // if ossEngine is LOCAL, return ossBaseUrl + key
    if (ossEngine === OSSEngine.LOCAL) {
      return ossBaseUrl + key
    }
    return ''
  }
  return { get }
}
