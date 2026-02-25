export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { apiKey } = req.body

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' })
    }

    const response = await fetch('https://api.inworld.ai/tts/v1/voices?filter=language=en', {
      headers: {
        'Authorization': `Basic ${apiKey}`,
        'Content-Type': 'application/json',
      }
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Inworld voices API error:', errorText)
      return res.status(response.status).json({ error: `Failed to fetch voices: ${response.status}` })
    }

    const data = await response.json()
    return res.status(200).json(data)

  } catch (error) {
    console.error('Voices error:', error)
    return res.status(500).json({ error: error.message || 'Failed to fetch voices' })
  }
}
