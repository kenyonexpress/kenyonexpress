import { businessGoogleMapsHref, businessWazeHref } from '@/lib/business-location'

/** Navigation to the business, from the personal area. */
export default function BusinessLocation() {
  return (
    <section className="account-card" aria-label="הגעה לבית העסק">
      <div className="account-row">
        <div className="account-row__main">
          <p className="account-row__title">הגעה לבית העסק</p>
          <p className="account-row__meta">פתחו ניווט ישירות מהנייד.</p>
        </div>
        <div className="account-row__actions">
          <a
            className="account-btn"
            href={businessWazeHref()}
            target="_blank"
            rel="noopener noreferrer"
          >
            ניווט ב-Waze
          </a>
          <a
            className="account-btn"
            href={businessGoogleMapsHref()}
            target="_blank"
            rel="noopener noreferrer"
          >
            Google Maps
          </a>
        </div>
      </div>
    </section>
  )
}
