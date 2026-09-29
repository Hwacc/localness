<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { UserRole } from '#shared/constants'

definePageMeta({
  middleware: ['protected'],
  ssr: false,
})

const { $dayjs } = useNuxtApp()
const userStore = useUserStore()
const { user } = storeToRefs(userStore)
const { loggedIn } = useUserSession()
const toast = useToast()

const PAGE_SIZE = 20

const rows = ref<IUserListItem[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const creating = ref(false)
const createOpen = ref(false)
/** One toggle for both fields, so what is typed can be compared by eye. */
const showPassword = ref(false)

const form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  email: '',
  nickname: '',
})

const isAdmin = computed(() => user.value.role === UserRole.ADMIN)
/** Only complain once they have typed a confirmation that cannot match yet. */
const passwordMismatch = computed(
  () => form.confirmPassword !== '' && form.confirmPassword !== form.password
)
const canSubmit = computed(
  () =>
    form.username.trim().length >= 3 &&
    form.password.length >= 6 &&
    form.confirmPassword === form.password
)

const columns: TableColumn<IUserListItem>[] = [
  { accessorKey: 'username', header: 'Username' },
  {
    accessorKey: 'nickname',
    header: 'Nickname',
    cell: ({ row }) => row.original.nickname || '—',
  },
  {
    accessorKey: 'email',
    header: 'Email',
    cell: ({ row }) => row.original.email || '—',
  },
  { accessorKey: 'role', header: 'Role' },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) =>
      $dayjs(row.original.createdAt).format('YYYY-MM-DD HH:mm'),
  },
]

async function loadUsers() {
  loading.value = true
  try {
    const res = await useApi<IUserListPage>('/api/users', {
      query: { page: page.value, pageSize: PAGE_SIZE },
    })
    if (!res) return
    rows.value = res.items
    total.value = res.total
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.username = ''
  form.password = ''
  form.confirmPassword = ''
  form.email = ''
  form.nickname = ''
  showPassword.value = false
}

async function createUser() {
  if (!canSubmit.value) return
  creating.value = true
  try {
    // A failure (bad input, duplicate username) toasts from `useApi` and
    // rethrows, so the form stays open with what was typed.
    const created = await useApi<IUserListItem>('/api/users', {
      method: 'POST',
      body: {
        username: form.username,
        password: form.password,
        email: form.email,
        nickname: form.nickname,
      },
    })
    if (!created) return
    toast.add({
      title: 'User created',
      description: created.username,
      color: 'success',
      icon: 'i-lucide:check',
    })
    resetForm()
    createOpen.value = false
    page.value = 1
    await loadUsers()
  } finally {
    creating.value = false
  }
}

watch(page, loadUsers)

onMounted(async () => {
  if (loggedIn.value && !user.value.id) await userStore.getUser()
  // The server refuses non-Admins anyway; this only spares them an empty page.
  if (!isAdmin.value) {
    await navigateTo('/dashboard', { replace: true })
    return
  }
  await loadUsers()
})
</script>

<template>
  <div class="h-full flex flex-col bg-muted">
    <header
      class="shrink-0 h-14 px-6 bg-default border-b border-default flex items-center gap-2"
    >
      <h1 class="text-lg font-semibold tracking-tight">Users</h1>
      <span class="ml-auto" />
      <UPopover v-if="isAdmin" v-model:open="createOpen">
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide:plus"
          label="New user"
        />
        <template #content>
          <form
            class="p-3 w-72 flex flex-col gap-2.5"
            @submit.prevent="createUser"
          >
            <UFormField label="Username" required>
              <UInput v-model="form.username" class="w-full" autocomplete="off" />
            </UFormField>
            <UFormField
              label="Password"
              required
              help="6-16 characters: letters, numbers, underscore; at least one letter and one number."
            >
              <UInput
                v-model="form.password"
                :type="showPassword ? 'text' : 'password'"
                class="w-full"
                autocomplete="new-password"
              >
                <template #trailing>
                  <UButton
                    color="neutral"
                    variant="link"
                    size="sm"
                    :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    :aria-label="showPassword ? 'Hide password' : 'Show password'"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </UInput>
            </UFormField>
            <UFormField
              label="Confirm password"
              required
              :error="passwordMismatch ? 'Passwords do not match' : undefined"
            >
              <UInput
                v-model="form.confirmPassword"
                :type="showPassword ? 'text' : 'password'"
                class="w-full"
                autocomplete="new-password"
              >
                <template #trailing>
                  <UButton
                    color="neutral"
                    variant="link"
                    size="sm"
                    :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                    :aria-label="showPassword ? 'Hide password' : 'Show password'"
                    @click="showPassword = !showPassword"
                  />
                </template>
              </UInput>
            </UFormField>
            <UFormField label="Email">
              <UInput v-model="form.email" type="email" class="w-full" />
            </UFormField>
            <UFormField label="Nickname">
              <UInput v-model="form.nickname" class="w-full" />
            </UFormField>
            <p class="text-xs text-muted">
              The user is not forced to change this password. Tell them to
              change it after their first login.
            </p>
            <UButton
              type="submit"
              size="sm"
              block
              class="justify-center"
              label="Create"
              :loading="creating"
              :disabled="!canSubmit"
            />
          </form>
        </template>
      </UPopover>
    </header>

    <div class="flex-1 min-h-0 p-6 flex flex-col gap-4">
      <div
        class="flex-1 min-h-0 rounded-xl border border-default bg-default overflow-auto"
      >
        <UTable
          class="w-full"
          :data="rows"
          :columns="columns"
          :loading="loading"
        >
          <template #empty>
            <div class="py-12 text-center text-sm text-muted">No users.</div>
          </template>
        </UTable>
      </div>
      <div v-if="total > PAGE_SIZE" class="shrink-0 flex justify-end">
        <UPagination
          v-model:page="page"
          :items-per-page="PAGE_SIZE"
          :total="total"
        />
      </div>
    </div>
  </div>
</template>
