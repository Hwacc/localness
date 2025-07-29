export type ID = string | number

export type ImageCache = {
  url: string
  deadline: number
}

export type AgentJWT = {
  token_type: string
  access_token: string
  refresh_token: string
  expires_in: number
}
