import '@/styles/electro-icons.css'

type Benefit = {
  icon: 'ec-transport' | 'ec-customers' | 'ec-support' | 'ec-payment' | 'ec-tag'
  bold: string
  rest: string
  iconSize?: string
}

/** refs/ke_live_singlefile.html — .features-list .feature (DOM order, RTL right → left) */
const BENEFITS: Benefit[] = [
  { icon: 'ec-transport', bold: 'לכל חלקי', rest: 'הארץ' },
  { icon: 'ec-customers', bold: 'קניה', rest: 'חכמה', iconSize: '3.386em' },
  { icon: 'ec-support', bold: 'שירות', rest: 'לקוחות' },
  { icon: 'ec-payment', bold: 'מחירים', rest: 'מנצחים' },
  { icon: 'ec-tag', bold: 'מותגי יוקרה', rest: 'מובילים !' },
]

export default function BenefitBar() {
  return (
    <section aria-label="יתרונות" dir="rtl" className="featured-block-md w-full bg-white font-sans">
      <div className="mx-auto max-w-page px-4">
        <div
          className="features-list row row-cols-lg-5 flex flex-nowrap justify-between overflow-auto"
          style={{
            border: '1px solid #ddd',
            borderRadius: '8px',
            marginBottom: '1.643em',
            marginRight: 0,
            marginLeft: 0,
          }}
        >
          {BENEFITS.map((item, index) => (
            <div
              key={item.icon}
              className="feature mx-auto flex w-[180px] shrink-0 lg:w-1/5 lg:pl-[15px]"
              style={{
                paddingTop: '1.357em',
                paddingBottom: '0.929em',
                borderBottom: 'none',
                flex: '0 0 auto',
                ...(index > 0 ? { borderRight: '1px solid #ddd' } : {}),
              }}
            >
              <div
                className="media mx-auto flex items-center"
                style={{ width: '150px' }}
              >
                <div
                  className="media-left feature-icon media-middle shrink-0"
                  style={{ paddingLeft: '10px' }}
                >
                  <i
                    className={`ec ${item.icon}`}
                    aria-hidden="true"
                    style={{
                      color: '#fed700',
                      fontSize: item.iconSize ?? '2.571em',
                    }}
                  />
                </div>
                <div
                  className="media-body feature-text media-middle"
                  style={{
                    fontSize: '1em',
                    lineHeight: 1.25,
                    flexGrow: 1,
                    textAlign: 'right',
                    color: '#333e48',
                  }}
                >
                  <strong className="block font-bold">{item.bold}</strong>
                  <span className="font-normal">{item.rest}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
