<script setup lang="ts">
const tabsItems = [
  {
    label: 'Profile',
    desc: 'Profile description',
    icon: 'i-lucide:user',
    slot: 'profile',
  },
  {
    label: 'Account',
    desc: 'Account description',
    icon: 'i-lucide:lock',
    slot: 'account',
  },
]
</script>

<template>
  <UModal >
    <template #header>
      <p>User Settings</p>
    </template>
    <template #body>
      <UTabs :items="tabsItems">
        <template #profile="{ item }">
          <div>{{ item.desc }}</div>
        </template>
        <template #account="{ item }">
          <div>{{ item.desc }}</div>
        </template>
      </UTabs>
    </template>
  </UModal>
</template>
