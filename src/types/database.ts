export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      affiliates: {
        Row: {
          affiliate_code: string
          approved_at: string | null
          approved_by: string | null
          channel_description: string | null
          channel_urls: Json
          created_at: string
          deleted_at: string | null
          id: string
          payout_details: Json
          payout_method: string | null
          status: Database["public"]["Enums"]["affiliate_status"]
          total_clicks: number
          total_conversions: number
          total_earnings_ils: number
          updated_at: string
          user_id: string
        }
        Insert: {
          affiliate_code: string
          approved_at?: string | null
          approved_by?: string | null
          channel_description?: string | null
          channel_urls?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          payout_details?: Json
          payout_method?: string | null
          status?: Database["public"]["Enums"]["affiliate_status"]
          total_clicks?: number
          total_conversions?: number
          total_earnings_ils?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          affiliate_code?: string
          approved_at?: string | null
          approved_by?: string | null
          channel_description?: string | null
          channel_urls?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          payout_details?: Json
          payout_method?: string | null
          status?: Database["public"]["Enums"]["affiliate_status"]
          total_clicks?: number
          total_conversions?: number
          total_earnings_ils?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id: string | null
          actor_role: string | null
          changes: Json
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          ip_address: unknown
          metadata: Json
          user_agent: string | null
        }
        Insert: {
          action: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          actor_role?: string | null
          changes?: Json
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          user_agent?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["audit_action"]
          actor_id?: string | null
          actor_role?: string | null
          changes?: Json
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          user_agent?: string | null
        }
        Relationships: []
      }
      carts: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          items: Json
          profile_id: string | null
          session_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          items?: Json
          profile_id?: string | null
          session_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          items?: Json
          profile_id?: string | null
          session_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          created_by: string | null
          description_he: string | null
          icon_url: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name_en: string
          name_he: string
          parent_id: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description_he?: string | null
          icon_url?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name_en?: string
          name_he: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description_he?: string | null
          icon_url?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name_en?: string
          name_he?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_codes: {
        Row: {
          code: string
          collect_amount_ils: number
          created_at: string
          expires_at: string
          face_value_ils: number
          id: string
          order_item_id: string | null
          platform_paid_ils: number
          platform_percent: number | null
          product_id: string | null
          qr_token: string
          redeemed_at: string | null
          status: Database["public"]["Enums"]["coupon_status"]
          supplier_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          code: string
          collect_amount_ils?: number
          created_at?: string
          expires_at: string
          face_value_ils?: number
          id?: string
          order_item_id?: string | null
          platform_paid_ils?: number
          platform_percent?: number | null
          product_id?: string | null
          qr_token: string
          redeemed_at?: string | null
          status?: Database["public"]["Enums"]["coupon_status"]
          supplier_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          code?: string
          collect_amount_ils?: number
          created_at?: string
          expires_at?: string
          face_value_ils?: number
          id?: string
          order_item_id?: string | null
          platform_paid_ils?: number
          platform_percent?: number | null
          product_id?: string | null
          qr_token?: string
          redeemed_at?: string | null
          status?: Database["public"]["Enums"]["coupon_status"]
          supplier_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_codes_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_codes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_codes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_deals: {
        Row: {
          business_name: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          discount_percentage: number | null
          id: string
          image_url: string | null
          lat: number | null
          lng: number | null
          location_he: string | null
          max_uses: number | null
          max_uses_per_user: number
          original_price: number
          platform_price: number | null
          status: string
          terms_he: string | null
          title_he: string
          updated_at: string
          valid_from: string
          valid_until: string | null
          vendor_id: string | null
        }
        Insert: {
          business_name: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          discount_percentage?: number | null
          id?: string
          image_url?: string | null
          lat?: number | null
          lng?: number | null
          location_he?: string | null
          max_uses?: number | null
          max_uses_per_user?: number
          original_price: number
          platform_price?: number | null
          status?: string
          terms_he?: string | null
          title_he: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
          vendor_id?: string | null
        }
        Update: {
          business_name?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          discount_percentage?: number | null
          id?: string
          image_url?: string | null
          lat?: number | null
          lng?: number | null
          location_he?: string | null
          max_uses?: number | null
          max_uses_per_user?: number
          original_price?: number
          platform_price?: number | null
          status?: string
          terms_he?: string | null
          title_he?: string
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_deals_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          description: string | null
          discount_type: string | null
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean | null
          max_uses: number | null
          min_purchase: number | null
          original_price: number | null
          product_id: string | null
          title: string
          used_count: number | null
          vendor_id: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_type?: string | null
          discount_value: number
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_purchase?: number | null
          original_price?: number | null
          product_id?: string | null
          title: string
          used_count?: number | null
          vendor_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          discount_type?: string | null
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          min_purchase?: number | null
          original_price?: number | null
          product_id?: string | null
          title?: string
          used_count?: number | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      escrow_holds: {
        Row: {
          commission_agorot: number
          coupon_code_id: string
          created_at: string
          held_agorot: number
          held_at: string
          id: string
          order_id: string
          order_item_id: string
          refunded_at: string | null
          release_agorot: number
          release_idempotency_key: string | null
          released_at: string | null
          status: Database["public"]["Enums"]["escrow_status"]
          supplier_id: string
          updated_at: string
        }
        Insert: {
          commission_agorot: number
          coupon_code_id: string
          created_at?: string
          held_agorot: number
          held_at?: string
          id?: string
          order_id: string
          order_item_id: string
          refunded_at?: string | null
          release_agorot: number
          release_idempotency_key?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["escrow_status"]
          supplier_id: string
          updated_at?: string
        }
        Update: {
          commission_agorot?: number
          coupon_code_id?: string
          created_at?: string
          held_agorot?: number
          held_at?: string
          id?: string
          order_id?: string
          order_item_id?: string
          refunded_at?: string | null
          release_agorot?: number
          release_idempotency_key?: string | null
          released_at?: string | null
          status?: Database["public"]["Enums"]["escrow_status"]
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "escrow_holds_coupon_code_id_fkey"
            columns: ["coupon_code_id"]
            isOneToOne: true
            referencedRelation: "coupon_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_holds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_holds_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escrow_holds_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          balance_due_agorot: number | null
          cashback_amount_agorot: number | null
          cashback_earned_ils: number
          cashback_percent: number | null
          commission_agorot: number | null
          commission_percent: number
          commission_percent_snapshot: number | null
          created_at: string
          deleted_at: string | null
          escrow_held_agorot: number | null
          escrow_release_agorot: number | null
          face_value_agorot: number | null
          fulfilled_at: string | null
          id: string
          item_status: Database["public"]["Enums"]["order_item_status"]
          order_id: string
          paid_on_site_agorot: number | null
          platform_percent: number | null
          product_id: string | null
          product_type: Database["public"]["Enums"]["product_type"]
          quantity: number
          settlement_status: Database["public"]["Enums"]["settlement_status"]
          supplier_id: string | null
          supplier_immediate_agorot: number | null
          supplier_payout_ils: number
          total_price_ils: number
          unit_price_ils: number
          updated_at: string
          upfront_percent: number | null
          variant_id: string | null
        }
        Insert: {
          balance_due_agorot?: number | null
          cashback_amount_agorot?: number | null
          cashback_earned_ils?: number
          cashback_percent?: number | null
          commission_agorot?: number | null
          commission_percent: number
          commission_percent_snapshot?: number | null
          created_at?: string
          deleted_at?: string | null
          escrow_held_agorot?: number | null
          escrow_release_agorot?: number | null
          face_value_agorot?: number | null
          fulfilled_at?: string | null
          id?: string
          item_status?: Database["public"]["Enums"]["order_item_status"]
          order_id: string
          paid_on_site_agorot?: number | null
          platform_percent?: number | null
          product_id?: string | null
          product_type: Database["public"]["Enums"]["product_type"]
          quantity?: number
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
          supplier_id?: string | null
          supplier_immediate_agorot?: number | null
          supplier_payout_ils: number
          total_price_ils: number
          unit_price_ils: number
          updated_at?: string
          upfront_percent?: number | null
          variant_id?: string | null
        }
        Update: {
          balance_due_agorot?: number | null
          cashback_amount_agorot?: number | null
          cashback_earned_ils?: number
          cashback_percent?: number | null
          commission_agorot?: number | null
          commission_percent?: number
          commission_percent_snapshot?: number | null
          created_at?: string
          deleted_at?: string | null
          escrow_held_agorot?: number | null
          escrow_release_agorot?: number | null
          face_value_agorot?: number | null
          fulfilled_at?: string | null
          id?: string
          item_status?: Database["public"]["Enums"]["order_item_status"]
          order_id?: string
          paid_on_site_agorot?: number | null
          platform_percent?: number | null
          product_id?: string | null
          product_type?: Database["public"]["Enums"]["product_type"]
          quantity?: number
          settlement_status?: Database["public"]["Enums"]["settlement_status"]
          supplier_id?: string | null
          supplier_immediate_agorot?: number | null
          supplier_payout_ils?: number
          total_price_ils?: number
          unit_price_ils?: number
          updated_at?: string
          upfront_percent?: number | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          accepted_terms_at: string | null
          address_id: string | null
          affiliate_code: string | null
          cardcom_payment_id: string | null
          cashback_applied_ils: number
          created_at: string
          currency: string
          deleted_at: string | null
          discount_ils: number
          expires_at: string | null
          id: string
          invoice_number: string | null
          notes: string | null
          paid_at: string | null
          referral_code_used: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal_ils: number
          total_ils: number
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_terms_at?: string | null
          address_id?: string | null
          affiliate_code?: string | null
          cardcom_payment_id?: string | null
          cashback_applied_ils?: number
          created_at?: string
          currency?: string
          deleted_at?: string | null
          discount_ils?: number
          expires_at?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          paid_at?: string | null
          referral_code_used?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_ils: number
          total_ils: number
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_terms_at?: string | null
          address_id?: string | null
          affiliate_code?: string | null
          cardcom_payment_id?: string | null
          cashback_applied_ils?: number
          created_at?: string
          currency?: string
          deleted_at?: string | null
          discount_ils?: number
          expires_at?: string | null
          id?: string
          invoice_number?: string | null
          notes?: string | null
          paid_at?: string | null
          referral_code_used?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal_ils?: number
          total_ils?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "user_addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_tokens: {
        Row: {
          card_brand: string | null
          cardcom_token: string
          created_at: string
          expiry_month: number | null
          expiry_year: number | null
          id: string
          is_default: boolean
          last_4: string | null
          profile_id: string
        }
        Insert: {
          card_brand?: string | null
          cardcom_token: string
          created_at?: string
          expiry_month?: number | null
          expiry_year?: number | null
          id?: string
          is_default?: boolean
          last_4?: string | null
          profile_id: string
        }
        Update: {
          card_brand?: string | null
          cardcom_token?: string
          created_at?: string
          expiry_month?: number | null
          expiry_year?: number | null
          id?: string
          is_default?: boolean
          last_4?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_tokens_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhook_events: {
        Row: {
          created_at: string
          external_event_id: string
          id: string
          payload: Json | null
          payment_id: string | null
          processed_at: string | null
          provider: string
          signature_valid: boolean
          verified_against_api: boolean
        }
        Insert: {
          created_at?: string
          external_event_id: string
          id?: string
          payload?: Json | null
          payment_id?: string | null
          processed_at?: string | null
          provider: string
          signature_valid?: boolean
          verified_against_api?: boolean
        }
        Update: {
          created_at?: string
          external_event_id?: string
          id?: string
          payload?: Json | null
          payment_id?: string | null
          processed_at?: string | null
          provider?: string
          signature_valid?: boolean
          verified_against_api?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payment_webhook_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_ils: number
          cardcom_low_profile_id: string | null
          cardcom_transaction_id: string | null
          created_at: string
          currency: string
          failed_at: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          idempotency_key: string | null
          kind: Database["public"]["Enums"]["payment_kind"]
          order_id: string
          raw_response: Json | null
          status: Database["public"]["Enums"]["payment_status"]
          succeeded_at: string | null
          updated_at: string
          wallet_applied_ils: number
        }
        Insert: {
          amount_ils: number
          cardcom_low_profile_id?: string | null
          cardcom_transaction_id?: string | null
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: Database["public"]["Enums"]["payment_kind"]
          order_id: string
          raw_response?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          succeeded_at?: string | null
          updated_at?: string
          wallet_applied_ils?: number
        }
        Update: {
          amount_ils?: number
          cardcom_low_profile_id?: string | null
          cardcom_transaction_id?: string | null
          created_at?: string
          currency?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: Database["public"]["Enums"]["payment_kind"]
          order_id?: string
          raw_response?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          succeeded_at?: string | null
          updated_at?: string
          wallet_applied_ils?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_he: string | null
          created_at: string
          id: string
          product_id: string
          sort_order: number
          url: string
          variant_id: string | null
        }
        Insert: {
          alt_he?: string | null
          created_at?: string
          id?: string
          product_id: string
          sort_order?: number
          url: string
          variant_id?: string | null
        }
        Update: {
          alt_he?: string | null
          created_at?: string
          id?: string
          product_id?: string
          sort_order?: number
          url?: string
          variant_id?: string | null
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          attributes: Json
          created_at: string
          deleted_at: string | null
          id: string
          is_active: boolean
          name_he: string
          price: number | null
          price_ils: number | null
          price_modifier: number
          product_id: string
          sku: string | null
          sort_order: number
          stock_quantity: number | null
          updated_at: string
        }
        Insert: {
          attributes?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name_he: string
          price?: number | null
          price_ils?: number | null
          price_modifier?: number
          product_id: string
          sku?: string | null
          sort_order?: number
          stock_quantity?: number | null
          updated_at?: string
        }
        Update: {
          attributes?: Json
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_active?: boolean
          name_he?: string
          price?: number | null
          price_ils?: number | null
          price_modifier?: number
          product_id?: string
          sku?: string | null
          sort_order?: number
          stock_quantity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          approval_note: string | null
          approval_status: Database["public"]["Enums"]["product_approval_status"]
          approved_at: string | null
          approved_by: string | null
          attributes: Json
          barcode: string | null
          brand: string | null
          cashback_percent: number
          category_id: string | null
          commission_percent: number
          compare_at_price: number | null
          compare_at_price_ils: number | null
          condition: string | null
          cost_ils: number | null
          coupon_expiry_days: number | null
          coupon_terms_he: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description_he: string | null
          full_price: number | null
          height_cm: number | null
          highlights: Json
          id: string
          images: Json
          is_coupon_enabled: boolean
          is_featured: boolean
          kenyon_price: number | null
          length_cm: number | null
          low_stock_threshold: number
          max_per_order: number | null
          min_purchase_ils: number | null
          name_en: string | null
          name_he: string
          platform_percent: number | null
          price_ils: number
          published_at: string | null
          redemption_instructions_he: string | null
          requires_shipping: boolean
          seo_description: string | null
          seo_keywords: string | null
          seo_title: string | null
          short_description_he: string | null
          sku: string | null
          slug: string
          status: Database["public"]["Enums"]["product_status"]
          stock_quantity: number | null
          submitted_at: string | null
          supplier_id: string | null
          type: Database["public"]["Enums"]["product_type"]
          updated_at: string
          video_url: string | null
          warranty_months: number | null
          weight_grams: number | null
          width_cm: number | null
        }
        Insert: {
          approval_note?: string | null
          approval_status?: Database["public"]["Enums"]["product_approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          attributes?: Json
          barcode?: string | null
          brand?: string | null
          cashback_percent?: number
          category_id?: string | null
          commission_percent?: number
          compare_at_price?: number | null
          compare_at_price_ils?: number | null
          condition?: string | null
          cost_ils?: number | null
          coupon_expiry_days?: number | null
          coupon_terms_he?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description_he?: string | null
          full_price?: number | null
          height_cm?: number | null
          highlights?: Json
          id?: string
          images?: Json
          is_coupon_enabled?: boolean
          is_featured?: boolean
          kenyon_price?: number | null
          length_cm?: number | null
          low_stock_threshold?: number
          max_per_order?: number | null
          min_purchase_ils?: number | null
          name_en?: string | null
          name_he: string
          platform_percent?: number | null
          price_ils: number
          published_at?: string | null
          redemption_instructions_he?: string | null
          requires_shipping?: boolean
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          short_description_he?: string | null
          sku?: string | null
          slug: string
          status?: Database["public"]["Enums"]["product_status"]
          stock_quantity?: number | null
          submitted_at?: string | null
          supplier_id?: string | null
          type: Database["public"]["Enums"]["product_type"]
          updated_at?: string
          video_url?: string | null
          warranty_months?: number | null
          weight_grams?: number | null
          width_cm?: number | null
        }
        Update: {
          approval_note?: string | null
          approval_status?: Database["public"]["Enums"]["product_approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          attributes?: Json
          barcode?: string | null
          brand?: string | null
          cashback_percent?: number
          category_id?: string | null
          commission_percent?: number
          compare_at_price?: number | null
          compare_at_price_ils?: number | null
          condition?: string | null
          cost_ils?: number | null
          coupon_expiry_days?: number | null
          coupon_terms_he?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description_he?: string | null
          full_price?: number | null
          height_cm?: number | null
          highlights?: Json
          id?: string
          images?: Json
          is_coupon_enabled?: boolean
          is_featured?: boolean
          kenyon_price?: number | null
          length_cm?: number | null
          low_stock_threshold?: number
          max_per_order?: number | null
          min_purchase_ils?: number | null
          name_en?: string | null
          name_he?: string
          platform_percent?: number | null
          price_ils?: number
          published_at?: string | null
          redemption_instructions_he?: string | null
          requires_shipping?: boolean
          seo_description?: string | null
          seo_keywords?: string | null
          seo_title?: string | null
          short_description_he?: string | null
          sku?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["product_status"]
          stock_quantity?: number | null
          submitted_at?: string | null
          supplier_id?: string | null
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
          video_url?: string | null
          warranty_months?: number | null
          weight_grams?: number | null
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          affiliate_code: string | null
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          total_purchases: number | null
          updated_at: string | null
          wallet_balance: number | null
        }
        Insert: {
          affiliate_code?: string | null
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          total_purchases?: number | null
          updated_at?: string | null
          wallet_balance?: number | null
        }
        Update: {
          affiliate_code?: string | null
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          total_purchases?: number | null
          updated_at?: string | null
          wallet_balance?: number | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          attempts: number
          id: string
          key: string
          window_start: string
        }
        Insert: {
          attempts?: number
          id?: string
          key: string
          window_start?: string
        }
        Update: {
          attempts?: number
          id?: string
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          bonus_paid_amount_ils: number
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          id: string
          referral_code: string
          referred_first_order_id: string | null
          referred_user_id: string
          referrer_user_id: string
          rejection_reason: string | null
          status: Database["public"]["Enums"]["referral_status"]
          updated_at: string
        }
        Insert: {
          bonus_paid_amount_ils?: number
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          referral_code: string
          referred_first_order_id?: string | null
          referred_user_id: string
          referrer_user_id: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["referral_status"]
          updated_at?: string
        }
        Update: {
          bonus_paid_amount_ils?: number
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          referral_code?: string
          referred_first_order_id?: string | null
          referred_user_id?: string
          referrer_user_id?: string
          rejection_reason?: string | null
          status?: Database["public"]["Enums"]["referral_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_first_order_id_fkey"
            columns: ["referred_first_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      split_executions: {
        Row: {
          commission_agorot: number
          created_at: string
          executed_at: string
          face_value_agorot: number
          id: string
          order_id: string
          order_item_id: string
          payment_id: string | null
          supplier_agorot: number
          supplier_id: string
          updated_at: string
        }
        Insert: {
          commission_agorot: number
          created_at?: string
          executed_at?: string
          face_value_agorot: number
          id?: string
          order_id: string
          order_item_id: string
          payment_id?: string | null
          supplier_agorot: number
          supplier_id: string
          updated_at?: string
        }
        Update: {
          commission_agorot?: number
          created_at?: string
          executed_at?: string
          face_value_agorot?: number
          id?: string
          order_id?: string
          order_item_id?: string
          payment_id?: string | null
          supplier_agorot?: number
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "split_executions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_executions_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: true
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_executions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "split_executions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          commission_percent: number
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          commission_percent?: number
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          commission_percent?: number
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_addresses: {
        Row: {
          apartment: string | null
          city: string
          created_at: string
          deleted_at: string | null
          entrance: string | null
          floor: string | null
          full_name: string
          id: string
          is_default: boolean
          notes_for_courier: string | null
          phone: string
          street: string
          street_number: string | null
          updated_at: string
          user_id: string
          zip: string | null
        }
        Insert: {
          apartment?: string | null
          city: string
          created_at?: string
          deleted_at?: string | null
          entrance?: string | null
          floor?: string | null
          full_name: string
          id?: string
          is_default?: boolean
          notes_for_courier?: string | null
          phone: string
          street: string
          street_number?: string | null
          updated_at?: string
          user_id: string
          zip?: string | null
        }
        Update: {
          apartment?: string | null
          city?: string
          created_at?: string
          deleted_at?: string | null
          entrance?: string | null
          floor?: string | null
          full_name?: string
          id?: string
          is_default?: boolean
          notes_for_courier?: string | null
          phone?: string
          street?: string
          street_number?: string | null
          updated_at?: string
          user_id?: string
          zip?: string | null
        }
        Relationships: []
      }
      user_rate_limits: {
        Row: {
          action: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_account_holder: string | null
          bank_branch: string | null
          bank_name: string | null
          business_id: string | null
          business_logo: string | null
          business_name: string
          commission_rate: number | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string | null
          deleted_at: string | null
          description: string | null
          id: string
          is_verified: boolean | null
          legal_name: string | null
          logo_url: string | null
          profile_id: string | null
          status: string
          tax_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_account_holder?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          business_id?: string | null
          business_logo?: string | null
          business_name: string
          commission_rate?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_verified?: boolean | null
          legal_name?: string | null
          logo_url?: string | null
          profile_id?: string | null
          status?: string
          tax_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_account_holder?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          business_id?: string | null
          business_logo?: string | null
          business_name?: string
          commission_rate?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_verified?: boolean | null
          legal_name?: string | null
          logo_url?: string | null
          profile_id?: string | null
          status?: string
          tax_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_accounts: {
        Row: {
          balance_ils: number
          code: string | null
          created_at: string
          id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          balance_ils?: number
          code?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          balance_ils?: number
          code?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_balances: {
        Row: {
          balance_ils: number
          created_at: string
          deleted_at: string | null
          id: string
          lifetime_earned_ils: number
          lifetime_redeemed_ils: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_ils?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          lifetime_earned_ils?: number
          lifetime_redeemed_ils?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_ils?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          lifetime_earned_ils?: number
          lifetime_redeemed_ils?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_entries: {
        Row: {
          amount_ils: number
          created_at: string
          credit_account: string
          debit_account: string
          id: string
          idempotency_key: string
          order_id: string | null
          reason: string
        }
        Insert: {
          amount_ils: number
          created_at?: string
          credit_account: string
          debit_account: string
          id?: string
          idempotency_key: string
          order_id?: string | null
          reason: string
        }
        Update: {
          amount_ils?: number
          created_at?: string
          credit_account?: string
          debit_account?: string
          id?: string
          idempotency_key?: string
          order_id?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_entries_credit_account_fkey"
            columns: ["credit_account"]
            isOneToOne: false
            referencedRelation: "wallet_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_entries_debit_account_fkey"
            columns: ["debit_account"]
            isOneToOne: false
            referencedRelation: "wallet_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount_ils: number
          cashback_percent: number | null
          created_at: string
          deleted_at: string | null
          gross_amount_ils: number | null
          id: string
          notes: string | null
          profit_share_cap_percent: number | null
          related_order_id: string | null
          source: Database["public"]["Enums"]["wallet_tx_source"] | null
          type: Database["public"]["Enums"]["wallet_tx_type"]
          updated_at: string
          user_id: string
          wallet_id: string
        }
        Insert: {
          amount_ils: number
          cashback_percent?: number | null
          created_at?: string
          deleted_at?: string | null
          gross_amount_ils?: number | null
          id?: string
          notes?: string | null
          profit_share_cap_percent?: number | null
          related_order_id?: string | null
          source?: Database["public"]["Enums"]["wallet_tx_source"] | null
          type: Database["public"]["Enums"]["wallet_tx_type"]
          updated_at?: string
          user_id: string
          wallet_id: string
        }
        Update: {
          amount_ils?: number
          cashback_percent?: number | null
          created_at?: string
          deleted_at?: string | null
          gross_amount_ils?: number | null
          id?: string
          notes?: string | null
          profit_share_cap_percent?: number | null
          related_order_id?: string | null
          source?: Database["public"]["Enums"]["wallet_tx_source"] | null
          type?: Database["public"]["Enums"]["wallet_tx_type"]
          updated_at?: string
          user_id?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_related_order_id_fkey"
            columns: ["related_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "wallet_balances"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_admin_pending_queues: {
        Row: {
          n: number | null
          oldest_at: string | null
          queue: string | null
          sla: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      check_rate_limit: {
        Args: {
          p_key: string
          p_max_attempts?: number
          p_window_seconds?: number
        }
        Returns: boolean
      }
      check_user_rate_limit: {
        Args: {
          p_action: string
          p_limit?: number
          p_user_id: string
          p_window_seconds?: number
        }
        Returns: boolean
      }
      cleanup_rate_limits: { Args: never; Returns: undefined }
      cleanup_user_rate_limits: { Args: never; Returns: undefined }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      fn_wallet_transfer: {
        Args: {
          p_amount_ils: number
          p_credit_account: string
          p_debit_account: string
          p_idempotency: string
          p_order_id?: string
          p_reason: string
        }
        Returns: string
      }
      has_role: { Args: { required_role: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_supplier_member: { Args: { p_supplier_id: string }; Returns: boolean }
      is_support: { Args: never; Returns: boolean }
    }
    Enums: {
      affiliate_status: "pending_review" | "approved" | "rejected" | "suspended"
      audit_action:
        | "created"
        | "updated"
        | "deleted"
        | "restored"
        | "login"
        | "logout"
        | "permission_change"
        | "status_change"
        | "manual_override"
      coupon_status: "issued" | "used" | "expired" | "refunded"
      escrow_status: "held" | "released" | "refunded"
      order_item_status:
        | "pending"
        | "issued"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "refunded"
      order_status:
        | "pending"
        | "paid"
        | "partially_fulfilled"
        | "fulfilled"
        | "cancelled"
        | "refunded"
      payment_kind: "charge" | "refund"
      payment_status:
        | "initiated"
        | "redirected"
        | "succeeded"
        | "failed"
        | "refunded"
      product_approval_status: "draft" | "pending" | "approved" | "rejected"
      product_status: "draft" | "active" | "paused" | "sold_out" | "archived"
      product_type: "coupon" | "physical" | "service"
      referral_status: "pending" | "completed" | "rejected"
      settlement_status:
        | "pending"
        | "paid"
        | "split_executed"
        | "escrow_held"
        | "escrow_released"
        | "redeemed"
        | "refunded"
        | "cancelled"
      user_role:
        | "customer"
        | "content_uploader"
        | "vendor"
        | "admin"
        | "super_admin"
        | "support"
      wallet_tx_source: "cashback" | "referral" | "manual"
      wallet_tx_type: "earn" | "redeem" | "expire" | "refund"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      affiliate_status: ["pending_review", "approved", "rejected", "suspended"],
      audit_action: [
        "created",
        "updated",
        "deleted",
        "restored",
        "login",
        "logout",
        "permission_change",
        "status_change",
        "manual_override",
      ],
      coupon_status: ["issued", "used", "expired", "refunded"],
      escrow_status: ["held", "released", "refunded"],
      order_item_status: [
        "pending",
        "issued",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      order_status: [
        "pending",
        "paid",
        "partially_fulfilled",
        "fulfilled",
        "cancelled",
        "refunded",
      ],
      payment_kind: ["charge", "refund"],
      payment_status: [
        "initiated",
        "redirected",
        "succeeded",
        "failed",
        "refunded",
      ],
      product_approval_status: ["draft", "pending", "approved", "rejected"],
      product_status: ["draft", "active", "paused", "sold_out", "archived"],
      product_type: ["coupon", "physical", "service"],
      referral_status: ["pending", "completed", "rejected"],
      settlement_status: [
        "pending",
        "paid",
        "split_executed",
        "escrow_held",
        "escrow_released",
        "redeemed",
        "refunded",
        "cancelled",
      ],
      user_role: [
        "customer",
        "content_uploader",
        "vendor",
        "admin",
        "super_admin",
        "support",
      ],
      wallet_tx_source: ["cashback", "referral", "manual"],
      wallet_tx_type: ["earn", "redeem", "expire", "refund"],
    },
  },
} as const

// Row shorthands (the generic Tables/TablesInsert/TablesUpdate/Enums helpers
// are emitted by the Supabase codegen above; Tables<> also covers views)
export type Profile = Tables<'profiles'>
export type Vendor = Tables<'vendors'>
export type Category = Tables<'categories'>
export type Product = Tables<'products'>
export type ProductVariant = Tables<'product_variants'>
export type ProductImage = Tables<'product_images'>
export type Coupon = Tables<'coupons'>
export type Order = Tables<'orders'>
export type OrderItem = Tables<'order_items'>
export type WalletBalance = Tables<'wallet_balances'>
export type WalletTransaction = Tables<'wallet_transactions'>
export type WalletAccount = Tables<'wallet_accounts'>
export type WalletEntry = Tables<'wallet_entries'>
export type PaymentToken = Tables<'payment_tokens'>
export type Cart = Tables<'carts'>
export type CouponDeal = Tables<'coupon_deals'>
export type Supplier = Tables<'suppliers'>
export type CouponCode = Tables<'coupon_codes'>
export type Payment = Tables<'payments'>
export type PaymentWebhookEvent = Tables<'payment_webhook_events'>
export type EscrowHold = Tables<'escrow_holds'>
export type SplitExecution = Tables<'split_executions'>
export type AuditLog = Tables<'audit_log'>
export type Affiliate = Tables<'affiliates'>
export type Referral = Tables<'referrals'>
export type UserAddress = Tables<'user_addresses'>
export type AdminPendingQueue = Tables<'v_admin_pending_queues'>

export type UserRole = Enums<'user_role'>
export type OrderStatus = Enums<'order_status'>
export type OrderItemStatus = Enums<'order_item_status'>
export type SettlementStatus = Enums<'settlement_status'>
export type EscrowStatus = Enums<'escrow_status'>
export type PaymentKind = Enums<'payment_kind'>
export type PaymentStatus = Enums<'payment_status'>
export type CouponStatus = Enums<'coupon_status'>
export type ProductStatus = Enums<'product_status'>
export type ProductType = Enums<'product_type'>
export type ProductApprovalStatus = Enums<'product_approval_status'>
export type AuditAction = Enums<'audit_action'>
export type AffiliateStatus = Enums<'affiliate_status'>
export type ReferralStatus = Enums<'referral_status'>
