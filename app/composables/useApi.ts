import { ErrorCodes } from '#shared/constants/error-codes'
import { runInNuxtApp } from '~/utils/nuxt-app'

function addClientToast(
  options: Parameters<ReturnType<typeof useToast>['add']>[0]
) {
  if (!import.meta.client) return
  runInNuxtApp(() => {
    useToast().add(options)
  })
}

export function useApi<T>(url: string, options: any = {}) {
  const { logout } = useAuthStore()
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
    },
    onResponseError({ response }: any) {
      const error = response._data || 'An error occurred'
      const errorCode = error.code || error.statusCode
      const errorMessage =
        error.message ||
        error.statusMessage ||
        'Request failed, please try again later'

      console.error('Response error:', errorCode, errorMessage)
      if (errorCode === ErrorCodes.UNAUTHORIZED) {
        addClientToast({
          title: 'Error',
          description: errorMessage,
          icon: 'i-lucide:circle-x',
          color: 'error',
          'onUpdate:open': (open: boolean) => {
            if (!open) logout()
          },
          actions: [
            {
              label: 'Logout',
              color: 'error',
              variant: 'solid',
              onClick: () => {
                logout()
              },
            },
          ],
        })
        return
      }
      addClientToast({
        title: 'Error',
        description: errorMessage,
        icon: 'i-lucide:circle-x',
        color: 'error',
      })
    },

    onRequestError({ error }: any) {
      addClientToast({
        title: 'Error',
        description: 'Network error, please check your connection',
        icon: 'i-lucide:circle-x',
        color: 'error',
      })
      console.error('Request error:', error)
    },
  }

  const mergedOptions = {
    ...defaultOptions,
    ...options,
    onResponseError: (context: any) => {
      defaultOptions.onResponseError(context)
      if (options.onResponseError) options.onResponseError(context)
    },
    onRequestError: (context: any) => {
      defaultOptions.onRequestError(context)
      if (options.onRequestError) options.onRequestError(context)
    },
  }

  return $fetch<T>(url, mergedOptions)
}
