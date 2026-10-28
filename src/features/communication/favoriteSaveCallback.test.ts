import { expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { addCommunicationSavedPhrase } from '@cboard-communication-core/savedPhraseManagement'
import { createWechatCommunicationRepository } from '../../platform/communicationRepository'

// Reuse the actual-callback approach of the existing page callback harness.
const filename = resolve('src/features/communication/CommunicationPage.tsx')
const ast = ts.createSourceFile(filename, readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let source = ''
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'savePhrase') source = node.initializer!.getText(ast)
  ts.forEachChild(node, visit)
}
visit(ast)

test.each([100, 101])('actual mini save callback keeps %i items and never replaces a same-sentence person', count => {
  const entries = Array.from({ length: count }, (_, index) => ({ id: `synthetic-old-${index}`,
    sentence: index ? `合成旧句${index}` : '合成林安不回家', lifeContext: '聊天', createdAt: index + 1,
    output: [{ id: 'same', label: '合成林安', personId: 'synthetic-a', image: '/synthetic-a.png' }] }))
  const values = new Map<string, unknown>([['cboard_communication_saved_phrases', JSON.stringify(entries)]])
  const repository = createWechatCommunicationRepository({
    getStorageSync: key => values.get(key) ?? '', setStorageSync: (key, value) => { values.set(key, value) }, removeStorageSync: key => { values.delete(key) }
  })
  const before = repository.loadCommunicationSavedPhrases(), refreshed: unknown[] = []
  const box = { module: { exports: null as unknown }, repositoryRef: { current: repository },
    addCommunicationSavedPhrase, setSavedPhraseItems: (value: unknown) => refreshed.push(value) }
  expect(source).toBeTruthy()
  runInNewContext(ts.transpileModule('module.exports = ' + source, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText, box)
  const save = box.module.exports as (entry: unknown) => boolean
  for (const sentence of ['合成林安不回家', '  合成林安不回家  ']) {
    expect(save({ sentence, output: [{ id: 'same', label: '合成林安', personId: 'synthetic-b', image: '/synthetic-b.png' }] })).toBe(true)
    expect(repository.loadCommunicationSavedPhrases()).toEqual(before)
  }
  expect(refreshed).toEqual([before, before])
})
