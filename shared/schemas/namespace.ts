import { z } from 'zod/v4'

/**
 * Key namespaces. As with releases, the name's content is judged by
 * `namespaceNameRejectReason`, so a bad name reports the rule's message.
 */
export const zNamespaceCreate = z.object({ name: z.string() })
export type ZNamespaceCreate = z.infer<typeof zNamespaceCreate>

export const zNamespaceRename = z.object({ name: z.string() })
export type ZNamespaceRename = z.infer<typeof zNamespaceRename>

/** Every namespace id of the project, in the new order. */
export const zNamespaceOrder = z.object({
  ids: z.array(z.number().int().positive()),
})
export type ZNamespaceOrder = z.infer<typeof zNamespaceOrder>
