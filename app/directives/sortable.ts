import type { Directive } from 'vue'
import type Sortable from 'sortablejs'
import SortableJs from 'sortablejs'

export interface SortableBinding {
  /** Unique per list — Sortable only moves items between lists of the same name. */
  group: string
  onEnd: (projectId: string, toIndex: number) => void
}

interface SortableState {
  binding: SortableBinding
  instance?: Sortable
  /** Armed by a real drag so the click that trails the drop is swallowed. */
  suppressClick: boolean
  onClick: (event: MouseEvent) => void
  onPointerDown: () => void
}

const states = new WeakMap<HTMLElement, SortableState>()

export const sortableDirective: Directive<HTMLElement, SortableBinding> = {
  mounted(el, binding) {
    const state: SortableState = {
      binding: binding.value,
      suppressClick: false,
      onClick: () => {},
      onPointerDown: () => {},
    }

    // Sortable's own click guard only fires on its fallback path, and its
    // document listener is skipped entirely on Chrome for Android — so a
    // `<button>` card would otherwise count a drop as a click and switch
    // project. Capture phase, so this runs before the card's own handler.
    state.onClick = (event: MouseEvent) => {
      if (!state.suppressClick) return
      state.suppressClick = false
      event.stopPropagation()
      event.preventDefault()
    }
    // Backstop: a drop that produced no click must not eat a later, real one.
    state.onPointerDown = () => {
      state.suppressClick = false
    }
    el.addEventListener('click', state.onClick, true)
    el.addEventListener('pointerdown', state.onPointerDown, true)

    state.instance = SortableJs.create(el, {
      animation: 150,
      // The only path that gives a movement threshold: with native drag,
      // sortablejs forces `touchStartThreshold` to 1 and the sole gate is the
      // browser's own dragstart. Below the tolerance the press stays a click.
      forceFallback: true,
      fallbackTolerance: 6,
      draggable: '[data-project-id]',
      // The card's own action row is not a drag handle, and must stay clickable —
      // hence `preventOnFilter: false` rather than the default.
      filter: '[data-no-drag]',
      preventOnFilter: false,
      // Explicit: never let a card cross into another Team's list.
      group: { name: binding.value.group, pull: false, put: false },
      onStart: () => {
        state.suppressClick = true
      },
      onEnd: (event) => {
        const projectId = (event.item as HTMLElement).dataset.projectId
        const to = event.newDraggableIndex
        if (projectId === undefined || to === undefined) return
        if (event.oldDraggableIndex === to) return
        state.binding.onEnd(projectId, to)
      },
    })

    states.set(el, state)
  },
  // Only swap the binding: recreating the instance mid-gesture would drop the drag.
  updated(el, binding) {
    const state = states.get(el)
    if (state) state.binding = binding.value
  },
  unmounted(el) {
    const state = states.get(el)
    if (!state) return
    el.removeEventListener('click', state.onClick, true)
    el.removeEventListener('pointerdown', state.onPointerDown, true)
    state.instance?.destroy()
    states.delete(el)
  },
}
