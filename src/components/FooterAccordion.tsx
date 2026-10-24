'use client'

import { useState } from 'react'

type FooterLink = { label: string; href: string }

function AccordionSection({
  title,
  links,
}: {
  title: string
  links: FooterLink[]
}) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="border-b border-gray-800 last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-4 px-4 text-right flex justify-between items-center text-white text-button-small hover:bg-gray-700 transition-colors"
        aria-expanded={isOpen}
      >
        {title}
        <span className={`transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {isOpen && (
        <ul className="bg-gray-700 space-y-3 px-4 py-3">
          {links.map((link) => (
            <li key={link.label}>
              <a
                href={link.href}
                className="text-sm text-gray-300 hover:text-white transition-colors block"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function FooterAccordion({
  columns,
}: {
  columns: { title: string; links: FooterLink[] }[]
}) {
  return (
    <>
      {columns.map((col) => (
        <AccordionSection key={col.title} title={col.title} links={col.links} />
      ))}

      <div className="px-4 py-4">
        <h2 className="text-white text-footer-heading mb-3">אמצעי תשלום</h2>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <div className="bg-gray-600 px-3 py-2 rounded text-xs text-gray-300">💳 כרטיס אשראי</div>
          <div className="bg-gray-600 px-3 py-2 rounded text-xs text-gray-300">🏦 העברה בנקאית</div>
        </div>
      </div>
    </>
  )
}
