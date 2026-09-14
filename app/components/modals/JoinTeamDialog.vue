<script setup lang="ts">
const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{
  skip: []
  joined: [team: ITeam]
}>()

const { joinCode, joining, joinWithCode } = useJoinTeamByCode(async (team) => {
  open.value = false
  emit('joined', team)
})

function skip() {
  open.value = false
}

watch(open, (isOpen, wasOpen) => {
  if (wasOpen && !isOpen) emit('skip')
})
</script>

<template>
  <UModal
    v-model:open="open"
    title="Join a team"
    description="Enter an invite code to start working, or skip and join later."
  >
    <template #body>
      <form class="flex flex-col gap-3" @submit.prevent="joinWithCode">
        <UInput
          v-model="joinCode"
          class="w-full"
          placeholder="Invite code"
        />
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            label="Skip"
            @click="skip"
          />
          <UButton
            type="submit"
            label="Join team"
            icon="i-lucide:log-in"
            :loading="joining"
            :disabled="!joinCode.trim()"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>
