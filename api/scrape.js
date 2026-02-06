// Using Node.js runtime for cheerio compatibility
export const config = {
  runtime: 'nodejs'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { url, imageReplacement = '[clear_throat]' } = req.body

    if (!url) {
      return res.status(400).json({ error: 'URL is required' })
    }

    // Validate it's a substack URL
    const urlObj = new URL(url)
    if (!urlObj.hostname.includes('substack.com')) {
      return res.status(400).json({ error: 'Only Substack URLs are supported' })
    }

    // Dynamically import cheerio
    const cheerio = await import('cheerio')

    // Fetch the article
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    })

    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to fetch article: ${response.status}` })
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    // Extract title - try multiple selectors
    const title = $('h1.post-title').text().trim() ||
                  $('h1[class*="post-title"]').text().trim() ||
                  $('article h1').first().text().trim() ||
                  $('h1').first().text().trim() ||
                  ''

    // Extract subtitle
    const subtitle = $('h3.subtitle').text().trim() ||
                     $('h3[class*="subtitle"]').text().trim() ||
                     $('.subtitle').text().trim() ||
                     ''

    // Extract body content - Substack uses various class names
    // Try specific selectors in order of specificity to avoid overlapping containers
    let bodyContainer = $('div.body.markup')
    if (!bodyContainer.length) bodyContainer = $('.markup')
    if (!bodyContainer.length) bodyContainer = $('article .available-content')
    if (!bodyContainer.length) bodyContainer = $('article')

    // Clone to avoid modifying original
    const bodyClone = bodyContainer.clone()

    // Remove non-content elements
    bodyClone.find('script, style, noscript, iframe, .subscription-widget, .subscribe-widget, .paywall, .footer, .comments, .share-dialog, .post-footer').remove()

    // Replace images with placeholder text
    bodyClone.find('img').each((_, el) => {
      $(el).replaceWith(` ${imageReplacement} `)
    })

    // Replace figure elements
    bodyClone.find('figure').each((_, el) => {
      const figcaption = $(el).find('figcaption').text().trim()
      if (figcaption) {
        $(el).replaceWith(` ${imageReplacement} ${figcaption} `)
      } else {
        $(el).replaceWith(` ${imageReplacement} `)
      }
    })

    // Convert links to just their text
    bodyClone.find('a').each((_, el) => {
      $(el).replaceWith($(el).text())
    })

    // Get text content, preserving paragraph breaks
    let bodyText = ''
    const processedTexts = new Set() // Track processed text to avoid duplicates

    bodyClone.find('p, h2, h3, h4, h5, h6, blockquote, li').each((_, el) => {
      const text = $(el).text().trim()
      if (text && !processedTexts.has(text)) {
        bodyText += text + '\n\n'
        processedTexts.add(text)
      }
    })

    // Fallback if no structured content found
    if (!bodyText.trim()) {
      bodyText = bodyClone.text().trim()
    }

    // Clean up the text
    bodyText = bodyText
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .trim()

    if (!title && !bodyText) {
      return res.status(400).json({ error: 'Could not extract article content. The page structure may have changed.' })
    }

    const wordCount = bodyText.split(/\s+/).filter(Boolean).length

    return res.status(200).json({
      title,
      subtitle,
      body: bodyText,
      wordCount,
      url
    })

  } catch (error) {
    console.error('Scrape error:', error)
    return res.status(500).json({ error: error.message || 'Failed to scrape article' })
  }
}
