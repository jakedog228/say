import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

// Icons as components
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M8 5v14l11-7z"/>
  </svg>
)

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
  </svg>
)

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
  </svg>
)

const SettingsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
  </svg>
)

const ChevronIcon = ({ open }) => (
  <svg className={`chevron ${open ? 'open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
    <polyline points="6 9 12 15 18 9"/>
  </svg>
)

const HeadphonesIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="48" height="48">
    <path d="M3 18v-6a9 9 0 0118 0v6"/>
    <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3v5zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3v5z"/>
  </svg>
)

const THEMES = ['light', 'dusk', 'midnight']
const THEME_LABELS = { light: 'Light', dusk: 'Dusk', midnight: 'Midnight' }

const VOICES = [
  { id: 'Mark', name: 'Mark', desc: 'Natural male' },
  { id: 'Olivia', name: 'Olivia', desc: 'Natural female' },
  { id: 'James', name: 'James', desc: 'British male' },
  { id: 'Sofia', name: 'Sofia', desc: 'Warm female' },
]

function formatTime(seconds) {
  if (!seconds || !isFinite(seconds)) return '0:00'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Create WAV file from raw PCM data chunks
function createWavBlob(pcmChunks) {
  // LINEAR16 is 16-bit, mono
  const sampleRate = 48000
  const numChannels = 1
  const bitsPerSample = 16

  // Calculate total data size
  let totalDataSize = 0
  for (const chunk of pcmChunks) {
    totalDataSize += chunk.byteLength
  }

  // WAV header is 44 bytes
  const buffer = new ArrayBuffer(44 + totalDataSize)
  const view = new DataView(buffer)

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + totalDataSize, true)  // File size - 8
  writeString(view, 8, 'WAVE')

  // fmt sub-chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)  // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true)   // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * bitsPerSample / 8, true)  // ByteRate
  view.setUint16(32, numChannels * bitsPerSample / 8, true)  // BlockAlign
  view.setUint16(34, bitsPerSample, true)

  // data sub-chunk
  writeString(view, 36, 'data')
  view.setUint32(40, totalDataSize, true)

  // Copy PCM data
  const uint8Array = new Uint8Array(buffer)
  let offset = 44
  for (const chunk of pcmChunks) {
    uint8Array.set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength), offset)
    offset += chunk.byteLength
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}

// Synchronously detect audio format from the first bytes of data
function detectAudioFormat(bytes) {
  if (bytes.length < 4) return 'pcm'

  // WAV/RIFF header - detect separately (each segment is a complete WAV)
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'wav'

  // MP3 sync word (0xFF followed by 0xE0+)
  if (bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0) return 'encoded'

  // ID3 tag (MP3 with metadata header)
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'encoded'

  // OGG container
  if (bytes[0] === 0x4F && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'encoded'

  // No recognized header - raw PCM
  return 'pcm'
}

// Strip WAV header from a segment, returning just the raw PCM data
function stripWavHeader(wavBytes) {
  // Find "data" chunk marker (0x64 0x61 0x74 0x61 = "data")
  for (let i = 0; i < wavBytes.length - 8; i++) {
    if (wavBytes[i] === 0x64 && wavBytes[i + 1] === 0x61 &&
        wavBytes[i + 2] === 0x74 && wavBytes[i + 3] === 0x61) {
      // Skip "data" (4 bytes) + data size field (4 bytes) = 8 bytes
      return wavBytes.slice(i + 8)
    }
  }
  return wavBytes  // No header found, return as-is
}

function App() {
  // Theme
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('say-theme')
    if (saved) return saved
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'midnight'
    return 'dusk'
  })

  // Settings
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('say-api-key') || '')
  const [imageReplacement, setImageReplacement] = useState(() =>
    localStorage.getItem('say-image-replacement') || '[clear_throat]'
  )
  const [voice, setVoice] = useState(() => localStorage.getItem('say-voice') || 'Mark')
  const [audioEncoding, setAudioEncoding] = useState(() =>
    localStorage.getItem('say-audio-encoding') || 'MP3'
  )
  const [showSettings, setShowSettings] = useState(false)

  // Article state
  const [url, setUrl] = useState('')
  const [article, setArticle] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Audio state
  const [isPlaying, setIsPlaying] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [audioBlob, setAudioBlob] = useState(null)
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 })
  const [hasAudioContext, setHasAudioContext] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  const audioContextRef = useRef(null)
  const audioElementRef = useRef(null)   // HTML5 audio for final playback
  const scheduledEndTimeRef = useRef(0)
  const allAudioDataRef = useRef([])
  const pendingBuffersRef = useRef([])   // Buffer audio before starting playback
  const isPlayingRef = useRef(false)
  const playbackStartedRef = useRef(false)
  const startTimeRef = useRef(0)
  const totalDurationRef = useRef(0)
  const animationFrameRef = useRef(null)
  const abortControllerRef = useRef(null)
  const isCancellingRef = useRef(false)
  const currentEncodingRef = useRef('MP3')  // Track encoding requested
  const detectedFormatRef = useRef(null)     // Track what the API actually returned
  const [useNativeAudio, setUseNativeAudio] = useState(false)

  const BUFFER_BEFORE_PLAY = 5  // Wait for N audio segments before starting
  const CROSSFADE_DURATION = 0.005  // 5ms crossfade to eliminate clicks at buffer boundaries

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('say-theme', theme)
  }, [theme])

  // Save settings
  useEffect(() => {
    localStorage.setItem('say-api-key', apiKey)
  }, [apiKey])

  useEffect(() => {
    localStorage.setItem('say-image-replacement', imageReplacement)
  }, [imageReplacement])

  useEffect(() => {
    localStorage.setItem('say-voice', voice)
  }, [voice])

  useEffect(() => {
    localStorage.setItem('say-audio-encoding', audioEncoding)
  }, [audioEncoding])

  // Handle share target (PWA)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sharedUrl = params.get('url') || params.get('text')
    if (sharedUrl) {
      // Extract URL from shared text if needed
      const urlMatch = sharedUrl.match(/https?:\/\/[^\s]+/)
      if (urlMatch) {
        setUrl(urlMatch[0])
        // Clear the URL params
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
  }, [])

  const cycleTheme = () => {
    const currentIndex = THEMES.indexOf(theme)
    const nextIndex = (currentIndex + 1) % THEMES.length
    setTheme(THEMES[nextIndex])
  }

  const scrapeArticle = async () => {
    if (!url) return

    setLoading(true)
    setError(null)
    setArticle(null)

    try {
      const response = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, imageReplacement })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to fetch article')
      }

      const data = await response.json()
      setArticle(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Initialize audio context
  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      setHasAudioContext(true)
    }
    return audioContextRef.current
  }, [])

  // Apply short fade-in/fade-out to an AudioBuffer to eliminate clicks at boundaries
  const applyFades = (audioBuffer) => {
    const fadeSamples = Math.floor(CROSSFADE_DURATION * audioBuffer.sampleRate)
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const data = audioBuffer.getChannelData(ch)
      for (let i = 0; i < fadeSamples && i < data.length; i++) {
        data[i] *= i / fadeSamples  // fade in
      }
      for (let i = 0; i < fadeSamples && i < data.length; i++) {
        data[data.length - 1 - i] *= i / fadeSamples  // fade out
      }
    }
  }

  // Actually schedule and play a decoded buffer
  const playBuffer = useCallback((audioBuffer) => {
    const ctx = audioContextRef.current
    if (!ctx) return

    // Crossfade: smooth the edges to eliminate clicks at buffer boundaries
    applyFades(audioBuffer)

    const source = ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(ctx.destination)

    // Overlap slightly with previous buffer for seamless crossfade.
    // If we've fallen behind (previous buffer already finished), just start now.
    const startTime = Math.max(
      scheduledEndTimeRef.current - CROSSFADE_DURATION,
      ctx.currentTime
    )
    source.start(startTime)

    scheduledEndTimeRef.current = startTime + audioBuffer.duration
    totalDurationRef.current += audioBuffer.duration
    setDuration(totalDurationRef.current)
  }, [])

  // Flush all pending buffers and start playback
  const startPlayback = useCallback(async () => {
    const ctx = audioContextRef.current
    if (!ctx || playbackStartedRef.current) return

    // Resume if suspended (autoplay policy)
    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    playbackStartedRef.current = true
    startTimeRef.current = ctx.currentTime
    scheduledEndTimeRef.current = ctx.currentTime + 0.05  // Small initial delay for audio context warmup

    // Schedule all pending buffers
    for (const buffer of pendingBuffersRef.current) {
      playBuffer(buffer)
    }
    pendingBuffersRef.current = []

    isPlayingRef.current = true
    setIsPlaying(true)
    updatePlaybackTime()
  }, [playBuffer])

  // Convert LINEAR16 (16-bit signed PCM) to AudioBuffer
  const pcmToAudioBuffer = useCallback((pcmData, ctx) => {
    // LINEAR16 is 16-bit signed integers, mono
    const sampleRate = 48000
    const numSamples = pcmData.length / 2  // 2 bytes per sample
    const audioBuffer = ctx.createBuffer(1, numSamples, sampleRate)
    const channelData = audioBuffer.getChannelData(0)

    // Convert 16-bit signed integers to float32 (-1 to 1)
    const dataView = new DataView(pcmData.buffer, pcmData.byteOffset, pcmData.byteLength)
    for (let i = 0; i < numSamples; i++) {
      const int16 = dataView.getInt16(i * 2, true)  // little-endian
      channelData[i] = int16 / 32768
    }

    return audioBuffer
  }, [])

  // Schedule audio buffer for gapless playback using Web Audio API.
  // Uses the synchronously-detected format from detectedFormatRef.
  const scheduleAudioBuffer = useCallback(async (audioData) => {
    const ctx = ensureAudioContext()

    try {
      let audioBuffer

      if (detectedFormatRef.current === 'pcm') {
        // Raw PCM without headers - convert directly
        audioBuffer = pcmToAudioBuffer(audioData, ctx)
      } else {
        // Encoded audio (MP3) or WAV segments - let the browser decode it
        const arrayBuffer = audioData.buffer.slice(
          audioData.byteOffset,
          audioData.byteOffset + audioData.byteLength
        )
        audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
      }

      if (!playbackStartedRef.current) {
        // Buffer audio until we have enough to start
        pendingBuffersRef.current.push(audioBuffer)

        if (pendingBuffersRef.current.length >= BUFFER_BEFORE_PLAY) {
          startPlayback()
        }
      } else {
        // Already playing - schedule immediately
        playBuffer(audioBuffer)
      }
    } catch (err) {
      console.error('Failed to decode audio:', err)
    }
  }, [ensureAudioContext, startPlayback, playBuffer, pcmToAudioBuffer])

  // Update playback time display
  const updatePlaybackTime = useCallback(() => {
    if (!audioContextRef.current || !isPlayingRef.current) return

    const elapsed = audioContextRef.current.currentTime - startTimeRef.current
    const totalDur = totalDurationRef.current
    setCurrentTime(Math.min(elapsed, totalDur))
    setDuration(totalDur)

    // Detect when all scheduled Web Audio buffers have finished playing
    if (scheduledEndTimeRef.current > 0 &&
        audioContextRef.current.currentTime > scheduledEndTimeRef.current + 0.5) {
      setIsPlaying(false)
      isPlayingRef.current = false
      return  // Stop RAF loop - user can hit play to switch to native audio
    }

    animationFrameRef.current = requestAnimationFrame(updatePlaybackTime)
  }, [])

  const startTTS = async () => {
    if (!article || !apiKey) {
      setError('Please enter your Inworld API key in settings')
      return
    }

    setIsGenerating(true)
    setIsCancelling(false)
    isCancellingRef.current = false
    setError(null)
    setAudioBlob(null)
    setGenerationProgress({ current: 0, total: 0 })
    setCurrentTime(0)
    setDuration(0)
    setHasAudioContext(false)
    setUseNativeAudio(false)
    allAudioDataRef.current = []
    pendingBuffersRef.current = []
    scheduledEndTimeRef.current = 0
    totalDurationRef.current = 0
    isPlayingRef.current = false
    playbackStartedRef.current = false

    // Reset audio context for fresh playback
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }

    // Reset native audio element
    if (audioElementRef.current) {
      audioElementRef.current.pause()
      audioElementRef.current.src = ''
      audioElementRef.current = null
    }

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController()
    currentEncodingRef.current = audioEncoding
    detectedFormatRef.current = null

    try {
      const fullText = [article.title, article.subtitle, article.body]
        .filter(Boolean)
        .join('\n\n')

      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: fullText,
          voice_id: voice,
          apiKey,
          audioEncoding
        }),
        signal: abortControllerRef.current.signal
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'TTS failed')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      const processLine = (line) => {
        if (!line.trim()) return

        try {
          const data = JSON.parse(line)

          if (data.chunkComplete) {
            // Update progress UI
            setGenerationProgress({ current: data.chunkComplete, total: data.totalChunks })

            // If user cancelled, abort now (after receiving current chunk's audio)
            if (isCancellingRef.current) {
              if (abortControllerRef.current) {
                abortControllerRef.current.abort()
              }
            }
          } else if (data.result?.audioContent) {
            // Decode base64 to bytes
            const binaryString = atob(data.result.audioContent)
            const bytes = new Uint8Array(binaryString.length)
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i)
            }

            // Detect format synchronously on first segment (before any async ops)
            if (!detectedFormatRef.current) {
              detectedFormatRef.current = detectAudioFormat(bytes)
              console.log('Detected audio format:', detectedFormatRef.current)
            }

            // Store for final download
            allAudioDataRef.current.push(bytes)

            // Schedule for immediate gapless playback
            scheduleAudioBuffer(bytes)
          } else if (data.error) {
            console.error('TTS error:', data.error)
          }
        } catch (e) {
          // Not valid JSON - might be partial, ignore
        }
      }

      while (true) {
        const { value, done } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete lines
        let newlineIndex
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex)
          buffer = buffer.slice(newlineIndex + 1)
          processLine(line)
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        processLine(buffer)
      }

      // If we have pending buffers but playback never started, start now
      if (!playbackStartedRef.current && pendingBuffersRef.current.length > 0) {
        startPlayback()
      }

    } catch (err) {
      // Don't show error if user cancelled
      if (err.name !== 'AbortError') {
        setError(err.message)
      }
    } finally {
      setIsGenerating(false)
      setIsCancelling(false)
      isCancellingRef.current = false
      abortControllerRef.current = null

      // Always create blob from whatever audio we received.
      // Use detected format (not requested) to build the correct file.
      if (allAudioDataRef.current.length > 0) {
        let finalBlob
        if (detectedFormatRef.current === 'wav') {
          // API returned individual WAV segments - strip headers, recombine into one WAV
          const pcmChunks = allAudioDataRef.current.map(chunk => stripWavHeader(chunk))
          finalBlob = createWavBlob(pcmChunks)
        } else if (detectedFormatRef.current === 'pcm') {
          // Raw PCM without headers
          finalBlob = createWavBlob(allAudioDataRef.current)
        } else {
          // API returned encoded audio (MP3) - concatenate as-is
          finalBlob = new Blob(allAudioDataRef.current, { type: 'audio/mpeg' })
        }
        setAudioBlob(finalBlob)
        // Don't switch to native audio here - let Web Audio finish playing
        // its scheduled buffers. Native audio is set up lazily when the user
        // seeks or replays after Web Audio finishes.
      }

      // Start playback if we have pending buffers but never started
      if (!playbackStartedRef.current && pendingBuffersRef.current.length > 0) {
        startPlayback()
      }
    }
  }

  // Switch to native HTML5 audio for seeking/replay. Called lazily, not on generation complete.
  const switchToNativeAudio = useCallback((blob, seekTo = 0) => {
    // Stop Web Audio API if still running
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    cancelAnimationFrame(animationFrameRef.current)

    // Clean up previous native audio
    if (audioElementRef.current) {
      audioElementRef.current.pause()
      audioElementRef.current.src = ''
    }

    // Create and configure HTML5 audio element
    const audio = new Audio(URL.createObjectURL(blob))
    audioElementRef.current = audio

    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime)
    })

    audio.addEventListener('loadedmetadata', () => {
      const dur = isFinite(audio.duration) ? audio.duration : totalDurationRef.current
      setDuration(dur)
      if (seekTo > 0) {
        audio.currentTime = Math.min(seekTo, dur)
      }
      audio.play()
    })

    audio.addEventListener('ended', () => {
      setIsPlaying(false)
      isPlayingRef.current = false
    })

    audio.addEventListener('play', () => {
      setIsPlaying(true)
      isPlayingRef.current = true
    })

    audio.addEventListener('pause', () => {
      setIsPlaying(false)
      isPlayingRef.current = false
    })

    setUseNativeAudio(true)
  }, [])

  const cancelGeneration = () => {
    // Set cancelling flag - we'll abort after current chunk completes
    setIsCancelling(true)
    isCancellingRef.current = true
    // Don't abort yet - wait for chunkComplete signal in processLine
  }

  const togglePlayPause = async () => {
    // Use native audio if already switched
    if (useNativeAudio && audioElementRef.current) {
      if (isPlaying) {
        audioElementRef.current.pause()
      } else {
        audioElementRef.current.play()
      }
      return
    }

    // Web Audio API is active
    if (audioContextRef.current) {
      if (isPlaying) {
        await audioContextRef.current.suspend()
        cancelAnimationFrame(animationFrameRef.current)
        setIsPlaying(false)
        isPlayingRef.current = false
      } else {
        await audioContextRef.current.resume()
        isPlayingRef.current = true
        setIsPlaying(true)
        updatePlaybackTime()
      }
      return
    }

    // Web Audio is gone but we have a blob - switch to native audio for replay
    if (audioBlob) {
      switchToNativeAudio(audioBlob, 0)
    }
  }

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const percent = (e.clientX - rect.left) / rect.width

    if (useNativeAudio && audioElementRef.current && duration) {
      // Already on native audio - just seek
      audioElementRef.current.currentTime = percent * duration
    } else if (audioBlob && !isGenerating) {
      // Switch to native audio for seeking (Web Audio doesn't support seek)
      const seekTo = percent * totalDurationRef.current
      switchToNativeAudio(audioBlob, seekTo)
    }
  }

  const downloadAudio = () => {
    if (!audioBlob || !article) return
    const ext = detectedFormatRef.current === 'encoded' ? 'mp3' : 'wav'
    const url = URL.createObjectURL(audioBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${article.title.replace(/[^a-z0-9]/gi, '_')}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close()
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (audioElementRef.current) {
        audioElementRef.current.pause()
        audioElementRef.current.src = ''
      }
    }
  }, [])

  const canPlay = article && apiKey && !isGenerating
  const progress = duration ? (currentTime / duration) * 100 : 0

  return (
    <div className="app">
      <header className="header">
        <h1>Say</h1>
        <button className="theme-toggle" onClick={cycleTheme}>
          {THEME_LABELS[theme]}
        </button>
      </header>

      {error && (
        <div className="status status-error">
          {error}
        </div>
      )}

      {/* URL Input Card */}
      <div className="card">
        <div className="card-header">
          <h2>Article</h2>
        </div>

        <div className="input-group">
          <label>Substack URL</label>
          <input
            type="url"
            placeholder="https://example.substack.com/p/article-title"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && scrapeArticle()}
          />
        </div>

        <button
          className="btn btn-primary btn-full"
          onClick={scrapeArticle}
          disabled={!url || loading}
        >
          {loading ? (
            <>
              <span className="spinner" />
              Fetching...
            </>
          ) : 'Fetch Article'}
        </button>

        {article && (
          <div className="article-preview">
            <h3>{article.title}</h3>
            {article.subtitle && <p className="subtitle">{article.subtitle}</p>}
            <div className="body-preview">{article.body.slice(0, 500)}...</div>
            <div className="article-meta">
              <span>{article.wordCount.toLocaleString()} words</span>
              <span>~{Math.ceil(article.wordCount / 150)} min listen</span>
            </div>
          </div>
        )}
      </div>

      {/* Settings Card */}
      <div className="card">
        <div
          className="settings-toggle"
          onClick={() => setShowSettings(!showSettings)}
        >
          <SettingsIcon />
          Settings
          <ChevronIcon open={showSettings} />
        </div>

        {showSettings && (
          <div className="settings-content">
            <div className="input-group">
              <label>Inworld API Key</label>
              <input
                type="password"
                placeholder="Your API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label>Image replacement text</label>
              <input
                type="text"
                value={imageReplacement}
                onChange={(e) => setImageReplacement(e.target.value)}
              />
            </div>

            <div className="input-group">
              <label>Voice</label>
              <div className="voice-grid">
                {VOICES.map(v => (
                  <button
                    key={v.id}
                    className={`voice-option ${voice === v.id ? 'selected' : ''}`}
                    onClick={() => setVoice(v.id)}
                  >
                    <div className="name">{v.name}</div>
                    <div className="desc">{v.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="input-group">
              <label>Audio Encoding</label>
              <div className="encoding-options">
                <button
                  className={`encoding-option ${audioEncoding === 'MP3' ? 'selected' : ''}`}
                  onClick={() => setAudioEncoding('MP3')}
                >
                  <div className="name">MP3</div>
                  <div className="desc">Smaller bandwidth, slight quality loss during streaming</div>
                </button>
                <button
                  className={`encoding-option ${audioEncoding === 'LINEAR16' ? 'selected' : ''}`}
                  onClick={() => setAudioEncoding('LINEAR16')}
                >
                  <div className="name">PCM (Lossless)</div>
                  <div className="desc">Better streaming quality, ~10x more bandwidth</div>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Generate button */}
      {article && !audioBlob && !isGenerating && (
        <button
          className="btn btn-primary btn-full"
          onClick={startTTS}
          disabled={!canPlay}
          style={{ marginBottom: 16 }}
        >
          Generate Audio
        </button>
      )}

      {/* Empty state */}
      {!article && !loading && (
        <div className="empty-state">
          <HeadphonesIcon />
          <p>Paste a Substack URL above to get started</p>
          <p style={{ fontSize: 13 }}>
            Your articles will be read aloud using AI
          </p>
        </div>
      )}

      {/* Player */}
      {(audioBlob || isGenerating || hasAudioContext || useNativeAudio) && (
        <div className="player">
          <div className="player-content">
            <div className="player-info">
              <span className="player-title">{article?.title}</span>
              <span className="player-status">
                {isGenerating ? (
                  <>
                    {isCancelling
                      ? `Stopping after chunk ${generationProgress.current}...`
                      : `Generating ${generationProgress.current}/${generationProgress.total || '?'}...`}
                    {!isCancelling && (
                      <button
                        className="btn-cancel"
                        onClick={cancelGeneration}
                        title="Cancel after current chunk"
                      >
                        &times;
                      </button>
                    )}
                  </>
                ) : 'Ready'}
              </span>
            </div>

            <div className="player-controls">
              <button
                className="play-btn"
                onClick={togglePlayPause}
                disabled={!hasAudioContext && !useNativeAudio}
              >
                {isPlaying ? <PauseIcon /> : <PlayIcon />}
              </button>

              <div className="progress-container">
                <div className="progress-bar" onClick={handleSeek}>
                  <div
                    className="progress-fill"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="progress-time">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>

              <div className="player-actions">
                {audioBlob && (
                  <button
                    className="btn btn-ghost"
                    onClick={downloadAudio}
                    title="Download MP3"
                  >
                    <DownloadIcon />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
