'use client'

/**
 * Crisp live chat widget integration.
 * Loads the Crisp chat script and initializes it with the website ID.
 * Only loads when NEXT_PUBLIC_CRISP_WEBSITE_ID is set.
 *
 * BACKLOG Item 2: Crisp inbox, post-launch.
 * Implementation ready - activate by setting env var post-launch.
 */

import { useEffect } from 'react'

export default function CrispChat() {
  useEffect(() => {
    const websiteId = process.env.NEXT_PUBLIC_CRISP_WEBSITE_ID

    if (!websiteId) {
      // Not configured - silent no-op
      return
    }

    // Crisp configuration
    window.$crisp = []
    window.CRISP_WEBSITE_ID = websiteId

    // Load Crisp script
    const script = document.createElement('script')
    script.src = 'https://client.crisp.chat/l.js'
    script.async = true
    document.head?.appendChild(script)

    // Configure for Hebrew/RTL
    script.onload = () => {
      window.$crisp?.push(['set', 'session:data', [[['locale', 'he']]]])
    }

    return () => {
      // Cleanup on unmount
      if (window.$crisp) {
        window.$crisp.push(['do', 'chat:hide'])
      }
    }
  }, [])

  return null // No visual component, script-only
}

// Type definitions for Crisp
declare global {
  interface Window {
    $crisp?: Array<[string, string, ...any[]]>
    CRISP_WEBSITE_ID?: string
  }
}
