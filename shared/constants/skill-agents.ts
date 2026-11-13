/** Agents a skill can be tagged with on the Skills page. Icons are bundled in `nuxt.config`. */
export const SKILL_AGENTS = [
  { id: 'claude-code', name: 'Claude Code', icon: 'simple-icons:claude' },
  { id: 'codex', name: 'OpenAI Codex', icon: 'simple-icons:openai' },
  { id: 'github-copilot', name: 'GitHub Copilot', icon: 'simple-icons:githubcopilot' },
  { id: 'cursor', name: 'Cursor', icon: 'simple-icons:cursor' },
  { id: 'gemini-cli', name: 'Gemini CLI', icon: 'simple-icons:googlegemini' },
  { id: 'hermes', name: 'Hermes Agent', icon: 'logos:hermes-agent' },
] as const

/** Works with any agent; exclusive with every other choice. */
export const SKILL_AGENT_GENERAL = 'general'
export const SKILL_AGENT_GENERAL_ICON = 'lucide:globe'
export const SKILL_AGENT_CUSTOM_ICON = 'lucide:bot'

export const SKILL_CUSTOM_AGENT_MAX_LEN = 24
export const SKILL_CUSTOM_AGENT_MAX = 5
