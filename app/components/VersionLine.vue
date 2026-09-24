<script setup lang="ts">
/**
 * Which build this instance is running — the About section in Settings and the
 * login page. One component so the two cannot disagree on the format. The commit
 * is optional: an image built without git history carries none, and a trailing
 * separator would read as a bug.
 */
const { appVersion, appCommit } = useRuntimeConfig().public

const label = ['Localness', appVersion && `v${appVersion}`, appCommit]
  .filter(Boolean)
  .join(' · ')
</script>

<template>
  <p class="text-xs text-muted">{{ label }}</p>
</template>