'use client'

import { useState } from 'react'

type TabId = 'overview' | 'orders' | 'wishlist' | 'addresses' | 'settings'

interface Tab {
  id: TabId
  label: string
}

const TABS: Tab[] = [
  { id: 'overview', label: 'סקירה' },
  { id: 'orders', label: 'ההזמנות שלי' },
  { id: 'wishlist', label: 'רשימת המשאלות' },
  { id: 'addresses', label: 'כתובות' },
  { id: 'settings', label: 'הגדרות' },
]

interface AccountPageTabsProps {
  children: React.ReactNode
  defaultTab?: TabId
}

export default function AccountPageTabs({
  children,
  defaultTab = 'overview',
}: AccountPageTabsProps) {
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab)

  return (
    <div>
      <nav className="account-tabs" aria-label="טבים בתחום האזור האישי">
        <div className="account-tabs__header">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              aria-pressed={activeTab === tab.id}
              className={`account-tabs__button${activeTab === tab.id ? ' is-active' : ''}`}
              aria-current={activeTab === tab.id ? 'page' : undefined}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="account-tabs__content" data-tab={activeTab}>
        {children}
      </div>
    </div>
  )
}

export type { TabId }
