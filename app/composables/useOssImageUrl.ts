import { hasProtocol } from 'ufo'

/**
 * Browser URL for an `avatar`-style value, which is either an OSS key or an
 * absolute third-party URL — Atlassian sign-in stores a Gravatar link in
 * `User.avatar`. Mirrors the passthrough in the `v-oss-image` directive, but
 * hands the URL back so a component can bind `src` itself and keep its own
 * `@error` handling instead of the directive's placeholder image.
 *
 * A nullish source resolves to `''` without touching OSS, so a caller can opt
 * out by returning null from the getter.
 */
export function useOssImageUrl(
  source: MaybeRefOrGetter<string | null | undefined>
) {
  const ossImage = useOSSImage()
  const url = ref('')

  watchEffect(async () => {
    const value = toValue(source)
    if (!value) {
      url.value = ''
      return
    }
    if (hasProtocol(value)) {
      url.value = value
      return
    }
    url.value = await ossImage.get(value)
  })

  return url
}
