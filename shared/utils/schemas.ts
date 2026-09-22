import { z } from 'zod/v4'
import {
  GitCredentialKind,
  GitSyncAdapter,
  GitSyncConflictStatus,
  NotificationAction,
  OCR_LANGUAGES,
  TeamRole,
} from '#shared/constants'
import { KEY_STYLE_VALUES } from '#shared/utils/key-convention'

/** Accepts T | null | undefined, including a missing object key (Zod v4). */
export function zNilable<T extends z.ZodType>(schema: T) {
  return schema.nullish()
}

export const PASSWORD_REGEX = /^(?=.*[a-zA-Z])(?=.*\d)[a-zA-Z\d_]*$/
// Messages are user-facing: forms surface the first failing check, so the empty
// case gets its own prompt instead of falling through to the length message.
export const zPassword = z
  .string()
  .min(1, 'Please enter your password')
  .min(6, 'Password needs at least 6 characters')
  .max(16, 'Password can be at most 16 characters')
  .regex(
    PASSWORD_REGEX,
    'Password can use letters, numbers and underscore, and needs at least one letter and one number'
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
    // Optional, not nilable: the columns are NOT NULL, and `null` for "no
    // prefix" would be ambiguous — the empty string is that.
    keyPrefix: z.string().optional(),
    keySeparator: z.string().min(1, 'separator cannot be empty').optional(),
    keyStyle: z.enum(KEY_STYLE_VALUES).optional(),
    keyMaxDepth: z.number().int().min(1).max(10).optional(),
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
    // Nilable, unlike the project's: on a page `null` means "inherit", and the
    // form writes all four or leaves all four alone.
    keyPrefix: zNilable(z.string()),
    keySeparator: zNilable(z.string().min(1, 'separator cannot be empty')),
    keyStyle: zNilable(z.enum(KEY_STYLE_VALUES)),
    keyMaxDepth: zNilable(z.number().int().min(1).max(10)),
  }),
  /** Release labels to attach. Omitted leaves them untouched on update. */
  releaseIds: z.array(z.number().int().positive()).optional(),
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
    /** Labels for the key this tag is bound to. Omitted leaves them untouched. */
    releaseIds: z.array(z.number().int().positive()).optional(),
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
    keyPrefix: zNilable(z.string()),
    keySeparator: zNilable(z.string().min(1, 'separator cannot be empty')),
    keyStyle: zNilable(z.enum(KEY_STYLE_VALUES)),
    keyMaxDepth: zNilable(z.number().int().min(1).max(10)),
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
  /** Release labels to attach. Omitted leaves them untouched on update. */
  releaseIds: z.array(z.number().int().positive()).optional(),
})
export type ZTranslation = z.infer<typeof zTranslation>

/**
 * Release labels. The name's *content* is judged by `releaseNameRejectReason`
 * in the server helper rather than by zod, so an empty name reports the rule's
 * message instead of a schema path error.
 */
export const zReleaseCreate = z.object({ name: z.string() })
export type ZReleaseCreate = z.infer<typeof zReleaseCreate>

export const zReleaseRename = z.object({ name: z.string() })
export type ZReleaseRename = z.infer<typeof zReleaseRename>

/** One call covers one kind, so a rejected id is unambiguous to report. */
export const zReleaseMembership = z.object({
  releaseId: z.number().int().positive(),
  kind: z.enum(['page', 'key']),
  ids: z.array(z.number().int().positive()),
  mode: z.enum(['add', 'remove']),
})
export type ZReleaseMembership = z.infer<typeof zReleaseMembership>

/**
 * Export takes an explicit selection, not filters: the user picks keys in the
 * step 2 table, so search / status / date filtering happens there and never
 * reaches this endpoint. What you saw in the table is what gets exported.
 */
export const zExportSelection = z.object({
  /** Pages whose screenshots are exported, and the scope for tag rows. */
  pages: z.array(z.string()),
  /** Keys chosen in the picker table. */
  keyIds: z.array(z.number().int().positive()),
  /** Locale columns, in the order they should appear. */
  locales: z.array(z.string().min(1)),
  /** Keep the project's fallback locale column even if it was not picked. */
  includeFallbackLocale: z.boolean().default(true),
})
export type ZExportSelection = z.infer<typeof zExportSelection>

