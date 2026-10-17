import { resolveMx, resolveTxt } from 'node:dns/promises'

/**
 * Verify SPF record for domain.
 * SPF record: v=spf1 include:resend.com ~all
 */
export async function verifySPF(domain: string): Promise<boolean> {
  try {
    const records = await resolveTxt(domain)
    const spfRecord = records.find((record) => record.join('').startsWith('v=spf1'))

    if (!spfRecord) return false

    const spfText = spfRecord.join('')
    return spfText.includes('include:resend.com') || spfText.includes('include:*.resend.com')
  } catch {
    return false
  }
}

/**
 * Verify DKIM record for domain.
 * DKIM record: default._domainkey.{domain} CNAME *.dkim.resend.com
 */
export async function verifyDKIM(domain: string): Promise<boolean> {
  try {
    const dkimDomain = `default._domainkey.${domain}`
    const records = await resolveTxt(dkimDomain)

    // DKIM records contain verification data
    return records.length > 0
  } catch {
    // If DNS lookup fails, DKIM might not be set up yet
    return false
  }
}

/**
 * Verify DMARC record for domain.
 * DMARC record: _dmarc.{domain} TXT v=DMARC1; p=quarantine; rua=mailto:...
 */
export async function verifyDMARC(domain: string): Promise<boolean> {
  try {
    const dmarcDomain = `_dmarc.${domain}`
    const records = await resolveTxt(dmarcDomain)
    const dmarcRecord = records.find((record) => record.join('').startsWith('v=DMARC1'))

    return dmarcRecord !== undefined
  } catch {
    return false
  }
}

/**
 * Check if domain has valid MX records (needed for email delivery).
 */
export async function verifyDomainMX(domain: string): Promise<boolean> {
  try {
    const records = await resolveMx(domain)
    return records.length > 0
  } catch {
    return false
  }
}

/**
 * Full domain authentication verification.
 */
export async function verifyDomainAuthentication(domain: string): Promise<{
  spfVerified: boolean
  dkimVerified: boolean
  dmarcVerified: boolean
  mxVerified: boolean
  allVerified: boolean
}> {
  const [spfVerified, dkimVerified, dmarcVerified, mxVerified] = await Promise.all([
    verifySPF(domain),
    verifyDKIM(domain),
    verifyDMARC(domain),
    verifyDomainMX(domain),
  ])

  return {
    spfVerified,
    dkimVerified,
    dmarcVerified,
    mxVerified,
    allVerified: spfVerified && dkimVerified && dmarcVerified && mxVerified,
  }
}
