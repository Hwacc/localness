<script lang="ts">
import type { IPage } from '~/types/interfaces'
import { Page } from '~/types/page'
import { injectProjectContext } from './ProjectProvider.vue'

export interface IPageContext {
  page: Ref<IPage>
  createPage: (page: Omit<IPage, 'id'>) => Promise<IPage | null>
  updatePage: (page: Omit<IPage, 'id'>) => Promise<IPage | null>
}

const injectionKey: InjectionKey<IPageContext> = Symbol('PageContext')

export function injectPageContext() {
  return inject(injectionKey, {
    page: ref(new Page()),
    createPage: () => Promise.reject(new Error('Not implemented')),
    updatePage: () => Promise.reject(new Error('Not implemented')),
  })
}

export function providePageContext(contextValue: IPageContext) {
  provide(injectionKey, contextValue)
  return contextValue
}
</script>

<script setup lang="ts">
const { curProject } = injectProjectContext()

const page = ref(new Page())

async function createPage(page: Omit<IPage, 'id'>) {
  return new Page()
}

async function updatePage(page: Omit<IPage, 'id'>) {
  return new Page()
}

providePageContext({ page, createPage, updatePage })
</script>

<template>
  <slot />
</template>
