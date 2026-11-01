'use client'

import { createClient } from '@/lib/supabase/client'
import { useEffect, useState } from 'react'

type Campaign = {
  id: number
  slug: string
  name: string
  commission_rate: number
  cookie_days: number
  active: boolean
  created_at: string
}

type ClickMetrics = {
  campaign_id: number
  total_clicks: number
  total_conversions: number
  conversion_rate: number
  total_commission_agorot: number
}

export default function AffiliatePage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [metrics, setMetrics] = useState<Map<number, ClickMetrics>>(new Map())
  const [loading, setLoading] = useState(true)
  const [newCampaign, setNewCampaign] = useState({
    slug: '',
    name: '',
    commission_rate: 500, // 5%
    cookie_days: 30,
  })

  const client = createClient()

  useEffect(() => {
    loadCampaigns()
  }, [])

  async function loadCampaigns() {
    setLoading(true)
    try {
      const { data, error } = await client
        .from('affiliate_campaigns')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error

      setCampaigns((data as Campaign[]) || [])

      // Load metrics for each campaign
      const metricsMap = new Map<number, ClickMetrics>()
      for (const campaign of (data as Campaign[]) || []) {
        const { data: clicks } = await client
          .from('affiliate_clicks')
          .select('converted_at, commission_agorot')
          .eq('campaign_id', campaign.id)

        const clicksList = (clicks as any[]) || []
        const totalClicks = clicksList.length
        const conversions = clicksList.filter((c) => c.converted_at).length
        const totalCommission = clicksList.reduce((sum, c) => sum + (c.commission_agorot || 0), 0)

        metricsMap.set(campaign.id, {
          campaign_id: campaign.id,
          total_clicks: totalClicks,
          total_conversions: conversions,
          conversion_rate: totalClicks > 0 ? (conversions / totalClicks) * 100 : 0,
          total_commission_agorot: totalCommission,
        })
      }

      setMetrics(metricsMap)
    } catch (error) {
      console.error('failed to load campaigns:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateCampaign(e: React.FormEvent) {
    e.preventDefault()

    try {
      const { error } = await client.from('affiliate_campaigns').insert({
        slug: newCampaign.slug,
        name: newCampaign.name,
        commission_rate: newCampaign.commission_rate,
        cookie_days: newCampaign.cookie_days,
        active: true,
      })

      if (error) throw error

      setNewCampaign({ slug: '', name: '', commission_rate: 500, cookie_days: 30 })
      loadCampaigns()
    } catch (error) {
      console.error('failed to create campaign:', error)
    }
  }

  async function toggleCampaignActive(campaign: Campaign) {
    try {
      const { error } = await client
        .from('affiliate_campaigns')
        .update({ active: !campaign.active })
        .eq('id', campaign.id)

      if (error) throw error
      loadCampaigns()
    } catch (error) {
      console.error('failed to toggle campaign:', error)
    }
  }

  if (loading) return <div className="p-4">טוען...</div>

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-3xl font-bold">קמפיינים שיתופיים</h1>

      {/* Create New Campaign */}
      <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
        <h2 className="text-xl font-semibold mb-4">קמפיין חדש</h2>
        <form onSubmit={handleCreateCampaign} className="space-y-4">
          <div>
            <label htmlFor="slug-input" className="block text-sm font-medium mb-1">
              slug (קוד URL)
            </label>
            <input
              id="slug-input"
              type="text"
              value={newCampaign.slug}
              onChange={(e) => setNewCampaign({ ...newCampaign, slug: e.target.value })}
              placeholder="summer-2024"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded"
            />
          </div>
          <div>
            <label htmlFor="name-input" className="block text-sm font-medium mb-1">
              שם
            </label>
            <input
              id="name-input"
              type="text"
              value={newCampaign.name}
              onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
              placeholder="קמפיין הקיץ"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded"
            />
          </div>
          <div>
            <label htmlFor="rate-input" className="block text-sm font-medium mb-1">
              שיעור עמלה (נקודות בסיס, 0-5000)
            </label>
            <input
              id="rate-input"
              type="number"
              value={newCampaign.commission_rate}
              onChange={(e) =>
                setNewCampaign({ ...newCampaign, commission_rate: Number(e.target.value) })
              }
              min="0"
              max="5000"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded"
            />
          </div>
          <div>
            <label htmlFor="cookie-days-input" className="block text-sm font-medium mb-1">
              ימי Cookie
            </label>
            <input
              id="cookie-days-input"
              type="number"
              value={newCampaign.cookie_days}
              onChange={(e) =>
                setNewCampaign({ ...newCampaign, cookie_days: Number(e.target.value) })
              }
              min="1"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded"
            />
          </div>
          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            צור קמפיין
          </button>
        </form>
      </div>

      {/* Campaigns List */}
      <div>
        <h2 className="text-xl font-semibold mb-4">קמפיינים</h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300">
            <thead className="bg-gray-100">
              <tr>
                <th className="border border-gray-300 p-3 text-left">שם</th>
                <th className="border border-gray-300 p-3 text-left">slug</th>
                <th className="border border-gray-300 p-3 text-left">עמלה</th>
                <th className="border border-gray-300 p-3 text-left">ימי Cookie</th>
                <th className="border border-gray-300 p-3 text-left">קליקים</th>
                <th className="border border-gray-300 p-3 text-left">המרות</th>
                <th className="border border-gray-300 p-3 text-left">שיעור המרה</th>
                <th className="border border-gray-300 p-3 text-left">עמלה כוללת</th>
                <th className="border border-gray-300 p-3 text-left">סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((campaign) => {
                const m = metrics.get(campaign.id)
                return (
                  <tr key={campaign.id} className="border border-gray-300">
                    <td className="border border-gray-300 p-3">{campaign.name}</td>
                    <td className="border border-gray-300 p-3 font-mono text-sm">
                      {campaign.slug}
                    </td>
                    <td className="border border-gray-300 p-3">
                      {campaign.commission_rate / 100}%
                    </td>
                    <td className="border border-gray-300 p-3">{campaign.cookie_days}</td>
                    <td className="border border-gray-300 p-3">{m?.total_clicks || 0}</td>
                    <td className="border border-gray-300 p-3">{m?.total_conversions || 0}</td>
                    <td className="border border-gray-300 p-3">{m?.conversion_rate.toFixed(1)}%</td>
                    <td className="border border-gray-300 p-3">
                      ₪{(m?.total_commission_agorot || 0) / 100}
                    </td>
                    <td className="border border-gray-300 p-3">
                      <button
                        type="button"
                        onClick={() => toggleCampaignActive(campaign)}
                        className={`px-3 py-1 rounded text-white text-sm ${
                          campaign.active
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-red-600 hover:bg-red-700'
                        }`}
                      >
                        {campaign.active ? 'פעיל' : 'לא פעיל'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
