import { createServer } from 'node:http'

const TEST_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64'
)
const TEST_API_PORT = Number(
  process.env.WEAPP_E2E_FAKE_API_PORT || 49321
)

function writeJson(response, statusCode, value) {
  const body = JSON.stringify(value)
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json; charset=utf-8'
  })
  response.end(body)
}

async function readRequestBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const buffer = Buffer.concat(chunks)
  const raw = buffer.toString('utf8')
  const contentType = String(request.headers['content-type'] || '')
    .toLocaleLowerCase()
  const data =
    raw && contentType.includes('application/json')
      ? JSON.parse(raw)
      : {}
  return {
    buffer,
    contentType,
    data,
    raw
  }
}

function listen(server) {
  return new Promise((resolve, reject) => {
    const onError = error => {
      server.off('listening', onListening)
      reject(error)
    }
    const onListening = () => {
      server.off('error', onError)
      resolve()
    }
    server.once('error', onError)
    server.once('listening', onListening)
    server.listen(TEST_API_PORT, '127.0.0.1')
  })
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) reject(error)
      else resolve()
    })
  })
}

export async function startAccountFakeApi() {
  if (
    !Number.isInteger(TEST_API_PORT) ||
    TEST_API_PORT < 1024 ||
    TEST_API_PORT > 65535
  ) {
    throw new Error(
      `Invalid WEAPP_E2E_FAKE_API_PORT: ${TEST_API_PORT}`
    )
  }
  const requestLog = []
  const server = createServer(async (request, response) => {
    const requestUrl = new URL(
      request.url || '/',
      'http://127.0.0.1'
    )

    if (requestUrl.pathname === '/__e2e/requests') {
      writeJson(response, 200, { requests: requestLog })
      return
    }

    try {
      const {
        buffer,
        contentType,
        data,
        raw
      } = await readRequestBody(request)
      const method = String(request.method || 'GET').toUpperCase()
      const url = requestUrl.pathname
      requestLog.push({
        url,
        method,
        authorized: Boolean(request.headers.authorization),
        bodyBytes: buffer.length,
        contentType,
        dataKeys:
          data && typeof data === 'object' && !Array.isArray(data)
            ? Object.keys(data)
            : [],
        containsDevicePrivate: raw.includes('device-private')
      })

      if (
        method === 'POST' &&
        url === '/gpt/communication/ocr'
      ) {
        if (!request.headers.authorization) {
          writeJson(response, 401, { message: 'Missing bearer token.' })
          return
        }
        if (
          !contentType.startsWith('multipart/form-data;') ||
          buffer.length === 0
        ) {
          writeJson(response, 400, {
            message: 'OCR E2E requires a non-empty multipart image.'
          })
          return
        }
        writeJson(response, 200, {
          text: '我想吃苹里',
          provider: 'e2e-ocr',
          sourceStored: false
        })
        return
      }

      if (
        method === 'GET' &&
        url ===
          '/pictograms/opensymbols/e2e-candidate.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/image'
      ) {
        response.writeHead(200, {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-store',
          'Content-Length': TEST_IMAGE.length,
          'Content-Type': 'image/png'
        })
        response.end(TEST_IMAGE)
        return
      }

      if (method === 'POST' && url === '/user/login') {
        writeJson(response, 200, {
          id: 'account-e2e-user',
          name: '同步测试照护者',
          email: 'sync-caregiver@example.test',
          authToken: 'e2e-account-token',
          settings: {}
        })
        return
      }

      if (
        method === 'DELETE' &&
        url === '/account/account-e2e-user'
      ) {
        if (!request.headers.authorization) {
          writeJson(response, 401, { message: 'Missing bearer token.' })
          return
        }
        writeJson(response, 200, {
          user: { id: 'account-e2e-user' },
          deletedCommunicationReceiverRecords: 1,
          deletedCommunicationSavedPhrases: 1
        })
        return
      }

      if (method === 'POST' && url === '/pictograms/search') {
        const tokens = Array.isArray(data.tokens) ? data.tokens : []
        writeJson(response, 200, {
          results: tokens.map((token, index) => ({
            token,
            pictogram: {
              id: `runtime_opensymbols_e2e_${index}`,
              imageUrl:
                '/pictograms/opensymbols/e2e-candidate.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/image',
              labels: { zh: [token], en: ['rehabilitation'] },
              source: {
                provider: 'opensymbols',
                originalId: `mulberry-e2e-${index}`,
                name: 'OpenSymbols / mulberry',
                license: 'CC BY-SA 2.0 UK',
                licenseUrl:
                  'https://creativecommons.org/licenses/by-sa/2.0/uk/',
                author: 'Paxtoncrafts Charitable Trust',
                authorUrl: 'https://mulberrysymbols.org/',
                sourceUrl:
                  'https://www.opensymbols.org/symbols/mulberry/e2e',
                repoKey: 'mulberry'
              }
            }
          }))
        })
        return
      }

      if (url === '/settings' && method === 'GET') {
        writeJson(response, 200, {
          communicationSupport: {
            savedPhrases: [{
              id: 'account-e2e-remote-phrase',
              sentence: '云端同步短语',
              output: [],
              usageCount: 0,
              createdAt: 100,
              lastUsedAt: 100,
              updatedAt: 100
            }],
            history: []
          }
        })
        return
      }

      if (url === '/settings' && method === 'POST') {
        writeJson(response, 200, {})
        return
      }

      if (
        url === '/communication/saved-phrases/sync' &&
        method === 'POST'
      ) {
        const phrases = Array.isArray(data.phrases)
          ? data.phrases
          : []
        writeJson(response, 200, {
          acceptedCount: phrases.length,
          conflictCount: 0,
          conflictedPhraseIds: [],
          phrases: phrases.map(phrase => ({
            ...phrase,
            serverVersion: Number(phrase.serverVersion) || 1
          })),
          deletedPhraseIds: [],
          deletedPhrases: []
        })
        return
      }

      if (
        url === '/communication/saved-phrases' &&
        method === 'DELETE'
      ) {
        const phraseIds = Array.isArray(data.phraseIds)
          ? data.phraseIds
          : []
        writeJson(response, 200, {
          deletedCount: phraseIds.length,
          deletedPhraseIds: phraseIds,
          deletedPhrases: []
        })
        return
      }

      if (
        url === '/communication/receiver-records/sync' &&
        method === 'POST'
      ) {
        const records = Array.isArray(data.records) ? data.records : []
        writeJson(response, 200, {
          acceptedCount: records.length,
          records,
          deletedRecordIds: []
        })
        return
      }

      writeJson(response, 404, {
        message: 'Unexpected E2E API request.'
      })
    } catch (error) {
      writeJson(response, 400, {
        message: error instanceof Error ? error.message : String(error)
      })
    }
  })

  await listen(server)
  const address = server.address()
  if (!address || typeof address === 'string') {
    await close(server)
    throw new Error('Unable to resolve the local E2E API address')
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => close(server)
  }
}
