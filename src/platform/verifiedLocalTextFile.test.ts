import { expect, test } from 'vitest'
import { readOptionalLocalTextFile, type LocalTextFileSystem } from './verifiedLocalTextFile'

const path = 'http://usr/picinterpreter-expression-local-synthetic.json'
const failing = (error: unknown): LocalTextFileSystem => ({
  readFileSync: () => { throw error },
  writeFileSync: () => undefined,
  renameSync: () => undefined
})

test.each(['message', 'errMsg'])('recognizes the observed IDE readFileSync missing-file shape in %s', field => {
  expect(readOptionalLocalTextFile(failing({ [field]: `readFileSync:fail ${path} not found` }), path)).toBeNull()
})

test.each([
  `readFileSync:fail permission denied ${path}`,
  `readFileSync:fail ${path} not found: permission denied`,
  'readFileSync:fail http://usr/other-file.json not found',
  `writeFileSync:fail ${path} not found`,
  'module not found'
])('does not treat other errors as an absent draft: %s', message => {
  const error = new Error(message)
  expect(() => readOptionalLocalTextFile(failing(error), path)).toThrow(error)
})
