export function useApi<T>(url: string, options: any = {}) {
  const { token } = useAuthStore()
  const toast = useToast()

  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    onResponseError({ response }: any) {
      const error = response._data || 'An error occurred'
      const errorMessage =
        error.message ||
        error.statusMessage ||
        'Request failed, please try again later'

      if (import.meta.client) {
        toast.add({
          title: 'Error',
          description: errorMessage,
          icon: 'i-lucide:circle-x',
          color: 'error',
        })
      }
      console.error('Response error:', errorMessage)
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

  if (options.method === 'POST' && options.body) {
    try {
      options.body = JSON.stringify(options.body)
    } catch (error) {
      console.error('Request error:', error)
      throw new Error('Request body error: ' + error)
    }
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

  return useFetch<T>(url, mergedOptions)
}
