import { MonkeyAIRemoteService } from './host/monkeyai-remote.js'
import { TYPERT } from './typert.js'
import { PACKAGE_NAME } from './remote.js'

export const name = PACKAGE_NAME
export const inject = ['credentials', 'typert']

export function apply(ctx) {
  let service
  let disposeTypert
  ctx.effect(() => {
    service = new MonkeyAIRemoteService(ctx)
    disposeTypert = ctx.typert.register(TYPERT)
    return async () => {
      await disposeTypert?.()
      await service?.dispose()
    }
  }, 'monkeyai-sessions')
}
