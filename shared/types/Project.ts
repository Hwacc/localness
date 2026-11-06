import type {
  I18nKeyNamespaceCounts,
  KeyNamespace as IKeyNamespace,
  ProjectRelease as IProjectRelease,
} from '../contract'
import type { IUser } from './User'
import type { IPage } from './Page'
import type { ID } from '.'
import type { ITeam } from './Team'
import type { KeyStyle } from '../utils/key-convention'
import type { I18nDialect, RuleSeverity } from '../utils/consistency/dialect'
import { DEFAULT_KEY_CONVENTION, slugKeyPrefix } from '../utils/key-convention'

export interface IProjectSetting {
  ocrLanguage: string
  ocrEngine: number
  prompt?: string | null
  locales?: string[]
  localeFallback?: string
  /** Key naming convention. Every settings row has one; the DB holds defaults. */
  keyPrefix: string
  keySeparator: string
  keyStyle: KeyStyle
  keyMaxDepth: number
  /** Consistency lint switches by ruleId; absent entry = enabled. */
  lintRules?: Record<string, boolean>
  /** Which i18n runtime's syntax the Consistency checks read. */
  i18nDialect?: I18nDialect
  /** Consistency severity overrides by ruleId; absent = rule default. */
  ruleSeverity?: Record<string, RuleSeverity>
}

export interface IProjectOwner {
  userId: ID
  username?: string
  nickname?: string
}

/**
 * A release label. Filter-only: it groups a project's pages and entries by the
 * version they shipped in, and never carries a second copy of any text. Defined
 * in `@localness/contract` because `/api/v1/meta` returns it.
 */
export type { IProjectRelease }

/**
 * A declared key namespace. Keys join it by name, so it carries no key list.
 * Defined in `@localness/contract` because `/api/v1/meta` returns it.
 */
export type { IKeyNamespace }

/** The Translations namespace rail's counts. */
export type { I18nKeyNamespaceCounts }

/**
 * The rail's counts as the app reads them. `unnamed` is a page-only group, so
 * it lives here rather than in the published contract.
 */
export interface I18nKeyRailCounts extends I18nKeyNamespaceCounts {
  /** The editor's placeholder keys (`__unnamed_…`); `ungrouped` leaves them out. */
  unnamed: number
}

/** Which Project Settings tab to open on. */
export type ProjectSettingsTab =
  | 'basic'
  | 'prompt'
  | 'settings'
  | 'consistency'
  | 'releases'
  | 'namespaces'

export interface IProject {
  id: ID
  name: string
  description: string
  createdAt?: string
  updatedAt?: string
  users: IUser[]
  pages: IPage[]
  teamId?: ID
  team?: ITeam
  settings?: IProjectSetting
  owners?: IProjectOwner[]
  releases?: IProjectRelease[]
  /** In display order. */
  namespaces?: IKeyNamespace[]
  isSteward?: boolean
}

export class Project implements IProject {
  id: ID = 0
  name: string
  description: string = ''
  pages: IPage[] = []
  users: IUser[] = []
  teamId?: ID
  team?: ITeam
  settings?: IProjectSetting
  namespaces?: IKeyNamespace[]

  constructor(name?: string) {
    this.name = name ?? 'Undefined'
    this.settings = {
      ocrLanguage: 'eng',
      ocrEngine: 1,
      prompt: '',
      keyPrefix: slugKeyPrefix(this.name),
      keySeparator: DEFAULT_KEY_CONVENTION.separator,
      keyStyle: DEFAULT_KEY_CONVENTION.style,
      keyMaxDepth: DEFAULT_KEY_CONVENTION.maxDepth,
    }
  }
}
