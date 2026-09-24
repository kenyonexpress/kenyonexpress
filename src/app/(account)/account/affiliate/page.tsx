import AffiliateJoinForm from '@/components/account/AffiliateJoinForm'
import ReferralShareCard from '@/components/account/ReferralShareCard'
import { formatDate, formatIls } from '@/lib/account/format'
import type { AffiliateCampaign, ConversionStatus } from '@/lib/affiliates/commission'
import { commissionPercent } from '@/lib/affiliates/format'
import { type MessageKey, t } from '@/lib/i18n/messages'
import { REFERRAL_QUERY_PARAM } from '@/lib/referrals/code'
import { siteUrl } from '@/lib/site-url'
import type { AffiliateConversionRow, AffiliateEnrolment } from '@/server/queries/affiliates'
import { getMyAffiliateStanding } from '@/server/queries/affiliates'

export const metadata = { title: t('affiliate.title') }

const STATUS_KEY: Record<AffiliateEnrolment['status'], MessageKey> = {
  pending_review: 'affiliate.statusPendingReview',
  approved: 'affiliate.statusApproved',
  rejected: 'affiliate.statusRejected',
  suspended: 'affiliate.statusSuspended',
}

const STATUS_TONE: Record<AffiliateEnrolment['status'], string> = {
  pending_review: 'warn',
  approved: 'ok',
  rejected: 'dead',
  suspended: 'dead',
}

/**
 * `flagged` is told to the affiliate as "under review", not as suspicion,
 * for the reason /account/referrals gives: a shared household and a shared
 * card look exactly like fraud from here, and an accusation is not something
 * to hand out on a similarity. The admin queue sees the actual reasons.
 */
const CONVERSION_KEY: Record<ConversionStatus, MessageKey> = {
  pending: 'affiliate.conversionPending',
  flagged: 'affiliate.conversionFlagged',
  paid: 'affiliate.conversionPaid',
  rejected: 'affiliate.conversionRejected',
}

const CONVERSION_TONE: Record<ConversionStatus, string> = {
  pending: 'warn',
  flagged: 'warn',
  paid: 'ok',
  rejected: 'dead',
}

function CampaignRow({ campaign }: { campaign: AffiliateCampaign }) {
  const details: string[] = []
  if (campaign.minOrderAgorot > 0) {
    details.push(
      t('affiliate.campaignMinOrder').replace('{amount}', formatIls(campaign.minOrderAgorot)),
    )
  }
  if (campaign.maxCommissionAgorot !== null) {
    details.push(
      t('affiliate.campaignCap').replace('{amount}', formatIls(campaign.maxCommissionAgorot)),
    )
  }
  if (campaign.endsAt) {
    details.push(t('affiliate.campaignUntil').replace('{date}', formatDate(campaign.endsAt)))
  }
  if (campaign.requiresManualApproval) details.push(t('affiliate.campaignManual'))
  return (
    <li className="affiliate-terms__row">
      <span className="affiliate-terms__name">{campaign.name}</span>
      <span className="affiliate-terms__rate">
        {t('affiliate.campaignRate').replace('{percent}', commissionPercent(campaign.commissionBp))}
      </span>
      {details.length > 0 && <span className="affiliate-terms__meta">{details.join(' · ')}</span>}
    </li>
  )
}

function ConversionListRow({ row }: { row: AffiliateConversionRow }) {
  return (
    <li className="account-row">
      <div className="account-row__main">
        {/* Only a date and an amount. Who bought is not this person's to see,
            for the same reason /account/referrals shows only dates. */}
        <p className="account-row__title">
          {t('affiliate.conversionRow').replace('{date}', formatDate(row.createdAt))}
        </p>
        <p className="account-row__meta">
          <span className={`referral-status referral-status--${CONVERSION_TONE[row.status]}`}>
            {t(CONVERSION_KEY[row.status])}
          </span>
          <span>
            {' '}
            {t('affiliate.conversionBase').replace('{amount}', formatIls(row.baseAgorot))}
          </span>
        </p>
      </div>
      <div className="account-row__actions">
        <span
          className={
            row.status === 'paid' ? 'referral-bonus' : 'referral-bonus referral-bonus--pending'
          }
        >
          {formatIls(row.commissionAgorot)}
        </span>
      </div>
    </li>
  )
}

