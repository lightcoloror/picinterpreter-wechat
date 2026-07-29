import type {
  OwnedCboardBoard,
  PublicBoardPublicationPort
} from '../../platform/publicBoardPublicationPort'

export function createPublicBoardManagementService(dependencies: {
  port: PublicBoardPublicationPort
}) {
  const requireReady = () => {
    if (!dependencies.port.configured) {
      throw new Error('尚未配置手机可访问的 CBoard API。')
    }
    if (!dependencies.port.getIdentity()) {
      throw new Error('请先登录 CBoard 账号。')
    }
  }

  return {
    async listOwnedPublicBoards(): Promise<OwnedCboardBoard[]> {
      requireReady()
      const boards = await dependencies.port.listOwnedBoards()
      return boards.filter(board => board.isPublic)
    },

    async unpublishBoard(board: OwnedCboardBoard): Promise<void> {
      requireReady()
      await dependencies.port.updateBoard(board.id, {
        ...board,
        isPublic: false
      })
    },

    async deleteBoard(id: string): Promise<void> {
      requireReady()
      await dependencies.port.deleteBoard(id)
    }
  }
}
