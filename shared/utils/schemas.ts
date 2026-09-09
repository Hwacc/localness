import { z } from 'zod/v4'
import {
  GitCredentialKind,
  GitSyncAdapter,
  GitSyncConflictStatus,
  OCR_LANGUAGES,
} from '#shared/constants'

/** Accepts T | null | undefined, including a missing object key (Zod v4). */
export function zNilable<T extends z.ZodType>(schema: T) {
  return schema.nullish()
}

export const PASSWORD_REGEX = /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d_]*$/
export const zPassword = z
  .string()
  .max(16)
  .min(6)
  .regex(
    PASSWORD_REGEX,
    'Password must be at least 6 characters long and contain at least one letter and one number'
  )
export type ZPassword = z.infer<typeof zPassword>

export const zProject = z.object({
  name: z.string().min(3),
  description: zNilable(z.string()),
  teamId: z.number().int().positive().optional(),
  settings: z.object({
    ocrLanguage: z.string(),
    ocrEngine: z.number(),
    prompt: zNilable(z.string()),
  }),
})
export type ZProject = z.infer<typeof zProject>

export const zPage = z.object({
  name: z.string().min(3),
  image: z.string(),
  settings: z.object({
    ocrLanguage: z.string(),
    ocrEngine: z.number(),
    prompt: zNilable(z.string()),
  }),
})
export type ZPage = z.infer<typeof zPage>

export const zTagSetting = z.object(
  {
    locked: z.boolean(),
    style: z.any(),
    labelStyle: z.any(),
    prompt: zNilable(z.string()),
  },
  'Tag setting parameters validate failed'
)
export type ZTagSetting = z.infer<typeof zTagSetting>

export const zTag = z.object(
  {
    pageID: z.number().nonnegative(),
    tagID: z.string(),
    className: z.string(),
    width: z.number().nonnegative(),
    height: z.number().nonnegative(),
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    i18nKey: zNilable(z.string()),
    translationID: zNilable(z.number().nonnegative()),
    i18nKeyId: zNilable(z.number().nonnegative()),
    settings: zTagSetting.optional(),
  },
  'Tag parameters validate failed'
)
export type ZTag = z.infer<typeof zTag>

export const zID = z.union(
  [z.int().gt(0), z.string().min(1)],
  'ID must be a positive integer or a string'
)
export type ZID = z.infer<typeof zID>

export const zOCR = z.object(
  {
    image: z.string().nonempty(),
    language: zNilable(
      z.string().refine((v) => OCR_LANGUAGES.some((l) => l.value === v), {
        message: `language must be one of ${OCR_LANGUAGES.map(
          (l) => l.value
        ).join(', ')}`,
      })
    ),
  },
  'OCR parameters validate failed'
)
export type ZOCR = z.infer<typeof zOCR>

export const zProjectSetting = z.object(
  {
    ocrLanguage: zNilable(
      z.string().refine((v) => OCR_LANGUAGES.some((l) => l.value === v), {
        message: `language must be one of ${OCR_LANGUAGES.map(
          (l) => l.value
        ).join(', ')}`,
      })
    ),
    ocrEngine: zNilable(
      z.number().refine((v) => v === 1 || v === 2, {
        message: 'ocrEngine must be 1 or 2',
      })
    ),
    prompt: zNilable(z.string()),
  },
  'Project setting parameters validate failed'
)
export type ZProjectSetting = z.infer<typeof zProjectSetting>

export const zPageSetting = z.object(
  {
    ocrLanguage: zNilable(
      z.string().refine((v) => OCR_LANGUAGES.some((l) => l.value === v), {
        message: `language must be one of ${OCR_LANGUAGES.map(
          (l) => l.value
        ).join(', ')}`,
      })
    ),
    ocrEngine: zNilable(
      z.number().refine((v) => v === 1 || v === 2, {
        message: 'ocrEngine must be 1 or 2',
      })
    ),
    prompt: zNilable(z.string()),
  },
  'Page setting parameters validate failed'
)
export type ZPageSetting = z.infer<typeof zPageSetting>

export const zTranslationContent = z.looseObject({
  en: zNilable(z.string()).optional(),
  zh_cn: zNilable(z.string()).optional(),
  zh_tw: zNilable(z.string()).optional(),
  ja: zNilable(z.string()).optional(),
  ko: zNilable(z.string()).optional(),
  ru: zNilable(z.string()).optional(),
  fr: zNilable(z.string()).optional(),
  de: zNilable(z.string()).optional(),
  es: zNilable(z.string()).optional(),
  pt: zNilable(z.string()).optional(),
})
export type ZTranslationContent = z.infer<typeof zTranslationContent>

export const zTranslation = z.looseObject({
  origin: zNilable(z.string()).optional(),
  fingerprint: zNilable(z.string()).optional(),
  projectId: z.number().int().positive().optional(),
  key: zNilable(z.string()).optional(),
  force: z.boolean().optional(),
  vue: zNilable(zTranslationContent).optional(),
  react: zNilable(zTranslationContent).optional(),
})
export type ZTranslation = z.infer<typeof zTranslation>

