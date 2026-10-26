import { useEffect, useState } from 'react'
import { Text } from '@tarojs/components'
import { imageAvailabilityMessage, type ImageAvailability } from '@cboard-communication-core/imageAvailability'
import { currentImageOperationEpoch } from '@cboard-communication-core/imageOperationEpoch'
import { verifyTaroLocalImage } from '../platform/taroLocalImageVerification'
export default function ImageAvailabilityLabel({ source }: { source: string }) {
  const [result, setResult] = useState<ImageAvailability>({ status: 'unverified' })
  useEffect(() => {
    let alive = true; const epoch = currentImageOperationEpoch()
    setResult({ status: 'unverified' })
    verifyTaroLocalImage(source).then(value => {
      if (alive && epoch === currentImageOperationEpoch()) setResult(value)
    })
    return () => { alive = false }
  }, [source])
  return <Text>{imageAvailabilityMessage(result)}</Text>
}
