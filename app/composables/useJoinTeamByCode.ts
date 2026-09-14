export function useJoinTeamByCode(
  onJoined: (team: ITeam) => void | Promise<void>
) {
  const toast = useToast()
  const joinCode = ref('')
  const joining = ref(false)

  async function joinWithCode() {
    const code = joinCode.value.trim()
    if (!code) return
    joining.value = true
    try {
      const result = await useApi<{
        alreadyMember: boolean
        role: string
        team: ITeam
      }>('/api/teams/join', {
        method: 'POST',
        body: { code },
      })
      if (!result) return
      joinCode.value = ''
      toast.add({
        title: result.alreadyMember ? 'Already in this team' : 'Joined team',
        description: result.team.name,
        color: 'success',
        icon: 'i-lucide:check',
      })
      await onJoined(result.team)
    } finally {
      joining.value = false
    }
  }

  return { joinCode, joining, joinWithCode }
}
