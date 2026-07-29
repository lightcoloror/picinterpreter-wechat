import Taro from '@tarojs/taro'

import { createCommunicationFilePort } from './communicationFilePort'

function readText(filePath: string) {
  return new Promise<string>((resolve, reject) => {
    Taro.getFileSystemManager().readFile({
      filePath,
      encoding: 'utf8',
      success: result => resolve(String(result.data || '')),
      fail: reject
    })
  })
}

function writeText(fileName: string, text: string) {
  const filePath = `${Taro.env.USER_DATA_PATH}/${fileName}`
  return new Promise<string>((resolve, reject) => {
    Taro.getFileSystemManager().writeFile({
      filePath,
      data: text,
      encoding: 'utf8',
      success: () => resolve(filePath),
      fail: reject
    })
  })
}

export const taroCommunicationFilePort = createCommunicationFilePort({
  chooseFile: async extensions => {
    try {
      const result = await Taro.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: extensions
      })
      const file = result.tempFiles[0]
      return file ? { name: file.name, path: file.path } : null
    } catch (error) {
      return null
    }
  },
  readText,
  writeText,
  openFile: async path => {
    await Taro.openDocument({ filePath: path, showMenu: true })
  }
})
