<script setup lang="ts"></script>

<template>
  <div class="relative size-full flex flex-col items-center justify-center">
    <!-- <AuroraBackground class="absolute inset-0 z-[-1]" /> -->
    <p class="text-[2.5rem] capitalize">
      hello
      <TextHighlight
        class="bg-gradient-to-r from-green-300 to-blue-300"
        :delay="0"
      >
        world
      </TextHighlight>
    </p>
  </div>
</template>
