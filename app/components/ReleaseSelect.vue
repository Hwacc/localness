<script setup lang="ts">
/**
 * Multi-select over this project's releases, for tagging a page or an i18n key.
 *
 * `USelectMenu` renders a multiple selection as one comma-joined string with no
 * per-item control, so the only way to take a release off something was to
 * reopen its dropdown and toggle the entry back off — and nothing on the trigger
 * said so. `UInputMenu` renders the selection as tags, each with a delete button.
 *
 * `create-item` is deliberately left at its default (off): typing a name must
 * never mint a release that does not exist. Releases are created in the settings
 * roster, by a project steward.
 */

/** Loosely typed because `PageModal`'s form state carries `releaseIds` as optional. */
// eslint-disable-next-line vue/require-default-prop
const model = defineModel<number[] | undefined>()

const props = defineProps<{
  disabled?: boolean
}>()

const projectStore = useProjectStore()

const releaseItems = computed(() =>
  projectStore.curReleases.map((release) => ({
    label: release.name,
    value: Number(release.id),
  }))
)

/**
 * Shown only while nothing is tagged. In tags mode the placeholder belongs to
 * the text input, so it keeps rendering next to the tags — and "Not in any
 * release" sitting beside a release reads as a contradiction.
 */
const placeholder = computed(() =>
  model.value?.length ? undefined : 'Not in any release'
)
</script>

<template>
  <UInputMenu
    v-model="model"
    class="w-full"
    multiple
    :items="releaseItems"
    value-key="value"
    :disabled="props.disabled"
    :placeholder="placeholder"
  />
</template>
