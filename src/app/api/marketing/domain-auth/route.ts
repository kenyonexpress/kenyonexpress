import { verifyDomainAuthentication } from '@/lib/email/domain-verification'
import { log } from '@/lib/observability/log'
import { rateLimit } from '@/lib/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { validateAdminRequest } from '@/server/auth/admin-check'

export interface DomainAuthStatus {
  domain: string
  spfRecord: string | null
  spfVerified: boolean
  spfVerifiedAt: string | null
  dkimRecord: string | null
  dkimVerified: boolean
  dkimVerifiedAt: string | null
  dmarcRecord: string | null
  dmarcVerified: boolean
  dmarcVerifiedAt: string | null
  resendDomainId: string | null
  createdAt: string
  updatedAt: string
  allVerified: boolean
}

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await validateAdminRequest(request)
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const domain = searchParams.get('domain')

    const db = createAdminClient()

    if (domain) {
      const { data, error } = await db
        .from('email_domain_auth')
        .select('*')
        .eq('domain', domain)
        .single()

      if (error || !data) {
        return Response.json({ error: 'Domain not found' }, { status: 404 })
      }

      return Response.json({
        domain: data.domain,
        spfRecord: data.spf_record,
        spfVerified: data.spf_verified,
        spfVerifiedAt: data.spf_verified_at,
        dkimRecord: data.dkim_record,
        dkimVerified: data.dkim_verified,
        dkimVerifiedAt: data.dkim_verified_at,
        dmarcRecord: data.dmarc_record,
        dmarcVerified: data.dmarc_verified,
        dmarcVerifiedAt: data.dmarc_verified_at,
        resendDomainId: data.resend_domain_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
        allVerified: data.spf_verified && data.dkim_verified && data.dmarc_verified,
      })
    }

    // List all domains
    const { data, error } = await db
      .from('email_domain_auth')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      log.error('domain_auth.list_failed', { error: error.message })
      return Response.json({ error: 'Failed to fetch domains' }, { status: 500 })
    }

    return Response.json({
      domains: (data || []).map((d) => ({
        domain: d.domain,
        spfRecord: d.spf_record,
        spfVerified: d.spf_verified,
        spfVerifiedAt: d.spf_verified_at,
        dkimRecord: d.dkim_record,
        dkimVerified: d.dkim_verified,
        dkimVerifiedAt: d.dkim_verified_at,
        dmarcRecord: d.dmarc_record,
        dmarcVerified: d.dmarc_verified,
        dmarcVerifiedAt: d.dmarc_verified_at,
        resendDomainId: d.resend_domain_id,
        createdAt: d.created_at,
        updatedAt: d.updated_at,
        allVerified: d.spf_verified && d.dkim_verified && d.dmarc_verified,
      })),
    })
  } catch (error) {
    log.error('domain_auth.get_error', { error })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await validateAdminRequest(request)
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const limiter = await rateLimit('admin-domain-auth', user.id)
    if (!limiter.allowed) {
      return Response.json(
        { error: 'Rate limited' },
        { status: 429, headers: { 'Retry-After': '3600' } },
      )
    }

    const body = (await request.json()) as {
      domain: string
      spfRecord?: string | null
      spfVerified?: boolean
      dkimRecord?: string | null
      dkimVerified?: boolean
      dmarcRecord?: string | null
      dmarcVerified?: boolean
      resendDomainId?: string | null
    }

    if (!body.domain) {
      return Response.json({ error: 'Domain is required' }, { status: 400 })
    }

    const db = createAdminClient()

    // Verify DNS records if not explicitly provided
    let verificationResult = {
      spfVerified: body.spfVerified || false,
      dkimVerified: body.dkimVerified || false,
      dmarcVerified: body.dmarcVerified || false,
    }

    // If no explicit verification provided, perform DNS lookup
    if (!body.spfVerified && !body.dkimVerified && !body.dmarcVerified) {
      const verification = await verifyDomainAuthentication(body.domain)
      verificationResult = {
        spfVerified: verification.spfVerified,
        dkimVerified: verification.dkimVerified,
        dmarcVerified: verification.dmarcVerified,
      }

      log.info('domain_auth.verified', {
        domain: body.domain,
        results: verificationResult,
      })
    }

    const { data, error } = await db
      .from('email_domain_auth')
      .upsert({
        domain: body.domain,
        spf_record: body.spfRecord || null,
        spf_verified: verificationResult.spfVerified,
        spf_verified_at: verificationResult.spfVerified ? new Date().toISOString() : null,
        dkim_record: body.dkimRecord || null,
        dkim_verified: verificationResult.dkimVerified,
        dkim_verified_at: verificationResult.dkimVerified ? new Date().toISOString() : null,
        dmarc_record: body.dmarcRecord || null,
        dmarc_verified: verificationResult.dmarcVerified,
        dmarc_verified_at: verificationResult.dmarcVerified ? new Date().toISOString() : null,
        resend_domain_id: body.resendDomainId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('domain', body.domain)
      .select('*')
      .single()

    if (error) {
      log.error('domain_auth.upsert_failed', { error: error.message, domain: body.domain })
      return Response.json({ error: 'Failed to save domain' }, { status: 500 })
    }

    log.info('domain_auth.updated', { domain: body.domain })

    return Response.json({
      domain: data.domain,
      spfRecord: data.spf_record,
      spfVerified: data.spf_verified,
      spfVerifiedAt: data.spf_verified_at,
      dkimRecord: data.dkim_record,
      dkimVerified: data.dkim_verified,
      dkimVerifiedAt: data.dkim_verified_at,
      dmarcRecord: data.dmarc_record,
      dmarcVerified: data.dmarc_verified,
      dmarcVerifiedAt: data.dmarc_verified_at,
      resendDomainId: data.resend_domain_id,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      allVerified: data.spf_verified && data.dkim_verified && data.dmarc_verified,
    })
  } catch (error) {
    log.error('domain_auth.post_error', { error })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