export const zExport = z.object(
  {
    pages: z.array(z.string()),
    fileFormat: z.array(
      z.string().refine((v) => v === 'xlsx' || v === 'json', {
        message: 'fileFormat must be xlsx or json',
      })
    ),
    i18nKey: z.boolean(),
    dateRange: z.object({
      start: z.iso.datetime().optional(),
      end: z.iso.datetime().optional(),
    }),
  },
  'Export parameters validate failed'
)
export type ZExport = z.infer<typeof zExport>

export const zPublish = z.object({
  keyIds: z.array(z.number().int().positive()).optional(),
})
export type ZPublish = z.infer<typeof zPublish>

export const zI18nKeyPatch = z.object({
  key: z.string().min(1).optional(),
  description: zNilable(z.string()).optional(),
})
export type ZI18nKeyPatch = z.infer<typeof zI18nKeyPatch>

export const zGenI18nKey = z.object({
  projectPrompt: zNilable(z.string()),
  pagePrompt: zNilable(z.string()),
  pageImage: zNilable(z.string()),
  tagID: z.number().nonnegative(),
  tagOrigin: z.string(),
  tagI18nKey: zNilable(z.string()),
  tagPrompt: zNilable(z.string()),
})
export type ZGenI18nKey = z.infer<typeof zGenI18nKey>

export function isHttpsRemoteUrl(value: string): boolean {
  return normalizeGitHttpsRemote(value) != null
}

/** Bitbucket/GitHub browse pages are not clone URLs; turn them into https Git remotes. */
export function normalizeGitHttpsRemote(value: string): {
  remoteUrl: string
  branch?: string
} | null {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || !url.hostname) return null
  const host = url.hostname.toLowerCase()
  const pathname = url.pathname.replace(/\/+$/, '')
  const origin = `${url.protocol}//${url.host}`

  const bitbucket = pathname.match(
    /^\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/(?:src|branch)\/([^/]+))?(?:\/.*)?$/i
  )
  if (
    bitbucket &&
    (host === 'bitbucket.org' || host.endsWith('.bitbucket.org'))
  ) {
    const workspace = bitbucket[1]!
    const repo = bitbucket[2]!.replace(/\.git$/i, '')
    if (!workspace || !repo) return null
    const branch = bitbucket[3]
      ? decodeURIComponent(bitbucket[3])
      : undefined
    return {
      remoteUrl: `${origin}/${workspace}/${repo}.git`,
      branch,
    }
  }

  const github = pathname.match(
    /^\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/(?:tree|blob)\/([^/]+))?(?:\/.*)?$/i
  )
  if (github && (host === 'github.com' || host === 'www.github.com')) {
    const owner = github[1]!
    const repo = github[2]!.replace(/\.git$/i, '')
    if (!owner || !repo) return null
    const branch = github[3] ? decodeURIComponent(github[3]) : undefined
    return {
      remoteUrl: `${origin}/${owner}/${repo}.git`,
      branch,
    }
  }

  if (pathname.toLowerCase().endsWith('.git')) {
    return { remoteUrl: `${origin}${pathname}` }
  }

  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 2) {
    return {
      remoteUrl: `${origin}/${segments[0]}/${segments[1]}.git`,
    }
  }
  return null
}

export const zGitSyncBindingPut = z.object({
  enabled: z.boolean().optional(),
  adapter: z.enum([GitSyncAdapter.LILT_SWBU]).optional(),
  remoteUrl: z
    .string()
    .trim()
    .min(1)
    .refine(isHttpsRemoteUrl, 'Remote URL must be an https Git remote'),
  branch: z.string().min(1).optional(),
  product: z.string().min(1),
  credentialKind: z.enum([
    GitCredentialKind.REPO_ACCESS_TOKEN,
    GitCredentialKind.API_TOKEN,
  ]),
  token: z.string().optional(),
})
export type ZGitSyncBindingPut = z.infer<typeof zGitSyncBindingPut>

export const zGitSyncDiscoverProducts = z.object({
  remoteUrl: z
    .string()
    .trim()
    .min(1)
    .refine(isHttpsRemoteUrl, 'Remote URL must be an https Git remote'),
  branch: z.string().min(1).optional(),
  credentialKind: z.enum([
    GitCredentialKind.REPO_ACCESS_TOKEN,
    GitCredentialKind.API_TOKEN,
  ]),
  token: z.string().optional(),
})
export type ZGitSyncDiscoverProducts = z.infer<typeof zGitSyncDiscoverProducts>

export const zGitSyncConflictResolve = z.object({
  action: z.enum([
    GitSyncConflictStatus.OURS,
    GitSyncConflictStatus.THEIRS,
    GitSyncConflictStatus.MERGED,
  ]),
  text: z.string().optional(),
})
export type ZGitSyncConflictResolve = z.infer<typeof zGitSyncConflictResolve>
