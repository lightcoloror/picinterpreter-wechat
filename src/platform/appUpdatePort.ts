export const APP_UPDATE_STATUS = Object.freeze({
  checking: 'checking',
  idle: 'idle',
  downloading: 'downloading',
  ready: 'ready',
  failed: 'failed'
} as const)

export type AppUpdateStatus =
  typeof APP_UPDATE_STATUS[keyof typeof APP_UPDATE_STATUS]

export interface AppUpdateManager {
  applyUpdate(): void
  onCheckForUpdate(callback: (result: { hasUpdate: boolean }) => void): void
  onUpdateReady(callback: () => void): void
  onUpdateFailed(callback: () => void): void
}

export interface AppUpdatePort {
  getStatus(): AppUpdateStatus
  subscribe(listener: (status: AppUpdateStatus) => void): () => void
  applyUpdate(): boolean
  dismiss(): void
}

export function createAppUpdatePort(
  manager: AppUpdateManager
): AppUpdatePort {
  let status: AppUpdateStatus = APP_UPDATE_STATUS.checking
  const listeners = new Set<(status: AppUpdateStatus) => void>()

  const setStatus = (nextStatus: AppUpdateStatus) => {
    status = nextStatus
    listeners.forEach(listener => listener(status))
  }

  manager.onCheckForUpdate(result => {
    if (status === APP_UPDATE_STATUS.ready) return
    setStatus(
      result.hasUpdate
        ? APP_UPDATE_STATUS.downloading
        : APP_UPDATE_STATUS.idle
    )
  })
  manager.onUpdateReady(() => {
    setStatus(APP_UPDATE_STATUS.ready)
  })
  manager.onUpdateFailed(() => {
    if (status !== APP_UPDATE_STATUS.ready) {
      setStatus(APP_UPDATE_STATUS.failed)
    }
  })

  return {
    getStatus() {
      return status
    },
    subscribe(listener) {
      listeners.add(listener)
      listener(status)
      return () => listeners.delete(listener)
    },
    applyUpdate() {
      if (status !== APP_UPDATE_STATUS.ready) return false
      try {
        manager.applyUpdate()
        return true
      } catch (error) {
        setStatus(APP_UPDATE_STATUS.failed)
        return false
      }
    },
    dismiss() {
      if (status === APP_UPDATE_STATUS.ready) {
        setStatus(APP_UPDATE_STATUS.idle)
      }
    }
  }
}
