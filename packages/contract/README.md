# @localness/contract

Response contracts of the Localness public `/api/v1`: [zod](https://zod.dev) schemas and the TypeScript types inferred from them. Meant for callers outside the Localness repo, such as a design-tool plugin or build tooling.

```ts
import { deliveryMetaSchema, type DeliveryMeta } from '@localness/contract'

const meta: DeliveryMeta = deliveryMetaSchema.parse(await res.json())
```

`zod` ^4 is a peer dependency.

## Versioning

Independent of the Localness server version.

- A new optional field: minor.
- A removed, renamed, or retyped field, or a field that stops being optional: major.
- While the version is `0.x`, breaking changes bump the minor.

The schemas are not strict: an unknown field from a newer server is stripped rather than rejected, so an older client keeps working.

## Release

Push a tag `contract-v<semver>`. The `contract-release` workflow type-checks, tests, and publishes with npm provenance.
