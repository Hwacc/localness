<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 p-4">
    <UCard class="w-full max-w-md">
      <div class="text-center space-y-6">
        <!-- Error Icon -->
        <div class="flex justify-center">
          <UIcon 
            :name="statusCode === 404 ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-exclamation-circle'" 
            class="h-16 w-16 text-red-500"
          />
        </div>
        
        <!-- Error Title -->
        <h1 class="text-2xl font-bold text-gray-900">
          {{ statusCode === 404 ? 'Page Not Found' : 'Something Went Wrong' }}
        </h1>
        
        <!-- Error Message -->
        <p class="text-gray-600">
          {{ errorMessage }}
        </p>
        
        <!-- Action Buttons -->
        <div class="flex flex-col sm:flex-row gap-3 justify-center">
          <UButton 
            color="primary"
            icon="i-heroicons-home"
            @click="goHome"
          >
            Go to Homepage
          </UButton>
          <UButton 
            variant="outline"
            icon="i-heroicons-arrow-uturn-left"
            @click="goBack"
          >
            Go Back
          </UButton>
        </div>
        
        <!-- Error Details -->
        <div class="pt-4 border-t border-gray-200">
          <UButton 
            color="gray"
            variant="ghost"
            size="sm"
            class="mb-2"
            :icon="showDetails ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
            @click="toggleDetails"
          >
            {{ showDetails ? 'Hide' : 'Show' }} Error Details
          </UButton>
          
          <transition
            enter-active-class="transition duration-200 ease-out"
            enter-from-class="transform opacity-0 -translate-y-2"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition duration-150 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="transform opacity-0 -translate-y-2"
          >
            <div v-if="showDetails" class="mt-2 p-3 bg-gray-50 rounded-md text-sm text-gray-600 space-y-1">
              <p><span class="font-medium">Error:</span> {{ error.message || 'Unknown error' }}</p>
              <p><span class="font-medium">Status Code:</span> {{ statusCode || 'N/A' }}</p>
              <p><span class="font-medium">Path:</span> {{ $route.path }}</p>
            </div>
          </transition>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup>
const router = useRouter()

const props = defineProps({
  error: {
    type: Object,
    default: () => ({})
  }
})

const showDetails = ref(false)

const statusCode = computed(() => (props.error?.statusCode) || 500)

const errorMessage = computed(() => {
  if (statusCode.value === 404) {
    return 'The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.'
  }
  return 'An unexpected error occurred. Our team has been notified and we\'re working on a fix.'
})

function goHome() {
  router.push('/')
}

function goBack() {
  if (window.history.length > 1) {
    router.go(-1)
  } else {
    goHome()
  }
}

function toggleDetails() {
  showDetails.value = !showDetails.value
}
</script>
