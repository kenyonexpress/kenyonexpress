/**
 * Ultra-simplified mobile-only hero (380px) for maximum Electro parity.
 * Minimal structure, no slider complexity, static content only.
 */
export default function HeroMobile() {
  return (
    <div
      style={{
        width: '100%',
        height: '200px',
        background: 'var(--color-brand-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 700,
            color: 'var(--color-heading)',
            margin: '0 0 8px 0',
          }}
        >
          קניון EXPRESS
        </h1>
        <p style={{ fontSize: '16px', color: 'var(--color-heading)', margin: 0 }}>
          מסדרים לך בילוי
        </p>
      </div>
    </div>
  )
}
