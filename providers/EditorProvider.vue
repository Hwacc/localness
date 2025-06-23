<script lang="ts">
import type { ShallowRef, Ref } from 'vue'
import type { Editor, EditorMode } from '~/core/Editor'

export interface IEditorContext {
  editor: ShallowRef<Editor | undefined>
  ready: Ref<boolean>
  scale: Ref<number>
  mode: Ref<EditorMode>
  line: Ref<number>
}

const injectionKey: InjectionKey<IEditorContext> = Symbol('EditorContext')

export function injectEditorContext() {
  return inject<IEditorContext>(injectionKey, {
    editor: shallowRef<Editor>(),
    ready: ref(false),
    scale: ref(1),
    mode: ref('drag'),
    line: ref(2),
  } as IEditorContext)
}

export function provideEditorContext(contextValue: IEditorContext) {
  provide(injectionKey, contextValue)
  return contextValue
}
</script>
<script setup lang="ts"></script>
<template>
  <slot />
</template>
