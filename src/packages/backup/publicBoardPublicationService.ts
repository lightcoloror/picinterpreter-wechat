import {
  buildPrivatePublicBoardDraft,
  buildPublishedPublicBoards,
  createPublicBoardPublicationPlan,
  type PublicBoardPublicationDeclaration
} from '@cboard-communication-core/publicBoardPublication'
import type { BoardDTO } from '@cboard-communication-core/dto'

import type { PublicBoardPublicationPort } from '../../platform/publicBoardPublicationPort'

export interface PublicBoardPublicationProgress {
  phase: 'preflight' | 'creating' | 'uploading' | 'publishing' | 'rollback'
  completed: number
  total: number
}

export interface PublicBoardPublicationResult {
  ok: boolean
  message: string
  rootBoardId?: string
  url?: string
  boardCount?: number
  tileCount?: number
}

export function createPublicBoardPublicationService(dependencies: {
  port: PublicBoardPublicationPort
}) {
  return {
    async publish(
      boards: BoardDTO[],
      rootBoardId: string,
      declaration: PublicBoardPublicationDeclaration,
      onProgress?: (progress: PublicBoardPublicationProgress) => void
    ): Promise<PublicBoardPublicationResult> {
      if (!dependencies.port.configured) {
        return {
          ok: false,
          message: '尚未配置手机可访问的 CBoard API，暂时不能发布公共板。'
        }
      }
      const identity = dependencies.port.getIdentity()
      if (!identity) {
        return {
          ok: false,
          message: '请先登录 CBoard 账号，再发布公共沟通板。'
        }
      }

      let plan
      try {
        plan = createPublicBoardPublicationPlan(
          boards,
          rootBoardId,
          declaration
        )
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : '公共板发布前检查失败。'
        }
      }

      onProgress?.({
        phase: 'preflight',
        completed: 1,
        total: 1
      })

      const boardIds = new Map<string, string>()
      const createdBoardIds: string[] = []
      const assetUrls = new Map<string, string>()

      try {
        for (let index = 0; index < plan.boards.length; index += 1) {
          const board = plan.boards[index]
          const created = await dependencies.port.createBoard(
            buildPrivatePublicBoardDraft(
              board,
              plan.declaration,
              identity.email
            )
          )
          boardIds.set(board.id, created.id)
          createdBoardIds.push(created.id)
          onProgress?.({
            phase: 'creating',
            completed: index + 1,
            total: plan.boards.length
          })
        }

        for (let index = 0; index < plan.assets.length; index += 1) {
          const asset = plan.assets[index]
          const url = await dependencies.port.uploadMedia(
            asset.source,
            asset.kind
          )
          assetUrls.set(asset.key, url)
          onProgress?.({
            phase: 'uploading',
            completed: index + 1,
            total: plan.assets.length
          })
        }

        const published = buildPublishedPublicBoards(plan, {
          boardIds,
          assetUrls,
          email: identity.email
        })
        const rootServerId = String(boardIds.get(plan.rootBoardId) || '')
        const ordered = [
          ...published.filter(board => board.id !== rootServerId),
          ...published.filter(board => board.id === rootServerId)
        ]

        for (let index = 0; index < ordered.length; index += 1) {
          const board = ordered[index]
          await dependencies.port.updateBoard(board.id, board)
          onProgress?.({
            phase: 'publishing',
            completed: index + 1,
            total: ordered.length
          })
        }

        return {
          ok: true,
          message:
            `已发布 ${plan.boardCount} 块公共沟通板、` +
            `${plan.tileCount} 张图卡。`,
          rootBoardId: rootServerId,
          url: `https://app.cboard.io/board/${rootServerId}`,
          boardCount: plan.boardCount,
          tileCount: plan.tileCount
        }
      } catch (error) {
        onProgress?.({
          phase: 'rollback',
          completed: 0,
          total: createdBoardIds.length
        })
        let rolledBack = 0
        for (const id of createdBoardIds.reverse()) {
          try {
            await dependencies.port.deleteBoard(id)
            rolledBack += 1
            onProgress?.({
              phase: 'rollback',
              completed: rolledBack,
              total: createdBoardIds.length
            })
          } catch (rollbackError) {
            // Keep trying to remove the remaining private or partially public boards.
          }
        }
        return {
          ok: false,
          message:
            '发布没有完成；已尽力撤回本次创建的沟通板。' +
            (error instanceof Error ? ` ${error.message}` : '')
        }
      }
    }
  }
}