export const zExport = zExportSelection.extend({
  fileFormat: z.array(
    z.string().refine((v) => v === 'xlsx' || v === 'json', {
      message: 'fileFormat must be xlsx or json',
    })
  ),
})
export type ZExport = z.infer<typeof zExport>

export const zPublish = z.object({
  keyIds: z.array(z.number().int().positive()).optional(),
  /**
   * Restrict the change to these locales. Omitted means every locale on the
   * selected keys — callers that only touched one locale (a single cell) must
   * pass it, or they publish someone else's unrelated draft.
   */
  locales: z.array(z.string().min(1)).optional(),
  /**
   * Exact `key + locale` pairs, addressed by key name. For callers holding a
   * heterogeneous set (git pull results): `keyIds × locales` would be a cross
   * product and would publish pairs the caller never touched.
   */
  rows: z
    .array(
      z.object({
        key: z.string().min(1),
        locale: z.string().min(1),
      })
    )
    .optional(),
})
export type ZPublish = z.infer<typeof zPublish>

export const zI18nKeyPatch = z.object({
  key: z.string().min(1).optional(),
  description: zNilable(z.string()).optional(),
})
export type ZI18nKeyPatch = z.infer<typeof zI18nKeyPatch>

export const zI18nGitSyncToggle = z.object({
  enabled: z.boolean(),
})
export type ZI18nGitSyncToggle = z.infer<typeof zI18nGitSyncToggle>

/** `.max` is headroom, not a limit the UI can reach: selection is page-scoped. */
export const zI18nGitSyncBulk = z.object({
  enabled: z.boolean(),
  keyIds: z.array(z.number().int().positive()).min(1).max(500),
})
export type ZI18nGitSyncBulk = z.infer<typeof zI18nGitSyncBulk>

/** `.max` is a guard for hand-rolled callers: the UI can never select this many. */
export const zI18nTransfer = z.object({
  mode: z.enum(['copy', 'move']),
  targetProjectId: z.number().int().positive(),
  keyIds: z.array(z.number().int().positive()).min(1).max(200),
})
export type ZI18nTransfer = z.infer<typeof zI18nTransfer>

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

/**
 * Naming a key for an entry rather than a tag. No tag id, and no page-level
 * guidance: an entry's tags can sit on several pages, so the project's own
 * prompt is the only instruction that is certain to apply.
 */
export const zGenI18nKeyForProject = z.object({
  origin: z.string().min(1),
})
export type ZGenI18nKeyForProject = z.infer<typeof zGenI18nKeyForProject>

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
    GitSyncConflictStatus.RENAMED,
  ]),
  text: z.string().optional(),
  /** Only for `renamed`: the name the platform's key moves to. */
  newKey: z.string().trim().min(1).optional(),
})
export type ZGitSyncConflictResolve = z.infer<typeof zGitSyncConflictResolve>

export const zTeamInviteCodeCreate = z.object({
  role: z.enum([TeamRole.OWNER, TeamRole.MEMBER]).optional(),
  maxUses: z.number().int().positive().nullable().optional(),
  expiresAt: z.string().min(1).nullable().optional(),
})
export type ZTeamInviteCodeCreate = z.infer<typeof zTeamInviteCodeCreate>

export const zTeamInviteJoin = z.object({
  code: z.string().trim().min(1),
})
export type ZTeamInviteJoin = z.infer<typeof zTeamInviteJoin>

/**
 * Inviting a member is by id, not username: the picker resolves a search hit to
 * a user, and nickname/email are neither unique nor stable enough to key on.
 */
export const zTeamInviteMember = z.object({
  userId: z.number().int().positive(),
  role: z.enum([TeamRole.OWNER, TeamRole.MEMBER]).optional(),
})
export type ZTeamInviteMember = z.infer<typeof zTeamInviteMember>

export const zNotificationAct = z.object({
  action: z.enum([
    NotificationAction.ACCEPTED,
    NotificationAction.DECLINED,
  ]),
})
export type ZNotificationAct = z.infer<typeof zNotificationAct>

/** Which Inbox rows an action applies to. Omitted ids means all of them. */
export const zNotificationIds = z.object({
  ids: z.array(z.number().int().positive()).optional(),
})
export type ZNotificationIds = z.infer<typeof zNotificationIds>
