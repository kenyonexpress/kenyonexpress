import type { NextRequest } from 'next/server'

export interface GeographicEdgeConfig {
  language?: string
  region?: string
  preferredRegions?: string[]
}

export function getGeographicEdgeRegions(request: NextRequest): GeographicEdgeConfig {
  const acceptLanguage = request.headers.get('accept-language') || ''
  const cloudflareCountry = request.headers.get('cf-ipcountry') || ''

  const isHebrewSpeaker = acceptLanguage.includes('he') || acceptLanguage.startsWith('he-')

  const config: GeographicEdgeConfig = {
    language: acceptLanguage,
    region: cloudflareCountry,
  }

  if (isHebrewSpeaker) {
    config.preferredRegions = ['dub1', 'fra1']
    config.preferredRegions = prioritizeHebrewEdge(cloudflareCountry)
  }

  return config
}

export function prioritizeHebrewEdge(country: string): string[] {
  const hebrewFriendlyRegions: Record<string, string[]> = {
    IL: ['dub1', 'fra1'],
    PS: ['dub1', 'fra1'],
    JO: ['fra1', 'dub1'],
    LB: ['fra1', 'dub1'],
    SY: ['fra1', 'dub1'],
    EG: ['fra1', 'dub1'],
    AE: ['fra1', 'dub1'],
  }

  return hebrewFriendlyRegions[country.toUpperCase()] || ['fra1', 'dub1']
}

export function setGeographicEdgeHeaders(
  config: GeographicEdgeConfig,
  headers: Record<string, string>,
): Record<string, string> {
  const newHeaders = { ...headers }

  if (config.preferredRegions && config.preferredRegions.length > 0) {
    newHeaders['X-Preferred-Regions'] = config.preferredRegions.join(',')
    newHeaders['X-Cache-Region'] = config.preferredRegions[0] || 'fra1'
  }

  if (config.language) {
    newHeaders['X-Accept-Language'] = config.language
  }

  if (config.region) {
    newHeaders['X-User-Region'] = config.region
  }

  return newHeaders
}

export function isHebrewContent(request: NextRequest): boolean {
  const config = getGeographicEdgeConfig(request)
  return config.preferredRegions !== undefined
}

export function getGeographicEdgeConfig(request: NextRequest): GeographicEdgeConfig {
  const acceptLanguage = request.headers.get('accept-language') || ''
  const isHebrewSpeaker = acceptLanguage.includes('he') || acceptLanguage.startsWith('he-')

  if (isHebrewSpeaker) {
    return {
      language: acceptLanguage,
      preferredRegions: ['dub1', 'fra1'],
    }
  }

  return {
    language: acceptLanguage,
  }
}
