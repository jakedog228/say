// Using Node.js runtime for reliable streaming
export const config = {
  runtime: 'nodejs',
  maxDuration: 300 // 5 minutes for long articles
}

const MAX_CHUNK_SIZE = 1900 // Leave buffer under 2000

/**
 * Split text into chunks that fit within the API limit
 * Priority: paragraph breaks > sentence breaks > word breaks
 */
function chunkText(text) {
  const chunks = []
  const paragraphs = text.split(/\n\n+/)
  let currentChunk = ''

  for (const paragraph of paragraphs) {
    const trimmedPara = paragraph.trim()
    if (!trimmedPara) continue

    // If adding this paragraph would exceed limit
    if (currentChunk.length + trimmedPara.length + 2 > MAX_CHUNK_SIZE) {
      // Save current chunk if it has content
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim())
        currentChunk = ''
      }

      // If the paragraph itself is too long, split it further
      if (trimmedPara.length > MAX_CHUNK_SIZE) {
        const subChunks = chunkLongParagraph(trimmedPara)
        chunks.push(...subChunks)
      } else {
        currentChunk = trimmedPara
      }
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmedPara
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}

/**
 * Split a long paragraph by sentences, then by words if needed
 */
function chunkLongParagraph(paragraph) {
  const chunks = []
  // Split by sentence endings
  const sentences = paragraph.match(/[^.!?]+[.!?]+[\s]*/g) || [paragraph]
  let currentChunk = ''

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim()
    if (!trimmedSentence) continue

    if (currentChunk.length + trimmedSentence.length + 1 > MAX_CHUNK_SIZE) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim())
        currentChunk = ''
      }

      // If sentence itself is too long, split by words
      if (trimmedSentence.length > MAX_CHUNK_SIZE) {
        const wordChunks = chunkByWords(trimmedSentence)
        chunks.push(...wordChunks)
      } else {
        currentChunk = trimmedSentence
      }
    } else {
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}

/**
 * Last resort: split by words
 */
function chunkByWords(text) {
  const chunks = []
  const words = text.split(/\s+/)
  let currentChunk = ''

  for (const word of words) {
    if (currentChunk.length + word.length + 1 > MAX_CHUNK_SIZE) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim())
      }
      currentChunk = word
    } else {
      currentChunk += (currentChunk ? ' ' : '') + word
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim())
  }

  return chunks
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { text, voice_id = 'Mark', apiKey, audioEncoding = 'MP3' } = req.body

    if (!text) {
      return res.status(400).json({ error: 'Text is required' })
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' })
    }

    // Split text into chunks
    const chunks = chunkText(text)
    console.log(`Processing ${chunks.length} chunks`)

    // Track if client disconnected
    let clientDisconnected = false
    const checkDisconnected = () => clientDisconnected || res.writableEnded

    req.on('close', () => {
      clientDisconnected = true
      console.log('Client disconnected, will stop after current chunk')
    })

    // Set headers for streaming
    res.setHeader('Content-Type', 'application/x-ndjson')
    res.setHeader('Transfer-Encoding', 'chunked')
    res.setHeader('Cache-Control', 'no-cache')

    // Process each chunk sequentially and stream results
    for (let i = 0; i < chunks.length; i++) {
      // Stop if client disconnected (before starting new chunk)
      if (checkDisconnected()) {
        console.log(`Stopping before chunk ${i + 1}/${chunks.length} - client disconnected`)
        break
      }

      const chunk = chunks[i]
      console.log(`Processing chunk ${i + 1}/${chunks.length} (${chunk.length} chars)`)

      try {
        const response = await fetch('https://api.inworld.ai/tts/v1/voice:stream', {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: chunk,
            voice_id,
            audio_config: {
              audio_encoding: audioEncoding,
              speaking_rate: 1
            },
            temperature: 1.1,
            model_id: 'inworld-tts-1.5-max'
          })
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error(`Inworld API error on chunk ${i + 1}:`, errorText)
          res.write(JSON.stringify({ error: `Chunk ${i + 1} failed: ${response.status}` }) + '\n')
          continue
        }

        // Stream this chunk's audio (finish even if client disconnects mid-chunk)
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let lastChar = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const text = decoder.decode(value, { stream: true })
          // Try to send to client, ignore errors if disconnected
          if (!checkDisconnected()) {
            try {
              res.write(text)
            } catch {
              // Client disconnected mid-write, mark as disconnected
              clientDisconnected = true
            }
          }
          if (text.length > 0) {
            lastChar = text[text.length - 1]
          }
        }

        // After chunk completes, check if we should stop
        if (checkDisconnected()) {
          console.log(`Finished chunk ${i + 1}, stopping (client disconnected)`)
          break
        }

        // Ensure newline before our marker and signal chunk boundary
        try {
          if (lastChar !== '\n') {
            res.write('\n')
          }
          res.write(JSON.stringify({ chunkComplete: i + 1, totalChunks: chunks.length }) + '\n')
        } catch {
          clientDisconnected = true
          break
        }
      } catch (chunkError) {
        if (checkDisconnected()) break
        console.error(`Error processing chunk ${i + 1}:`, chunkError)
        try {
          res.write(JSON.stringify({ error: `Chunk ${i + 1} error: ${chunkError.message}` }) + '\n')
        } catch {
          clientDisconnected = true
          break
        }
      }
    }

    // Always try to end the response
    try {
      res.end()
    } catch {
      // Already closed, ignore
    }

  } catch (error) {
    console.error('TTS error:', error)
    if (!res.headersSent) {
      return res.status(500).json({ error: error.message || 'TTS request failed' })
    }
    res.end()
  }
}
