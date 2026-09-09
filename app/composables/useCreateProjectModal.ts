import { ProjectModal } from '#components'

export function useCreateProjectModal() {
  const overlay = useOverlay()
  const projectStore = useProjectStore()
  const modal = overlay.create(ProjectModal, {
    props: {
      mode: 'create',
    },
  })

  function open(teamId?: ID) {
    modal.open({
      mode: 'create',
      project: emptyProject({ name: '', teamId }),
      onSave: async (
        payload: Pick<IProject, 'name' | 'description' | 'settings' | 'teamId'>,
        { close }: { close: () => void }
      ) => {
        const created = await projectStore.createProject(payload)
        if (!created) return
        projectStore.setCurrentProject(created)
        close()
      },
    })
  }

  return { open }
}
