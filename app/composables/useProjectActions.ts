import { ProjectExportModal, ProjectModal } from '#components'

export function useProjectActions() {
  const overlay = useOverlay()
  const projectStore = useProjectStore()

  const settingsModal = overlay.create(ProjectModal, {
    props: {
      mode: 'edit',
    },
  })
  const exportModal = overlay.create(ProjectExportModal, {
    props: {},
  })

  function openSettings(project?: IProject) {
    const target = project ?? projectStore.curProject
    if (!validID(target.id)) return
    if (String(target.id) !== String(projectStore.curProject.id)) {
      projectStore.setCurrentProject(target)
    }
    settingsModal.open({
      mode: 'edit',
      project: projectStore.curProject,
      onSave: async (
        payload: Pick<IProject, 'name' | 'description' | 'settings' | 'teamId'>,
        { close }: { close: () => void }
      ) => {
        await projectStore.updateProject(projectStore.curProject.id, payload)
        close()
      },
    })
  }

  function openExport(project?: IProject) {
    const target = project ?? projectStore.curProject
    if (!validID(target.id)) return
    if (String(target.id) !== String(projectStore.curProject.id)) {
      projectStore.setCurrentProject(target)
    }
    exportModal.open()
  }

  return { openSettings, openExport }
}
