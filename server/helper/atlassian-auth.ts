import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import prisma from '#server/libs/prisma'
import { UserRole } from '#shared/constants'

export const ATLASSIAN_PROVIDER = 'atlassian'

export type AtlassianAuthErrorCode =
  | 'domain'
  | 'no_account_id'
  | 'already_bound'
  | 'identity_taken'

export class AtlassianAuthError extends Error {
  constructor(
    public readonly code: AtlassianAuthErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'AtlassianAuthError'
  }
}

export type AtlassianProfile = {
  account_id?: string
  email?: string
  name?: string
  nickname?: string
  picture?: string
}

export type AtlassianPublicLink = {
  connected: boolean
  displayName?: string
  email?: string
}

export function parseAllowedEmailDomains(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean)
}

export function isEmailDomainAllowed(
  email: string | undefined,
  domains: string[]
): boolean {
  if (!email || domains.length === 0) return false
  const at = email.lastIndexOf('@')
  if (at <= 0 || at === email.length - 1) return false
  const domain = email.slice(at + 1).toLowerCase()
  return domains.includes(domain)
}

export function slugUsername(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/[^\w]+/g, '')
    .replace(/_/g, '')
    .toLowerCase()
    .slice(0, 24)
  if (slug.length >= 3) return slug
  const padded = `user${slug}`
  return padded.length >= 3 ? padded : 'user'
}

export function nextUsernameCandidate(base: string, attempt: number): string {
  if (attempt <= 1) return base
  return `${base}${attempt}`
}

function bcryptRounds(): number {
  const n = Number.parseInt(process.env.NUXT_SALT_SIZE || '10', 10)
  if (!Number.isFinite(n) || n < 4 || n > 15) return 10
  return n
}

function displayNameOf(profile: AtlassianProfile): string | undefined {
  return profile.name || profile.nickname || undefined
}

function assertProfile(
  profile: AtlassianProfile,
  domains: string[]
): { accountId: string; email: string } {
  const accountId = profile.account_id?.trim()
  if (!accountId) {
    throw new AtlassianAuthError(
      'no_account_id',
      'Atlassian account id is missing'
    )
  }
  if (!isEmailDomainAllowed(profile.email, domains)) {
    throw new AtlassianAuthError(
      'domain',
      'Email domain is not allowed'
    )
  }
  return { accountId, email: profile.email as string }
}

async function allocateUsername(seed: string): Promise<string> {
  const base = slugUsername(seed)
  for (let attempt = 1; attempt <= 50; attempt++) {
    const candidate = nextUsernameCandidate(base, attempt)
    const taken = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    })
    if (!taken) return candidate
  }
  return `${base}${randomBytes(3).toString('hex')}`
}

export async function loginOrProvisionAtlassianUser(
  profile: AtlassianProfile,
  domains: string[]
) {
  const { accountId } = assertProfile(profile, domains)

  const existing = await prisma.authIdentity.findUnique({
    where: {
      provider_providerAccountId: {
        provider: ATLASSIAN_PROVIDER,
        providerAccountId: accountId,
      },
    },
    include: { user: true },
  })
  if (existing) return existing.user

  const seed =
    profile.nickname ||
    profile.name ||
    profile.email?.split('@')[0] ||
    'user'
  const username = await allocateUsername(seed)
  const password = await bcrypt.hash(randomBytes(32).toString('hex'), bcryptRounds())

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username,
        password,
        role: UserRole.USER,
        nickname: displayNameOf(profile) ?? null,
        email: profile.email ?? null,
        avatar: profile.picture ?? null,
      },
    })
    await tx.authIdentity.create({
      data: {
        provider: ATLASSIAN_PROVIDER,
        providerAccountId: accountId,
        displayName: displayNameOf(profile) ?? null,
        email: profile.email ?? null,
        userId: user.id,
      },
    })
    return user
  })
}

export async function bindAtlassianToUser(
  userId: number,
  profile: AtlassianProfile,
  domains: string[]
) {
  const { accountId } = assertProfile(profile, domains)

  const byAccount = await prisma.authIdentity.findUnique({
    where: {
      provider_providerAccountId: {
        provider: ATLASSIAN_PROVIDER,
        providerAccountId: accountId,
      },
    },
  })
  if (byAccount && byAccount.userId !== userId) {
    throw new AtlassianAuthError(
      'identity_taken',
      'This Atlassian account is already linked'
    )
  }
  if (byAccount && byAccount.userId === userId) return byAccount

  const byUser = await prisma.authIdentity.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: ATLASSIAN_PROVIDER,
      },
    },
  })
  if (byUser) {
    throw new AtlassianAuthError(
      'already_bound',
      'This user already has an Atlassian account'
    )
  }

  return prisma.authIdentity.create({
    data: {
      provider: ATLASSIAN_PROVIDER,
      providerAccountId: accountId,
      displayName: displayNameOf(profile) ?? null,
      email: profile.email ?? null,
      userId,
    },
  })
}

export function atlassianOAuthRedirect(
  code: AtlassianAuthErrorCode | 'atlassian',
  boundFlow: boolean
): string {
  switch (code) {
    case 'already_bound':
    case 'identity_taken':
      return `/dashboard?oauth_error=${code}&settings=1`
    case 'domain':
    case 'no_account_id':
    case 'atlassian':
      return boundFlow
        ? `/dashboard?oauth_error=${code}&settings=1`
        : `/?oauth_error=${code}`
    default: {
      const _exhaustive: never = code
      return boundFlow
        ? `/dashboard?oauth_error=${_exhaustive}&settings=1`
        : `/?oauth_error=${_exhaustive}`
    }
  }
}

export function toPublicUser<
  T extends {
    password?: string
    passwordSetAt?: Date | null
    createdAt?: Date
    updatedAt?: Date
  },
>(
  user: T,
  identity?: {
    displayName?: string | null
    email?: string | null
  } | null
) {
  const {
    password: _password,
    passwordSetAt,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    ...rest
  } = user
  const atlassian: AtlassianPublicLink = identity
    ? {
        connected: true,
        ...(identity.displayName
          ? { displayName: identity.displayName }
          : {}),
        ...(identity.email ? { email: identity.email } : {}),
      }
    : { connected: false }
  return {
    ...rest,
    hasPasswordSet: passwordSetAt != null,
    atlassian,
  }
}

export async function loadPublicUser(userId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  })
  if (!user) return null
  const identity = await prisma.authIdentity.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: ATLASSIAN_PROVIDER,
      },
    },
  })
  return toPublicUser(user, identity)
}
