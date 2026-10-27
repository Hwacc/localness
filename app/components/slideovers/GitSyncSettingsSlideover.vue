<script setup lang="ts">
import type {
  GitCredentialKind,
  GitSyncAdapter,
  GitSyncFileFormat,
} from '#shared/constants'

/**
 * Settings for an already configured Git binding. The form state and the save
 * call stay with the page, which shares them with its first-time setup form.
 */
export interface IGitSettingsForm {
  enabled: boolean
  adapter: GitSyncAdapter
  product: string
  pattern: string
  format: GitSyncFileFormat
  credentialKind: GitCredentialKind
  token: string
  remoteUrl: string
  branch: string
}

defineProps<{
  credentialItems: { label: string; value: GitCredentialKind }[]
  productItems: { value: string; label: string }[]
  discovering: boolean
  canDiscover: boolean
  saving: boolean
}>()

const emit = defineEmits<{
  'load-products': []
  'normalize-url': []
  save: []
}>()

const open = defineModel<boolean>('open', { default: false })
const form = defineModel<IGitSettingsForm>('form', { required: true })
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Git sync settings"
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <div class="flex flex-col gap-4">
        <UFormField label="Credential" name="credentialKind">
          <USelect
            v-model="form.credentialKind"
            class="w-full"
            :items="credentialItems"
          />
        </UFormField>
        <UFormField label="Rotate token (leave blank to keep)" name="token">
          <UInput
            v-model="form.token"
            type="password"
            autocomplete="off"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Remote URL" name="remoteUrl">
          <UInput
            v-model="form.remoteUrl"
            class="w-full"
            placeholder="https://bitbucket.org/workspace/repo.git"
            @blur="emit('normalize-url')"
          />
        </UFormField>
        <UFormField label="Branch" name="branch">
          <UInput v-model="form.branch" class="w-full" />
        </UFormField>
        <GitSyncLayoutFields
          v-model:adapter="form.adapter"
          v-model:product="form.product"
          v-model:pattern="form.pattern"
          v-model:format="form.format"
          :product-items="productItems"
          :discovering="discovering"
          :can-discover="canDiscover"
          @load-products="emit('load-products')"
        />
        <UButton
          class="w-full justify-center"
          :loading="saving"
          @click="emit('save')"
        >
          Save settings
        </UButton>
      </div>
    </template>
  </USlideover>
</template>
