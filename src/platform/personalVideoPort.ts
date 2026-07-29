export const PERSONAL_VIDEO_MAX_DURATION_SECONDS = 10
export const PERSONAL_VIDEO_MAX_SIZE_BYTES = 8 * 1024 * 1024

export interface PersonalVideoPortResult {
  ok: boolean
  message: string
  mediaType?: 'video'
  image?: string
  video?: string
  duration?: number
}

interface SelectedPersonalVideo {
  tempFilePath: string
  thumbTempFilePath: string
  size: number
  duration: number
}

interface PreparedPersonalVideo {
  tempFilePath: string
  size: number
}

interface PersonalVideoPortDependencies {
  chooseVideo: () => Promise<SelectedPersonalVideo | null>
  compressVideo: (tempFilePath: string) => Promise<PreparedPersonalVideo>
  saveFile: (tempFilePath: string) => Promise<{ savedFilePath: string }>
  removeSavedFile: (filePath: string) => Promise<void>
}

function isCancelError(error: unknown) {
  return String(
    error && typeof error === 'object' && 'errMsg' in error
      ? (error as { errMsg?: unknown }).errMsg
      : error || ''
  )
    .toLocaleLowerCase()
    .includes('cancel')
}

export function createPersonalVideoPort(
  dependencies: PersonalVideoPortDependencies
) {
  return {
    async selectAndSave(): Promise<PersonalVideoPortResult> {
      let savedVideo = ''
      try {
        const selected = await dependencies.chooseVideo()
        if (!selected) {
          return { ok: false, message: '已取消选择短视频。' }
        }
        if (
          !selected.tempFilePath.trim() ||
          !selected.thumbTempFilePath.trim()
        ) {
          return {
            ok: false,
            message: '没有读取到有效视频或视频封面。'
          }
        }
        if (
          !Number.isFinite(selected.duration) ||
          selected.duration <= 0 ||
          selected.duration > PERSONAL_VIDEO_MAX_DURATION_SECONDS
        ) {
          return { ok: false, message: '请选择 10 秒以内的短视频。' }
        }

        let prepared: PreparedPersonalVideo = {
          tempFilePath: selected.tempFilePath,
          size: selected.size
        }
        try {
          const compressed = await dependencies.compressVideo(
            selected.tempFilePath
          )
          if (compressed.tempFilePath.trim() && compressed.size > 0) {
            prepared = compressed
          }
        } catch (error) {
          // The original file remains usable when it already satisfies limits.
        }
        if (prepared.size > PERSONAL_VIDEO_MAX_SIZE_BYTES) {
          return {
            ok: false,
            message: '视频压缩后仍超过 8 MiB，请缩短或降低清晰度。'
          }
        }

        const savedVideoResult = await dependencies.saveFile(
          prepared.tempFilePath
        )
        savedVideo = String(savedVideoResult.savedFilePath || '').trim()
        if (!savedVideo) throw new Error('Missing saved video path')

        const savedPosterResult = await dependencies.saveFile(
          selected.thumbTempFilePath
        )
        const savedPoster = String(
          savedPosterResult.savedFilePath || ''
        ).trim()
        if (!savedPoster) throw new Error('Missing saved poster path')

        return {
          ok: true,
          message: '短视频和封面已保存到当前设备。',
          mediaType: 'video',
          image: savedPoster,
          video: savedVideo,
          duration: selected.duration
        }
      } catch (error) {
        if (savedVideo) {
          try {
            await dependencies.removeSavedFile(savedVideo)
          } catch (cleanupError) {
            // The failed draft is not referenced even if best-effort cleanup fails.
          }
        }
        return {
          ok: false,
          message: isCancelError(error)
            ? '已取消选择短视频。'
            : '短视频选择、压缩或保存失败，请稍后重试。'
        }
      }
    },

    async remove(video: string) {
      const filePath = String(video || '').trim()
      if (!filePath) return false
      try {
        await dependencies.removeSavedFile(filePath)
        return true
      } catch (error) {
        return false
      }
    }
  }
}
