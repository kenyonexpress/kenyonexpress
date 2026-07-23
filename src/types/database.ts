// Auto-generated types from Supabase schema — manually extended for Phase 3.
// Regenerate with: pnpm db:types (then re-apply manual extensions)

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          phone: string | null
          avatar_url: string | null
          role: 'customer' | 'vendor' | 'content_uploader' | 'admin' | 'super_admin'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          phone?: string | null
          avatar_url?: string | null
          role?: 'customer' | 'vendor' | 'content_uploader' | 'admin' | 'super_admin'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          phone?: string | null
          avatar_url?: string | null
          role?: 'customer' | 'vendor' | 'content_uploader' | 'admin' | 'super_admin'
          created_at?: string
          updated_at?: string
        }
        Relationships: [{ foreignKeyName: 'profiles_id_fkey'; columns: ['id']; referencedRelation: 'users'; referencedColumns: ['id'] }]
      }
      vendors: {
        Row: {
          id: string
          profile_id: string
          business_name: string
          business_id: string
          legal_name: string | null
          tax_id: string | null
          contact_name: string | null
          contact_email: string
          contact_phone: string | null
          address: string | null
          bank_account_holder: string | null
          bank_name: string | null
          bank_branch: string | null
          bank_account: string | null
          commission_rate: number
          logo_url: string | null
          status: 'pending' | 'active' | 'suspended'
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          business_name: string
          business_id: string
          legal_name?: string | null
          tax_id?: string | null
          contact_name?: string | null
          contact_email: string
          contact_phone?: string | null
          address?: string | null
          bank_account_holder?: string | null
          bank_name?: string | null
          bank_branch?: string | null
          bank_account?: string | null
          commission_rate?: number
          logo_url?: string | null
          status?: 'pending' | 'active' | 'suspended'
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          business_name?: string
          business_id?: string
          legal_name?: string | null
          tax_id?: string | null
          contact_name?: string | null
          contact_email?: string
          contact_phone?: string | null
          address?: string | null
          bank_account_holder?: string | null
          bank_name?: string | null
          bank_branch?: string | null
          bank_account?: string | null
          commission_rate?: number
          logo_url?: string | null
          status?: 'pending' | 'active' | 'suspended'
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [{ foreignKeyName: 'vendors_profile_id_fkey'; columns: ['profile_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] }]
      }
      categories: {
        Row: {
          id: string
          slug: string
          name_he: string
          name_en: string
          description_he: string | null
          parent_id: string | null
          icon_url: string | null
          sort_order: number
          is_active: boolean
          created_by: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          slug: string
          name_he: string
          name_en: string
          description_he?: string | null
          parent_id?: string | null
          icon_url?: string | null
          sort_order?: number
          is_active?: boolean
          created_by?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          slug?: string
          name_he?: string
          name_en?: string
          description_he?: string | null
          parent_id?: string | null
          icon_url?: string | null
          sort_order?: number
          is_active?: boolean
          created_by?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'categories_parent_id_fkey'; columns: ['parent_id']; referencedRelation: 'categories'; referencedColumns: ['id'] },
          { foreignKeyName: 'categories_created_by_fkey'; columns: ['created_by']; referencedRelation: 'users'; referencedColumns: ['id'] }
        ]
      }
      products: {
        Row: {
          id: string
          supplier_id: string
          category_id: string | null
          slug: string
          name_he: string
          name_en: string | null
          description_he: string | null
          type: 'coupon' | 'physical' | 'service'
          status: 'draft' | 'active' | 'paused' | 'sold_out' | 'archived'
          price_ils: number
          compare_at_price_ils: number | null
          compare_at_price: number | null
          cost_ils: number | null
          kenyon_price: number | null
          full_price: number | null
          is_coupon_enabled: boolean
          platform_percent: number
          cashback_percent: number
          coupon_expiry_days: number
          commission_percent: number
          stock_quantity: number | null
          sku: string | null
          is_featured: boolean
          images: Json
          attributes: Json
          short_description_he: string | null
          brand: string | null
          highlights: Json
          video_url: string | null
          barcode: string | null
          low_stock_threshold: number
          max_per_order: number | null
          requires_shipping: boolean
          weight_grams: number | null
          length_cm: number | null
          width_cm: number | null
          height_cm: number | null
          warranty_months: number | null
          condition: string | null
          coupon_terms_he: string | null
          redemption_instructions_he: string | null
          min_purchase_ils: number | null
          seo_title: string | null
          seo_description: string | null
          seo_keywords: string | null
          published_at: string | null
          created_by: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          supplier_id: string
          category_id?: string | null
          slug: string
          name_he: string
          name_en?: string | null
          description_he?: string | null
          type: 'coupon' | 'physical' | 'service'
          status?: 'draft' | 'active' | 'paused' | 'sold_out' | 'archived'
          price_ils: number
          compare_at_price_ils?: number | null
          compare_at_price?: number | null
          cost_ils?: number | null
          kenyon_price?: number | null
          full_price?: number | null
          is_coupon_enabled?: boolean
          platform_percent?: number
          cashback_percent?: number
          coupon_expiry_days: number
          commission_percent?: number
          stock_quantity?: number | null
          sku?: string | null
          is_featured?: boolean
          images?: Json
          attributes?: Json
          short_description_he?: string | null
          brand?: string | null
          highlights?: Json
          video_url?: string | null
          barcode?: string | null
          low_stock_threshold?: number
          max_per_order?: number | null
          requires_shipping?: boolean
          weight_grams?: number | null
          length_cm?: number | null
          width_cm?: number | null
          height_cm?: number | null
          warranty_months?: number | null
          condition?: string | null
          coupon_terms_he?: string | null
          redemption_instructions_he?: string | null
          min_purchase_ils?: number | null
          seo_title?: string | null
          seo_description?: string | null
          seo_keywords?: string | null
          published_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['products']['Insert']>
        Relationships: [
          { foreignKeyName: 'products_supplier_id_fkey'; columns: ['supplier_id']; referencedRelation: 'suppliers'; referencedColumns: ['id'] },
          { foreignKeyName: 'products_category_id_fkey'; columns: ['category_id']; referencedRelation: 'categories'; referencedColumns: ['id'] },
          { foreignKeyName: 'products_created_by_fkey'; columns: ['created_by']; referencedRelation: 'users'; referencedColumns: ['id'] }
        ]
      }
      product_variants: {
        Row: {
          id: string
          product_id: string
          sku: string
          name_he: string
          price: number | null
          price_modifier: number
          stock_quantity: number | null
          attributes: Json
          is_active: boolean
          deleted_at: string | null
        }
        Insert: {
          id?: string
          product_id: string
          sku: string
          name_he: string
          price?: number | null
          price_modifier?: number
          stock_quantity?: number | null
          attributes?: Json
          is_active?: boolean
          deleted_at?: string | null
        }
        Update: {
          id?: string
          product_id?: string
          sku?: string
          name_he?: string
          price?: number | null
          price_modifier?: number
          stock_quantity?: number | null
          attributes?: Json
          is_active?: boolean
          deleted_at?: string | null
        }
        Relationships: [{ foreignKeyName: 'product_variants_product_id_fkey'; columns: ['product_id']; referencedRelation: 'products'; referencedColumns: ['id'] }]
      }
      media_assets: {
        Row: {
          id: string
          url: string
          alt_he: string
          blur_data_url: string | null
          width: number | null
          height: number | null
          renditions: Json
          provider: string
          bucket: string | null
          base_path: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          url: string
          alt_he: string
          blur_data_url?: string | null
          width?: number | null
          height?: number | null
          renditions?: Json
          provider?: string
          bucket?: string | null
          base_path?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['media_assets']['Insert']>
        Relationships: []
      }
      coupons: {
        Row: {
          id: string
          product_id: string
          code: string
          qr_data: string
          expiry_date: string | null
          redeemed_at: string | null
          redeemed_by_vendor_at: string | null
          customer_id: string | null
          status: 'active' | 'redeemed' | 'expired'
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          code: string
          qr_data: string
          expiry_date?: string | null
          redeemed_at?: string | null
          redeemed_by_vendor_at?: string | null
          customer_id?: string | null
          status?: 'active' | 'redeemed' | 'expired'
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          code?: string
          qr_data?: string
          expiry_date?: string | null
          redeemed_at?: string | null
          redeemed_by_vendor_at?: string | null
          customer_id?: string | null
          status?: 'active' | 'redeemed' | 'expired'
          created_by?: string | null
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: 'coupons_product_id_fkey'; columns: ['product_id']; referencedRelation: 'products'; referencedColumns: ['id'] },
          { foreignKeyName: 'coupons_customer_id_fkey'; columns: ['customer_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'coupons_created_by_fkey'; columns: ['created_by']; referencedRelation: 'users'; referencedColumns: ['id'] }
        ]
      }
      orders: {
        Row: {
          id: string
          user_id: string
          status: 'pending' | 'paid' | 'partially_fulfilled' | 'fulfilled' | 'cancelled' | 'refunded'
          subtotal_ils: number
          discount_ils: number
          cashback_applied_ils: number
          total_ils: number
          currency: string
          cardcom_payment_id: string | null
          invoice_number: string | null
          address_id: string | null
          affiliate_code: string | null
          referral_code_used: string | null
          accepted_terms_at: string | null
          notes: string | null
          paid_at: string | null
          cancelled_at: string | null
          refunded_at: string | null
          expires_at: string | null
          subtotal_agorot: number
          discount_agorot: number
          wallet_applied_agorot: number
          customer_pays_now_agorot: number
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          status?: 'pending' | 'paid' | 'partially_fulfilled' | 'fulfilled' | 'cancelled' | 'refunded'
          subtotal_ils: number
          discount_ils?: number
          cashback_applied_ils?: number
          total_ils: number
          currency?: string
          cardcom_payment_id?: string | null
          invoice_number?: string | null
          address_id?: string | null
          affiliate_code?: string | null
          referral_code_used?: string | null
          accepted_terms_at?: string | null
          notes?: string | null
          paid_at?: string | null
          cancelled_at?: string | null
          refunded_at?: string | null
          expires_at?: string | null
          subtotal_agorot: number
          discount_agorot?: number
          wallet_applied_agorot?: number
          customer_pays_now_agorot: number
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['orders']['Insert']>
        Relationships: [{ foreignKeyName: 'orders_user_id_fkey'; columns: ['user_id']; referencedRelation: 'users'; referencedColumns: ['id'] }]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string | null
          variant_id: string | null
          product_type: 'coupon' | 'physical' | 'service'
          supplier_id: string
          quantity: number
          unit_price_ils: number
          total_price_ils: number
          commission_percent: number
          supplier_payout_ils: number
          cashback_earned_ils: number
          item_status: 'pending' | 'issued' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
          platform_percent: number
          platform_fee_ils: number
          supplier_due_ils: number
          charged_on_site_ils: number
          balance_due_at_business_ils: number
          shipping_carrier: string | null
          tracking_number: string | null
          shipped_at: string | null
          delivered_at: string | null
          unit_price_agorot: number
          face_value_agorot: number
          customer_pays_now_agorot: number
          platform_fee_agorot: number
          supplier_due_agorot: number
          cashback_percent: number
          cashback_amount_agorot: number
          settlement_status: 'pending' | 'paid' | 'split_executed' | 'escrow_held' | 'escrow_released' | 'redeemed' | 'refunded' | 'cancelled'
          upfront_percent: number | null
          commission_percent_snapshot: number | null
          paid_on_site_agorot: number | null
          commission_agorot: number | null
          supplier_immediate_agorot: number | null
          escrow_held_agorot: number | null
          escrow_release_agorot: number | null
          balance_due_agorot: number | null
          fulfilled_at: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_id: string
          product_id?: string | null
          variant_id?: string | null
          product_type: 'coupon' | 'physical' | 'service'
          supplier_id: string
          quantity?: number
          unit_price_ils: number
          total_price_ils: number
          commission_percent: number
          supplier_payout_ils: number
          cashback_earned_ils?: number
          item_status?: 'pending' | 'issued' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
          platform_percent?: number
          platform_fee_ils?: number
          supplier_due_ils?: number
          charged_on_site_ils?: number
          balance_due_at_business_ils?: number
          shipping_carrier?: string | null
          tracking_number?: string | null
          shipped_at?: string | null
          delivered_at?: string | null
          unit_price_agorot: number
          face_value_agorot: number
          customer_pays_now_agorot: number
          platform_fee_agorot: number
          supplier_due_agorot: number
          cashback_percent: number
          cashback_amount_agorot: number
          settlement_status?: 'pending' | 'paid' | 'split_executed' | 'escrow_held' | 'escrow_released' | 'redeemed' | 'refunded' | 'cancelled'
          upfront_percent?: number | null
          commission_percent_snapshot?: number | null
          paid_on_site_agorot?: number | null
          commission_agorot?: number | null
          supplier_immediate_agorot?: number | null
          escrow_held_agorot?: number | null
          escrow_release_agorot?: number | null
          balance_due_agorot?: number | null
          fulfilled_at?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>
        Relationships: [
          { foreignKeyName: 'order_items_order_id_fkey'; columns: ['order_id']; referencedRelation: 'orders'; referencedColumns: ['id'] },
          { foreignKeyName: 'order_items_product_id_fkey'; columns: ['product_id']; referencedRelation: 'products'; referencedColumns: ['id'] },
          { foreignKeyName: 'order_items_variant_id_fkey'; columns: ['variant_id']; referencedRelation: 'product_variants'; referencedColumns: ['id'] },
          { foreignKeyName: 'order_items_supplier_id_fkey'; columns: ['supplier_id']; referencedRelation: 'suppliers'; referencedColumns: ['id'] }
        ]
      }
      wallets: {
        Row: {
          id: string
          profile_id: string
          balance: number
          lifetime_earned: number
          lifetime_spent: number
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          balance?: number
          lifetime_earned?: number
          lifetime_spent?: number
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['wallets']['Insert']>
        Relationships: [{ foreignKeyName: 'wallets_profile_id_fkey'; columns: ['profile_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] }]
      }
      wallet_transactions: {
        Row: {
          id: string
          wallet_id: string
          type: 'cashback_earned' | 'order_payment' | 'refund' | 'adjustment'
          amount: number
          related_order_id: string | null
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          wallet_id: string
          type: 'cashback_earned' | 'order_payment' | 'refund' | 'adjustment'
          amount: number
          related_order_id?: string | null
          description?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['wallet_transactions']['Insert']>
        Relationships: [{ foreignKeyName: 'wallet_transactions_wallet_id_fkey'; columns: ['wallet_id']; referencedRelation: 'wallets'; referencedColumns: ['id'] }]
      }
      payment_tokens: {
        Row: {
          id: string
          profile_id: string
          cardcom_token: string
          last_4: string
          card_brand: string
          expiry_month: number
          expiry_year: number
          is_default: boolean
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          cardcom_token: string
          last_4: string
          card_brand: string
          expiry_month: number
          expiry_year: number
          is_default?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['payment_tokens']['Insert']>
        Relationships: [{ foreignKeyName: 'payment_tokens_profile_id_fkey'; columns: ['profile_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] }]
      }
      carts: {
        Row: {
          id: string
          profile_id: string | null
          session_id: string | null
          items: Json
          expires_at: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          profile_id?: string | null
          session_id?: string | null
          items?: Json
          expires_at?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['carts']['Insert']>
        Relationships: [{ foreignKeyName: 'carts_profile_id_fkey'; columns: ['profile_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] }]
      }
      coupon_deals: {
        Row: {
          id: string
          vendor_id: string | null
          title_he: string
          business_name: string
          original_price: number
          platform_price: number
          discount_percentage: number
          terms_he: string | null
          valid_from: string
          valid_until: string | null
          max_uses: number | null
          max_uses_per_user: number
          location_he: string | null
          lat: number | null
          lng: number | null
          image_url: string | null
          status: 'draft' | 'active' | 'paused' | 'archived'
          created_by: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          vendor_id?: string | null
          title_he: string
          business_name: string
          original_price: number
          terms_he?: string | null
          valid_from?: string
          valid_until?: string | null
          max_uses?: number | null
          max_uses_per_user?: number
          location_he?: string | null
          lat?: number | null
          lng?: number | null
          image_url?: string | null
          status?: 'draft' | 'active' | 'paused' | 'archived'
          created_by?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          vendor_id?: string | null
          title_he?: string
          business_name?: string
          original_price?: number
          terms_he?: string | null
          valid_from?: string
          valid_until?: string | null
          max_uses?: number | null
          max_uses_per_user?: number
          location_he?: string | null
          lat?: number | null
          lng?: number | null
          image_url?: string | null
          status?: 'draft' | 'active' | 'paused' | 'archived'
          created_by?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'coupon_deals_vendor_id_fkey'; columns: ['vendor_id']; referencedRelation: 'vendors'; referencedColumns: ['id'] },
          { foreignKeyName: 'coupon_deals_created_by_fkey'; columns: ['created_by']; referencedRelation: 'users'; referencedColumns: ['id'] }
        ]
      }
      admin_audit_log: {
        Row: {
          id: string
          user_id: string | null
          action: string
          entity_type: string
          entity_id: string | null
          changes: Json | null
          ip: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          action: string
          entity_type: string
          entity_id?: string | null
          changes?: Json | null
          ip?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['admin_audit_log']['Insert']>
        Relationships: [{ foreignKeyName: 'admin_audit_log_user_id_fkey'; columns: ['user_id']; referencedRelation: 'users'; referencedColumns: ['id'] }]
      }
      suppliers: {
        Row: {
          id: string
          name: string
          contact_email: string | null
          contact_phone: string | null
          commission_percent: number
          notes: string | null
          legal_name: string | null
          business_id: string | null
          address: string | null
          city: string | null
          logo_url: string | null
          status: 'active' | 'suspended' | 'closed'
          payout_terms_days: number
          application_id: string | null
          approved_by: string | null
          approved_at: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          contact_email?: string | null
          contact_phone?: string | null
          commission_percent?: number
          notes?: string | null
          legal_name?: string | null
          business_id?: string | null
          address?: string | null
          city?: string | null
          logo_url?: string | null
          status?: 'active' | 'suspended' | 'closed'
          payout_terms_days?: number
          application_id?: string | null
          approved_by?: string | null
          approved_at?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['suppliers']['Insert']>
        Relationships: [
          { foreignKeyName: 'suppliers_application_id_fkey'; columns: ['application_id']; referencedRelation: 'supplier_applications'; referencedColumns: ['id'] },
          { foreignKeyName: 'suppliers_approved_by_fkey'; columns: ['approved_by']; referencedRelation: 'users'; referencedColumns: ['id'] }
        ]
      }
      coupon_codes: {
        Row: {
          id: string
          code: string
          qr_code_url: string | null
          product_id: string
          order_item_id: string
          user_id: string
          supplier_id: string
          status: 'issued' | 'used' | 'expired' | 'refunded'
          expires_at: string
          used_at: string | null
          used_by_supplier_user_id: string | null
          used_scan_method: 'camera' | 'manual' | null
          refunded_at: string | null
          platform_percent: number | null
          face_value_ils: number | null
          platform_paid_ils: number | null
          collect_amount_ils: number | null
          qr_token: string | null
          qr_key_id: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          code: string
          qr_code_url?: string | null
          product_id: string
          order_item_id: string
          user_id: string
          supplier_id: string
          status?: 'issued' | 'used' | 'expired' | 'refunded'
          expires_at: string
          used_at?: string | null
          used_by_supplier_user_id?: string | null
          used_scan_method?: 'camera' | 'manual' | null
          refunded_at?: string | null
          platform_percent?: number | null
          face_value_ils?: number | null
          platform_paid_ils?: number | null
          collect_amount_ils?: number | null
          qr_token?: string | null
          qr_key_id?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['coupon_codes']['Insert']>
        Relationships: [
          { foreignKeyName: 'coupon_codes_product_id_fkey'; columns: ['product_id']; referencedRelation: 'products'; referencedColumns: ['id'] },
          { foreignKeyName: 'coupon_codes_order_item_id_fkey'; columns: ['order_item_id']; referencedRelation: 'order_items'; referencedColumns: ['id'] },
          { foreignKeyName: 'coupon_codes_user_id_fkey'; columns: ['user_id']; referencedRelation: 'users'; referencedColumns: ['id'] },
          { foreignKeyName: 'coupon_codes_supplier_id_fkey'; columns: ['supplier_id']; referencedRelation: 'suppliers'; referencedColumns: ['id'] }
        ]
      }
      coupon_redemptions: {
        Row: {
          id: string
          coupon_code_id: string
          order_item_id: string | null
          supplier_id: string
          scanned_by: string
          method: 'camera' | 'manual'
          amount_collected_ils: number | null
          ip: string | null
          user_agent: string | null
          created_at: string
        }
        Insert: {
          id?: string
          coupon_code_id: string
          order_item_id?: string | null
          supplier_id: string
          scanned_by: string
          method: 'camera' | 'manual'
          amount_collected_ils?: number | null
          ip?: string | null
          user_agent?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['coupon_redemptions']['Insert']>
        Relationships: [
          { foreignKeyName: 'coupon_redemptions_coupon_code_id_fkey'; columns: ['coupon_code_id']; referencedRelation: 'coupon_codes'; referencedColumns: ['id'] },
          { foreignKeyName: 'coupon_redemptions_order_item_id_fkey'; columns: ['order_item_id']; referencedRelation: 'order_items'; referencedColumns: ['id'] },
          { foreignKeyName: 'coupon_redemptions_supplier_id_fkey'; columns: ['supplier_id']; referencedRelation: 'suppliers'; referencedColumns: ['id'] },
          { foreignKeyName: 'coupon_redemptions_scanned_by_fkey'; columns: ['scanned_by']; referencedRelation: 'users'; referencedColumns: ['id'] }
        ]
      }
      payments: {
        Row: {
          id: string
          order_id: string
          kind: 'charge' | 'token_charge' | 'refund'
          status: 'initiated' | 'redirected' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'
          amount_ils: number
          currency: string
          wallet_applied_ils: number
          token_id: string | null
          cardcom_low_profile_id: string | null
          cardcom_transaction_id: string | null
          refund_of_payment_id: string | null
          idempotency_key: string
          failure_code: string | null
          failure_message: string | null
          raw_response: Json
          succeeded_at: string | null
          failed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_id: string
          kind?: 'charge' | 'token_charge' | 'refund'
          status?: 'initiated' | 'redirected' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'
          amount_ils: number
          currency?: string
          wallet_applied_ils?: number
          token_id?: string | null
          cardcom_low_profile_id?: string | null
          cardcom_transaction_id?: string | null
          refund_of_payment_id?: string | null
          idempotency_key: string
          failure_code?: string | null
          failure_message?: string | null
          raw_response?: Json
          succeeded_at?: string | null
          failed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['payments']['Insert']>
        Relationships: [
          { foreignKeyName: 'payments_order_id_fkey'; columns: ['order_id']; referencedRelation: 'orders'; referencedColumns: ['id'] },
          { foreignKeyName: 'payments_token_id_fkey'; columns: ['token_id']; referencedRelation: 'payment_tokens'; referencedColumns: ['id'] },
          { foreignKeyName: 'payments_refund_of_payment_id_fkey'; columns: ['refund_of_payment_id']; referencedRelation: 'payments'; referencedColumns: ['id'] }
        ]
      }
      payment_webhook_events: {
        Row: {
          id: string
          provider: string
          external_event_id: string
          payment_id: string | null
          signature_valid: boolean
          verified_against_api: boolean
          payload: Json
          received_at: string
          processed_at: string | null
        }
        Insert: {
          id?: string
          provider?: string
          external_event_id: string
          payment_id?: string | null
          signature_valid: boolean
          verified_against_api?: boolean
          payload: Json
          received_at?: string
          processed_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['payment_webhook_events']['Insert']>
        Relationships: [{ foreignKeyName: 'payment_webhook_events_payment_id_fkey'; columns: ['payment_id']; referencedRelation: 'payments'; referencedColumns: ['id'] }]
      }
      cart_items: {
        Row: {
          id: string
          cart_id: string
          product_id: string
          variant_id: string | null
          quantity: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          cart_id: string
          product_id: string
          variant_id?: string | null
          quantity?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['cart_items']['Insert']>
        Relationships: [
          { foreignKeyName: 'cart_items_cart_id_fkey'; columns: ['cart_id']; referencedRelation: 'carts'; referencedColumns: ['id'] },
          { foreignKeyName: 'cart_items_product_id_fkey'; columns: ['product_id']; referencedRelation: 'products'; referencedColumns: ['id'] },
          { foreignKeyName: 'cart_items_variant_id_fkey'; columns: ['variant_id']; referencedRelation: 'product_variants'; referencedColumns: ['id'] }
        ]
      }
      escrow_holds: {
        Row: {
          id: string
          coupon_code_id: string
          order_id: string
          order_item_id: string
          supplier_id: string
          held_agorot: number
          commission_agorot: number
          release_agorot: number
          status: 'held' | 'released' | 'refunded'
          held_at: string
          released_at: string | null
          refunded_at: string | null
          release_idempotency_key: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          coupon_code_id: string
          order_id: string
          order_item_id: string
          supplier_id: string
          held_agorot: number
          commission_agorot: number
          release_agorot: number
          status?: 'held' | 'released' | 'refunded'
          held_at?: string
          released_at?: string | null
          refunded_at?: string | null
          release_idempotency_key?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['escrow_holds']['Insert']>
        Relationships: [
          { foreignKeyName: 'escrow_holds_coupon_code_id_fkey'; columns: ['coupon_code_id']; referencedRelation: 'coupon_codes'; referencedColumns: ['id'] },
          { foreignKeyName: 'escrow_holds_order_id_fkey'; columns: ['order_id']; referencedRelation: 'orders'; referencedColumns: ['id'] },
          { foreignKeyName: 'escrow_holds_order_item_id_fkey'; columns: ['order_item_id']; referencedRelation: 'order_items'; referencedColumns: ['id'] },
          { foreignKeyName: 'escrow_holds_supplier_id_fkey'; columns: ['supplier_id']; referencedRelation: 'suppliers'; referencedColumns: ['id'] }
        ]
      }
      split_executions: {
        Row: {
          id: string
          order_item_id: string
          order_id: string
          supplier_id: string
          face_value_agorot: number
          commission_agorot: number
          supplier_agorot: number
          executed_at: string
          payment_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_item_id: string
          order_id: string
          supplier_id: string
          face_value_agorot: number
          commission_agorot: number
          supplier_agorot: number
          executed_at?: string
          payment_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['split_executions']['Insert']>
        Relationships: [
          { foreignKeyName: 'split_executions_order_item_id_fkey'; columns: ['order_item_id']; referencedRelation: 'order_items'; referencedColumns: ['id'] },
          { foreignKeyName: 'split_executions_order_id_fkey'; columns: ['order_id']; referencedRelation: 'orders'; referencedColumns: ['id'] },
          { foreignKeyName: 'split_executions_supplier_id_fkey'; columns: ['supplier_id']; referencedRelation: 'suppliers'; referencedColumns: ['id'] },
          { foreignKeyName: 'split_executions_payment_id_fkey'; columns: ['payment_id']; referencedRelation: 'payments'; referencedColumns: ['id'] }
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean }
      current_user_role: { Args: Record<string, never>; Returns: 'customer' | 'vendor' | 'content_uploader' | 'admin' | 'super_admin' }
      has_role: { Args: { required_role: string }; Returns: boolean }
      check_rate_limit: { Args: { p_key: string; p_max_attempts?: number; p_window_seconds?: number }; Returns: boolean }
      check_user_rate_limit: { Args: { p_user_id: string; p_action: string; p_limit?: number; p_window_seconds?: number }; Returns: boolean }
    }
    Enums: {
      user_role: 'customer' | 'vendor' | 'content_uploader' | 'admin' | 'super_admin'
      vendor_status: 'pending' | 'active' | 'suspended'
      supplier_status: 'active' | 'suspended' | 'closed'
      product_type: 'coupon' | 'physical' | 'service'
      product_status: 'draft' | 'active' | 'paused' | 'sold_out' | 'archived'
      coupon_status: 'issued' | 'used' | 'expired' | 'refunded'
      order_status: 'pending' | 'paid' | 'partially_fulfilled' | 'fulfilled' | 'cancelled' | 'refunded'
      order_item_status: 'pending' | 'issued' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
      payment_kind: 'charge' | 'token_charge' | 'refund'
      payment_status: 'initiated' | 'redirected' | 'succeeded' | 'failed' | 'cancelled' | 'refunded'
      settlement_status: 'pending' | 'paid' | 'split_executed' | 'escrow_held' | 'escrow_released' | 'redeemed' | 'refunded' | 'cancelled'
      escrow_status: 'held' | 'released' | 'refunded'
      wallet_tx_type: 'cashback_earned' | 'order_payment' | 'refund' | 'adjustment'
    }
    CompositeTypes: Record<string, never>
  }
}

// Convenience type aliases
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
export type Enums<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]

// Row shorthands
export type Profile = Tables<'profiles'>
export type Vendor = Tables<'vendors'>
export type Category = Tables<'categories'>
export type Product = Tables<'products'>
export type ProductVariant = Tables<'product_variants'>
export type Coupon = Tables<'coupons'>
export type Order = Tables<'orders'>
export type OrderItem = Tables<'order_items'>
export type Wallet = Tables<'wallets'>
export type WalletTransaction = Tables<'wallet_transactions'>
export type PaymentToken = Tables<'payment_tokens'>
export type Cart = Tables<'carts'>
export type AdminAuditLog = Tables<'admin_audit_log'>
export type CouponDeal = Tables<'coupon_deals'>
export type Supplier = Tables<'suppliers'>
export type CouponCode = Tables<'coupon_codes'>
export type CouponRedemption = Tables<'coupon_redemptions'>
export type Payment = Tables<'payments'>
export type PaymentWebhookEvent = Tables<'payment_webhook_events'>
export type CartItemRow = Tables<'cart_items'>
export type EscrowHold = Tables<'escrow_holds'>
export type SplitExecution = Tables<'split_executions'>

export type UserRole = Enums<'user_role'>
export type OrderStatus = Enums<'order_status'>
export type OrderItemStatus = Enums<'order_item_status'>
export type SettlementStatus = Enums<'settlement_status'>
export type EscrowStatus = Enums<'escrow_status'>
export type PaymentKind = Enums<'payment_kind'>
export type PaymentStatus = Enums<'payment_status'>
export type CouponStatus = Enums<'coupon_status'>
export type SupplierStatus = Enums<'supplier_status'>
