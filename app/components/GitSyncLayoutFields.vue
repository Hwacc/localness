<script setup lang="ts">
/**
 * Where the project's strings live in the repo, for the Git sync setup and
 * settings forms. A LILT product folder is picked from the remote; a
 * locale-files directory is typed, since any folder could hold locale files.
 */
import {
  GIT_SYNC_DEFAULT_PATTERN,
  GitSyncAdapter,
  GitSyncFileFormat,
} from '#shared/constants'

const adapter = defineModel<GitSyncAdapter>('adapter', { required: true })
const product = defineModel<string>('product', { required: true })
const pattern = defineModel<string>('pattern', { required: true })
const format = defineModel<GitSyncFileFormat>('format', { required: true })

const props = defineProps<{
  productItems: { value: string; label: string }[]
  discovering: boolean
  canDiscover: boolean
  /** Shows the "paste a token" hint under Load products. */
  showDiscoverHint?: boolean
}>()

const emit = defineEmits<{ loadProducts: [] }>()

const adapterItems = [
  { label: 'LILT product folder (append-only batches)', value: GitSyncAdapter.LILT_SWBU },
  { label: 'Locale files (one JSON per locale, updated in place)', value: GitSyncAdapter.LOCALE_FILES },
]

const formatItems = [
  { label: 'Nested JSON ({ "home": { "title": … } })', value: GitSyncFileFormat.NESTED_JSON },
  { label: 'Flat JSON ({ "home.title": … })', value: GitSyncFileFormat.FLAT_JSON },
]

/** A product name is no directory, nor the other way round. */
function changeAdapter(next: GitSyncAdapter) {
  if (next === adapter.value) return
  adapter.value = next
  product.value = ''
}
</script>

<template>
  <UFormField label="Layout" name="adapter">
    <USelect
      :model-value="adapter"
      class="w-full"
      :items="adapterItems"
      @update:model-value="changeAdapter"
    />
  </UFormField>

  <UFormField
    v-if="adapter === GitSyncAdapter.LILT_SWBU"
    label="Product"
    name="product"
  >
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
      <USelect
        v-model="product"
        class="w-full"
        :disabled="!props.productItems.length"
        placeholder="Load products from the remote"
        :items="props.productItems"
      />
      <UButton
        class="shrink-0"
        color="neutral"
        variant="soft"
        :loading="props.discovering"
        :disabled="!props.canDiscover"
        @click="emit('loadProducts')"
      >
        Load products
      </UButton>
    </div>
    <p v-if="props.showDiscoverHint" class="text-xs text-muted">
      Paste a token to enable Load products. Listing products clones the
      remote.
    </p>
  </UFormField>

  <template v-else-if="adapter === GitSyncAdapter.LOCALE_FILES">
    <UFormField label="Directory" name="product">
      <UInput v-model="product" class="w-full" placeholder="src/locales" />
      <template #help>
        Folder in the repo that holds the locale files, relative to the root.
      </template>
    </UFormField>
    <UFormField label="File pattern" name="pattern">
      <UInput
        v-model="pattern"
        class="w-full"
        :placeholder="GIT_SYNC_DEFAULT_PATTERN"
      />
      <template #help>
        <code>{locale}</code> becomes the file name for each project locale:
        <code>zh_cn</code> → <code>zh-CN</code>, <code>en</code> →
        <code>en</code>. Example: <code>{locale}/messages.json</code>.
      </template>
    </UFormField>
    <UFormField label="Format" name="format">
      <USelect v-model="format" class="w-full" :items="formatItems" />
      <template #help>
        Used for keys the file does not have yet. Existing keys are updated
        where they are, and key order, indentation and comments are kept.
      </template>
    </UFormField>
  </template>
</template>
