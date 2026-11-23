# @localness/contract

Response contracts of the Localness public `/api/v1`: [zod](https://zod.dev) schemas and the TypeScript types inferred from them. Meant for callers outside the Localness repo, such as a design-tool plugin or build tooling.

```ts
import { deliveryMetaSchema, type DeliveryMeta } from '@localness/contract'

const meta: DeliveryMeta = deliveryMetaSchema.parse(await res.json())
```

`zod` ^4 is a peer dependency.

## Rules

`@localness/contract/rules` holds the pure rules a client must apply the way the server does: `fpTranslation` (the text fingerprint behind unnamed keys), `checkI18nKey` (why a key name breaks the project's key convention, with `KEY_VIOLATION_TEXT`) and `namespaceOf` (which declared namespace a key belongs to: names are relative to the project's key prefix). The convention and the namespace names come from `GET /api/v1/meta` (`keyConvention`, `namespaces`). It does not need `zod`.

```ts
import { checkI18nKey, namespaceOf } from '@localness/contract/rules'

const { keyConvention, namespaces } = meta
checkI18nKey('shop_login_title', keyConvention) // []
namespaceOf('shop_login_title', namespaces.map((ns) => ns.name), keyConvention.prefix) // 'login'
```

## Locale files

`@localness/contract/locale-file` reads and writes one-JSON-per-locale files exactly as Localness git-sync does: flat or nested keys, edits in place (key order, indentation, comments and line endings are kept), new keys appended. The `localness` CLI uses it, so a file written by either one is identical. It does not need `zod`.

```ts
import { readLocaleFile, writeLocaleFile } from '@localness/contract/locale-file'

const { entries } = readLocaleFile(source)
const next = writeLocaleFile(source, { 'home.title': 'Welcome', 'old.key': null }, 'nested-json')
```

Arrays are read by index: `{"steps":[{"title":"A"}],"tips":["x"]}` gives the keys `steps.0.title` and `tips.0`. Such a key can only be updated in place. `unwritableKeys` refuses a new key under an array (`steps.1.title` while `steps` has one element, `tips.x`), and a `null` for a key inside an array is ignored, so no write ever adds or removes an element and shifts the keys after it. `inArray(path)` tells such a key apart: `inArray(readLocaleFile(source).paths.get(key)!)`.

`paths` and `blocked` hold `LocaleKeyPath` (`(string | number)[]`, a number per array index), and `arrays` lists the path of every array. Before 0.6.0 they were `string[]` and arrays were only `blocked`.

## Versioning

Independent of the Localness server version.

- A new optional field: minor.
- A removed, renamed, or retyped field, or a field that stops being optional: major.
- While the version is `0.x`, breaking changes bump the minor.

The schemas are not strict: an unknown field from a newer server is stripped rather than rejected, so an older client keeps working.

## Release

Push a tag `contract-v<semver>`. The `contract-release` workflow type-checks, tests, and publishes with npm provenance.