export default async function AffiliatePage() {
  const standing = await getMyAffiliateStanding()
  const enrolment = standing?.enrolment ?? null

  return (
    <>
      <h1 className="account-title">{t('affiliate.title')}</h1>
      <p className="account-subtitle">{t('affiliate.subtitle')}</p>

      <section className="account-card">
        <h2 className="account-card__title">{t('affiliate.howTitle')}</h2>
        <ol className="referral-steps">
          <li>{t('affiliate.howStep1')}</li>
          <li>{t('affiliate.howStep2')}</li>
          <li>{t('affiliate.howStep3')}</li>
        </ol>
        <p className="referral-terms">{t('affiliate.terms')}</p>
      </section>

      {/*
        THE PROGRAMME NOT BEING OPEN IS A REAL SCREEN. Until 244 is applied
        there is no campaigns table and nothing can pay; the page says so
        instead of listing a commission of nothing. Joining is still offered,
        because the enrolment row lives in `affiliates` (010, applied) and an
        approved affiliate is ready the day the programme opens.
      */}
      {standing?.programmeUnavailable && (
        <section className="account-card" data-testid="affiliate-unavailable">
          <h2 className="account-card__title">{t('affiliate.unavailableTitle')}</h2>
          <p className="account-empty">{t('affiliate.unavailableBody')}</p>
        </section>
      )}

      {!enrolment ? (
        <section className="account-card">
          <h2 className="account-card__title">{t('affiliate.joinTitle')}</h2>
          <AffiliateJoinForm />
        </section>
      ) : (
        <>
          <section
            className="account-card"
            data-testid="affiliate-status"
            data-status={enrolment.status}
          >
            <h2 className="account-card__title">{t('affiliate.statusTitle')}</h2>
            <p className="account-row__meta">
              <span className={`referral-status referral-status--${STATUS_TONE[enrolment.status]}`}>
                {t(STATUS_KEY[enrolment.status])}
              </span>
            </p>
          </section>

          {(enrolment.status === 'approved' || enrolment.status === 'pending_review') && (
            <section className="account-card">
              <h2 className="account-card__title">{t('affiliate.codeTitle')}</h2>
              <ReferralShareCard
                initialCode={enrolment.code}
                shareOrigin={siteUrl()}
                shareParam={REFERRAL_QUERY_PARAM}
              />
            </section>
          )}
        </>
      )}

      {standing && !standing.programmeUnavailable && (
        <section className="account-card">
          <h2 className="account-card__title">{t('affiliate.campaignsTitle')}</h2>
          {standing.campaigns.length === 0 ? (
            <p className="account-empty">{t('affiliate.campaignsEmpty')}</p>
          ) : (
            <ul className="affiliate-terms">
              {standing.campaigns.map((campaign) => (
                <CampaignRow key={campaign.id} campaign={campaign} />
              ))}
            </ul>
          )}
        </section>
      )}

      {enrolment && standing && (
        <section className="account-card">
          <h2 className="account-card__title">{t('affiliate.earningsTitle')}</h2>
          <div className="affiliate-totals">
            <div>
              <span className="affiliate-totals__label">{t('affiliate.earningsPaid')}</span>
              <span className="affiliate-totals__value">{formatIls(standing.paidAgorot)}</span>
            </div>
            <div>
              <span className="affiliate-totals__label">{t('affiliate.earningsPending')}</span>
              <span className="affiliate-totals__value">{formatIls(standing.pendingAgorot)}</span>
            </div>
          </div>
          {standing.conversions.length === 0 ? (
            <p className="account-empty">{t('affiliate.conversionsEmpty')}</p>
          ) : (
            <ul className="account-list">
              {standing.conversions.map((row) => (
                <ConversionListRow key={row.id} row={row} />
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  )
}
