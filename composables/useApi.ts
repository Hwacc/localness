import { ErrorCodes } from '~/constants/error-codes'

export function useApi<T>(url: string, options: any = {}) {
  const toast = useToast()
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
      if (import.meta.client) {
        if (errorCode === ErrorCodes.UNAUTHORIZED) {
          toast.add({
            title: 'Error',
            description: errorMessage,
            icon: 'i-lucide:circle-x',
            color: 'error',
            'onUpdate:open': (open) => {
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
        toast.add({
          title: 'Error',
          description: errorMessage,
          icon: 'i-lucide:circle-x',
          color: 'error',
        })
      }
    },

    onRequestError({ error }: any) {
      if (import.meta.client) {
        toast.add({
          title: 'Error',
          description: 'Network error, please check your connection',
          icon: 'i-lucide:circle-x',
          color: 'error',
        })
      }
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

  console.log('useApi', url, mergedOptions)

  return $fetch<T>(url, mergedOptions)
}
