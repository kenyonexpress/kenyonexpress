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
      abandoned_cart_nudges: {
        Row: {
          cart_id: string | null
          cart_value_agorot: number
          created_at: string
          email: string
          id: string
          item_count: number
          provider_id: string | null
          recovered_at: string | null
          recovered_order_id: string | null
          sent_at: string
          user_id: string | null
        }
        Insert: {
          cart_id?: string | null
          cart_value_agorot?: number
          created_at?: string
          email: string
          id?: string
          item_count?: number
          provider_id?: string | null
          recovered_at?: string | null
          recovered_order_id?: string | null
          sent_at?: string
          user_id?: string | null
        }
        Update: {
          cart_id?: string | null
          cart_value_agorot?: number
          created_at?: string
          email?: string
          id?: string
          item_count?: number
          provider_id?: string | null
          recovered_at?: string | null
          recovered_order_id?: string | null
          sent_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abandoned_cart_nudges_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: true
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_cart_nudges_recovered_order_id_fkey"
            columns: ["recovered_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abandoned_cart_nudges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      cashback_rules: {
        Row: {
          category_id: string | null
          created_at: string
          ends_at: string | null
          every_nth_order: number | null
          id: string
          is_active: boolean
          max_cashback_ils: number | null
          min_order_ils: number
          name_he: string
          percent: number
          priority: number
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          ends_at?: string | null
          every_nth_order?: number | null
          id?: string
          is_active?: boolean
          max_cashback_ils?: number | null
          min_order_ils?: number
          name_he: string
          percent: number
          priority?: number
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          ends_at?: string | null
          every_nth_order?: number | null
          id?: string
          is_active?: boolean
          max_cashback_ils?: number | null
          min_order_ils?: number
          name_he?: string
          percent?: number
          priority?: number
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashback_rules_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
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
            foreignKeyName: "coupon_codes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
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
      discount_campaigns: {
        Row: {
          allow_stacking: boolean
          amount_agorot: number | null
          code: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["discount_kind"]
          max_discount_agorot: number | null
          max_uses: number | null
          max_uses_per_user: number
          min_order_agorot: number
          name: string
          percent_bp: number | null
          starts_at: string | null
          updated_at: string
          used_count: number
        }
        Insert: {
          allow_stacking?: boolean
          amount_agorot?: number | null
          code: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["discount_kind"]
          max_discount_agorot?: number | null
          max_uses?: number | null
          max_uses_per_user?: number
          min_order_agorot?: number
          name: string
          percent_bp?: number | null
          starts_at?: string | null
          updated_at?: string
          used_count?: number
        }
        Update: {
          allow_stacking?: boolean
          amount_agorot?: number | null
          code?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["discount_kind"]
          max_discount_agorot?: number | null
          max_uses?: number | null
          max_uses_per_user?: number
          min_order_agorot?: number
          name?: string
          percent_bp?: number | null
          starts_at?: string | null
          updated_at?: string
          used_count?: number
        }
        Relationships: []
      }
      discount_redemptions: {
        Row: {
          amount_agorot: number
          campaign_id: string
          created_at: string
          id: string
          order_id: string | null
          user_id: string | null
        }
        Insert: {
          amount_agorot: number
          campaign_id: string
          created_at?: string
          id?: string
          order_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount_agorot?: number
          campaign_id?: string
          created_at?: string
          id?: string
          order_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discount_redemptions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "discount_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_redemptions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "v_discount_campaign_performance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_suppressions: {
        Row: {
          created_at: string
          detail: string | null
          email: string
          reason: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          email: string
          reason: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          email?: string
          reason?: string
        }
        Relationships: []
      }
      escrow_holds: {
        Row: {
          commission_agorot: number
          coupon_code_id: string | null
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
          voucher_id: string | null
        }
        Insert: {
          commission_agorot: number
          coupon_code_id?: string | null
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
          voucher_id?: string | null
        }
        Update: {
          commission_agorot?: number
          coupon_code_id?: string | null
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
          voucher_id?: string | null
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
          {
            foreignKeyName: "escrow_holds_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          attempts: number
          created_at: string
          document_number: string | null
          document_type: string
          document_url: string | null
          id: string
          idempotency_key: string
          issued_at: string | null
          last_error: string | null
          net_agorot: number
          next_attempt_at: string
          order_id: string
          payment_id: string | null
          provider: string
          provider_response: Json | null
          status: string
          total_agorot: number
          updated_at: string
          vat_agorot: number
          vat_percent: number
        }
        Insert: {
          attempts?: number
          created_at?: string
          document_number?: string | null
          document_type: string
          document_url?: string | null
          id?: string
          idempotency_key: string
          issued_at?: string | null
          last_error?: string | null
          net_agorot: number
          next_attempt_at?: string
          order_id: string
          payment_id?: string | null
          provider?: string
          provider_response?: Json | null
          status?: string
          total_agorot: number
          updated_at?: string
          vat_agorot: number
          vat_percent: number
        }
        Update: {
          attempts?: number
          created_at?: string
          document_number?: string | null
          document_type?: string
          document_url?: string | null
          id?: string
          idempotency_key?: string
          issued_at?: string | null
          last_error?: string | null
          net_agorot?: number
          next_attempt_at?: string
          order_id?: string
          payment_id?: string | null
          provider?: string
          provider_response?: Json | null
          status?: string
          total_agorot?: number
          updated_at?: string
          vat_agorot?: number
          vat_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      media_assets: {
        Row: {
          alt_he: string
          base_path: string | null
          blur_data_url: string | null
          bucket: string | null
          created_at: string
          created_by: string | null
          height: number | null
          id: string
          provider: string
          renditions: Json
          updated_at: string
          url: string
          width: number | null
        }
        Insert: {
          alt_he: string
          base_path?: string | null
          blur_data_url?: string | null
          bucket?: string | null
          created_at?: string
          created_by?: string | null
          height?: number | null
          id?: string
          provider?: string
          renditions?: Json
          updated_at?: string
          url: string
          width?: number | null
        }
        Update: {
          alt_he?: string
          base_path?: string | null
          blur_data_url?: string | null
          bucket?: string | null
          created_at?: string
          created_by?: string | null
          height?: number | null
          id?: string
          provider?: string
          renditions?: Json
          updated_at?: string
          url?: string
          width?: number | null
        }
        Relationships: []
      }
      newsletter_subscribers: {
        Row: {
          confirm_sent_at: string | null
          confirm_token: string | null
          confirmed_at: string | null
          consent_ip_hash: string | null
          consent_user_agent: string | null
          consent_wording_version: string | null
          created_at: string
          email: string
          id: string
          resend_contact_id: string | null
          resend_synced_at: string | null
          source: string | null
          status: Database["public"]["Enums"]["subscriber_status"]
          unsubscribe_reason: string | null
          unsubscribe_token: string
          unsubscribed_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          confirm_sent_at?: string | null
          confirm_token?: string | null
          confirmed_at?: string | null
          consent_ip_hash?: string | null
          consent_user_agent?: string | null
          consent_wording_version?: string | null
          created_at?: string
          email: string
          id?: string
          resend_contact_id?: string | null
          resend_synced_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["subscriber_status"]
          unsubscribe_reason?: string | null
          unsubscribe_token?: string
          unsubscribed_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          confirm_sent_at?: string | null
          confirm_token?: string | null
          confirmed_at?: string | null
          consent_ip_hash?: string | null
          consent_user_agent?: string | null
          consent_wording_version?: string | null
          created_at?: string
          email?: string
          id?: string
          resend_contact_id?: string | null
          resend_synced_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["subscriber_status"]
          unsubscribe_reason?: string | null
          unsubscribe_token?: string
          unsubscribed_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_subscribers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string
          id: string
          kind: string
          last_error: string | null
          next_attempt_at: string
          payload: Json
          push_attempts: number
          push_error: string | null
          push_next_attempt_at: string
          push_sent_at: string | null
          push_status: string
          recipient_email: string
          sent_at: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key: string
          id?: string
          kind: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          push_attempts?: number
          push_error?: string | null
          push_next_attempt_at?: string
          push_sent_at?: string | null
          push_status?: string
          recipient_email: string
          sent_at?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string
          id?: string
          kind?: string
          last_error?: string | null
          next_attempt_at?: string
          payload?: Json
          push_attempts?: number
          push_error?: string | null
          push_next_attempt_at?: string
          push_sent_at?: string | null
          push_status?: string
          recipient_email?: string
          sent_at?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
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
          coupon_price_ils: number | null
          created_at: string
          deleted_at: string | null
          discount_percent: number | null
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
          supplier_address: string | null
          supplier_id: string | null
          supplier_immediate_agorot: number | null
          supplier_logo_url: string | null
          supplier_name: string | null
          supplier_payout_ils: number
          supplier_phone: string | null
          supplier_split_percent: number | null
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
          coupon_price_ils?: number | null
          created_at?: string
          deleted_at?: string | null
          discount_percent?: number | null
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
          supplier_address?: string | null
          supplier_id?: string | null
          supplier_immediate_agorot?: number | null
          supplier_logo_url?: string | null
          supplier_name?: string | null
          supplier_payout_ils: number
          supplier_phone?: string | null
          supplier_split_percent?: number | null
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
          coupon_price_ils?: number | null
          created_at?: string
          deleted_at?: string | null
          discount_percent?: number | null
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
          supplier_address?: string | null
          supplier_id?: string | null
          supplier_immediate_agorot?: number | null
          supplier_logo_url?: string | null
          supplier_name?: string | null
          supplier_payout_ils?: number
          supplier_phone?: string | null
          supplier_split_percent?: number | null
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
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
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
          gift_message: string | null
          gift_recipient_email: string | null
          gift_recipient_name: string | null
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
          gift_message?: string | null
          gift_recipient_email?: string | null
          gift_recipient_name?: string | null
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
          gift_message?: string | null
          gift_recipient_email?: string | null
          gift_recipient_name?: string | null
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
          cardcom_account_id: string | null
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
          cardcom_account_id?: string | null
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
          cardcom_account_id?: string | null
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
          cardcom_account_id: string | null
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
          refund_of_payment_id: string | null
          status: Database["public"]["Enums"]["payment_status"]
          succeeded_at: string | null
          updated_at: string
          wallet_applied_ils: number
        }
        Insert: {
          amount_ils: number
          cardcom_account_id?: string | null
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
          refund_of_payment_id?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          succeeded_at?: string | null
          updated_at?: string
          wallet_applied_ils?: number
        }
        Update: {
          amount_ils?: number
          cardcom_account_id?: string | null
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
          refund_of_payment_id?: string | null
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
          {
            foreignKeyName: "payments_refund_of_payment_id_fkey"
            columns: ["refund_of_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      popular_searches: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          position: number
          target_url: string | null
          term: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          position?: number
          target_url?: string | null
          term: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          position?: number
          target_url?: string | null
          term?: string
          updated_at?: string
        }
        Relationships: []
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
          image_url: string | null
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
          image_url?: string | null
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
          image_url?: string | null
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
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
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
          cashback_enabled: boolean
          cashback_percent: number
          category_id: string | null
          city: string | null
          commission_percent: number
          commission_type: Database["public"]["Enums"]["commission_type"]
          compare_at_price: number | null
          compare_at_price_ils: number | null
          condition: string | null
          cost_ils: number | null
          coupon_expiry_days: number | null
          coupon_price_ils: number | null
          coupon_terms_he: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description_he: string | null
          discount_percent: number | null
          full_price: number | null
          height_cm: number | null
          height_mm: number | null
          highlights: Json
          id: string
          images: Json
          is_coupon_enabled: boolean
          is_featured: boolean
          kenyon_price: number | null
          latitude: number | null
          length_cm: number | null
          length_mm: number | null
          longitude: number | null
          low_stock_threshold: number
          max_per_order: number | null
          min_purchase_ils: number | null
          name_en: string | null
          name_he: string
          offer_valid_until: string | null
          platform_percent: number | null
          price_ils: number
          profit_share_cap_percent: number
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
          stock_initial: number | null
          stock_quantity: number | null
          submitted_at: string | null
          supplier_id: string | null
          supplier_split_percent: number | null
          tags: string[]
          type: Database["public"]["Enums"]["product_type"]
          updated_at: string
          vat_exempt: boolean
          video_url: string | null
          warranty_months: number | null
          weight_grams: number | null
          width_cm: number | null
          width_mm: number | null
        }
        Insert: {
          approval_note?: string | null
          approval_status?: Database["public"]["Enums"]["product_approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          attributes?: Json
          barcode?: string | null
          brand?: string | null
          cashback_enabled?: boolean
          cashback_percent?: number
          category_id?: string | null
          city?: string | null
          commission_percent: number
          commission_type: Database["public"]["Enums"]["commission_type"]
          compare_at_price?: number | null
          compare_at_price_ils?: number | null
          condition?: string | null
          cost_ils?: number | null
          coupon_expiry_days?: number | null
          coupon_price_ils?: number | null
          coupon_terms_he?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description_he?: string | null
          discount_percent?: number | null
          full_price?: number | null
          height_cm?: number | null
          height_mm?: number | null
          highlights?: Json
          id?: string
          images?: Json
          is_coupon_enabled?: boolean
          is_featured?: boolean
          kenyon_price?: number | null
          latitude?: number | null
          length_cm?: number | null
          length_mm?: number | null
          longitude?: number | null
          low_stock_threshold?: number
          max_per_order?: number | null
          min_purchase_ils?: number | null
          name_en?: string | null
          name_he: string
          offer_valid_until?: string | null
          platform_percent?: number | null
          price_ils: number
          profit_share_cap_percent?: number
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
          stock_initial?: number | null
          stock_quantity?: number | null
          submitted_at?: string | null
          supplier_id?: string | null
          supplier_split_percent?: number | null
          tags?: string[]
          type: Database["public"]["Enums"]["product_type"]
          updated_at?: string
          vat_exempt?: boolean
          video_url?: string | null
          warranty_months?: number | null
          weight_grams?: number | null
          width_cm?: number | null
          width_mm?: number | null
        }
        Update: {
          approval_note?: string | null
          approval_status?: Database["public"]["Enums"]["product_approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          attributes?: Json
          barcode?: string | null
          brand?: string | null
          cashback_enabled?: boolean
          cashback_percent?: number
          category_id?: string | null
          city?: string | null
          commission_percent?: number
          commission_type?: Database["public"]["Enums"]["commission_type"]
          compare_at_price?: number | null
          compare_at_price_ils?: number | null
          condition?: string | null
          cost_ils?: number | null
          coupon_expiry_days?: number | null
          coupon_price_ils?: number | null
          coupon_terms_he?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description_he?: string | null
          discount_percent?: number | null
          full_price?: number | null
          height_cm?: number | null
          height_mm?: number | null
          highlights?: Json
          id?: string
          images?: Json
          is_coupon_enabled?: boolean
          is_featured?: boolean
          kenyon_price?: number | null
          latitude?: number | null
          length_cm?: number | null
          length_mm?: number | null
          longitude?: number | null
          low_stock_threshold?: number
          max_per_order?: number | null
          min_purchase_ils?: number | null
          name_en?: string | null
          name_he?: string
          offer_valid_until?: string | null
          platform_percent?: number | null
          price_ils?: number
          profit_share_cap_percent?: number
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
          stock_initial?: number | null
          stock_quantity?: number | null
          submitted_at?: string | null
          supplier_id?: string | null
          supplier_split_percent?: number | null
          tags?: string[]
          type?: Database["public"]["Enums"]["product_type"]
          updated_at?: string
          vat_exempt?: boolean
          video_url?: string | null
          warranty_months?: number | null
          weight_grams?: number | null
          width_cm?: number | null
          width_mm?: number | null
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
          referral_code: string | null
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
          referral_code?: string | null
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
          referral_code?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          total_purchases?: number | null
          updated_at?: string | null
          wallet_balance?: number | null
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          app_version: string | null
          created_at: string
          device_id: string | null
          disabled_reason: string | null
          enabled: boolean
          expo_token: string
          id: string
          last_seen_at: string
          locale: string
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_id?: string | null
          disabled_reason?: string | null
          enabled?: boolean
          expo_token: string
          id?: string
          last_seen_at?: string
          locale?: string
          platform?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_id?: string | null
          disabled_reason?: string | null
          enabled?: boolean
          expo_token?: string
          id?: string
          last_seen_at?: string
          locale?: string
          platform?: string
          updated_at?: string
          user_id?: string
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
      referral_program_settings: {
        Row: {
          id: boolean
          is_active: boolean
          max_per_referrer_month: number
          max_per_referrer_year: number
          min_order_agorot: number
          qualify_window_days: number
          referred_bonus_agorot: number
          referrer_bonus_agorot: number
          require_manual_approval: boolean
          updated_at: string
        }
        Insert: {
          id?: boolean
          is_active?: boolean
          max_per_referrer_month?: number
          max_per_referrer_year?: number
          min_order_agorot: number
          qualify_window_days?: number
          referred_bonus_agorot: number
          referrer_bonus_agorot: number
          require_manual_approval?: boolean
          updated_at?: string
        }
        Update: {
          id?: boolean
          is_active?: boolean
          max_per_referrer_month?: number
          max_per_referrer_year?: number
          min_order_agorot?: number
          qualify_window_days?: number
          referred_bonus_agorot?: number
          referrer_bonus_agorot?: number
          require_manual_approval?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      referral_signals: {
        Row: {
          fingerprint: string
          first_seen: string
          id: string
          kind: string
          last_seen: string
          seen_count: number
          user_id: string
        }
        Insert: {
          fingerprint: string
          first_seen?: string
          id?: string
          kind: string
          last_seen?: string
          seen_count?: number
          user_id: string
        }
        Update: {
          fingerprint?: string
          first_seen?: string
          id?: string
          kind?: string
          last_seen?: string
          seen_count?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_signals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          bonus_paid_amount_ils: number
          completed_at: string | null
          created_at: string
          deleted_at: string | null
          flagged_reasons: string[] | null
          id: string
          paid_at: string | null
          qualify_by: string | null
          referral_code: string
          referred_bonus_agorot: number | null
          referred_first_order_id: string | null
          referred_user_id: string
          referrer_bonus_agorot: number | null
          referrer_user_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["referral_status"]
          updated_at: string
        }
        Insert: {
          bonus_paid_amount_ils?: number
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          flagged_reasons?: string[] | null
          id?: string
          paid_at?: string | null
          qualify_by?: string | null
          referral_code: string
          referred_bonus_agorot?: number | null
          referred_first_order_id?: string | null
          referred_user_id: string
          referrer_bonus_agorot?: number | null
          referrer_user_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["referral_status"]
          updated_at?: string
        }
        Update: {
          bonus_paid_amount_ils?: number
          completed_at?: string | null
          created_at?: string
          deleted_at?: string | null
          flagged_reasons?: string[] | null
          id?: string
          paid_at?: string | null
          qualify_by?: string | null
          referral_code?: string
          referred_bonus_agorot?: number | null
          referred_first_order_id?: string | null
          referred_user_id?: string
          referrer_bonus_agorot?: number | null
          referrer_user_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
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
      search_events: {
        Row: {
          created_at: string
          empty_results: number
          first_seen_at: string
          id: string
          last_hits: number | null
          last_seen_at: string
          raw_term: string
          searches: number
          term: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          empty_results?: number
          first_seen_at?: string
          id?: string
          last_hits?: number | null
          last_seen_at?: string
          raw_term: string
          searches?: number
          term: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          empty_results?: number
          first_seen_at?: string
          id?: string
          last_hits?: number | null
          last_seen_at?: string
          raw_term?: string
          searches?: number
          term?: string
          updated_at?: string
        }
        Relationships: []
      }
      search_index_dlq: {
        Row: {
          callback: Json
          created_at: string
          id: string
          job: Json | null
          last_error: string | null
          resolved_at: string | null
          status: string
        }
        Insert: {
          callback: Json
          created_at?: string
          id?: string
          job?: Json | null
          last_error?: string | null
          resolved_at?: string | null
          status?: string
        }
        Update: {
          callback?: Json
          created_at?: string
          id?: string
          job?: Json | null
          last_error?: string | null
          resolved_at?: string | null
          status?: string
        }
        Relationships: []
      }
      seo_redirects: {
        Row: {
          created_at: string
          entity_type: string | null
          hits: number
          id: string
          is_active: boolean
          last_hit_at: string | null
          mapping_rule: string | null
          source_path: string
          status_code: number
          target_path: string
          updated_at: string
          wp_id: number | null
        }
        Insert: {
          created_at?: string
          entity_type?: string | null
          hits?: number
          id?: string
          is_active?: boolean
          last_hit_at?: string | null
          mapping_rule?: string | null
          source_path: string
          status_code?: number
          target_path?: string
          updated_at?: string
          wp_id?: number | null
        }
        Update: {
          created_at?: string
          entity_type?: string | null
          hits?: number
          id?: string
          is_active?: boolean
          last_hit_at?: string | null
          mapping_rule?: string | null
          source_path?: string
          status_code?: number
          target_path?: string
          updated_at?: string
          wp_id?: number | null
        }
        Relationships: []
      }
      settlement_events: {
        Row: {
          commission_agorot: number
          created_at: string
          discount_agorot: number
          id: string
          idempotency_key: string | null
          kind: string
          metadata: Json
          occurred_at: string
          order_id: string
          order_item_id: string | null
          paid_on_site_agorot: number
          platform_percent_snapshot: number | null
          supplier_due_agorot: number
          supplier_id: string | null
          supplier_split_percent_snapshot: number | null
        }
        Insert: {
          commission_agorot?: number
          created_at?: string
          discount_agorot?: number
          id?: string
          idempotency_key?: string | null
          kind: string
          metadata?: Json
          occurred_at?: string
          order_id: string
          order_item_id?: string | null
          paid_on_site_agorot?: number
          platform_percent_snapshot?: number | null
          supplier_due_agorot?: number
          supplier_id?: string | null
          supplier_split_percent_snapshot?: number | null
        }
        Update: {
          commission_agorot?: number
          created_at?: string
          discount_agorot?: number
          id?: string
          idempotency_key?: string | null
          kind?: string
          metadata?: Json
          occurred_at?: string
          order_id?: string
          order_item_id?: string | null
          paid_on_site_agorot?: number
          platform_percent_snapshot?: number | null
          supplier_due_agorot?: number
          supplier_id?: string | null
          supplier_split_percent_snapshot?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "settlement_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_events_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_events_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
      stock_reservations: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          order_id: string
          product_id: string
          quantity: number
          released_at: string | null
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          order_id: string
          product_id: string
          quantity: number
          released_at?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          released_at?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_leads: {
        Row: {
          business_name: string
          category: string | null
          city: string | null
          contact_name: string
          created_at: string
          email: string
          handled_at: string | null
          handled_by: string | null
          id: string
          message: string | null
          notes: string | null
          phone: string
          status: string
          updated_at: string
          website: string | null
        }
        Insert: {
          business_name: string
          category?: string | null
          city?: string | null
          contact_name: string
          created_at?: string
          email: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message?: string | null
          notes?: string | null
          phone: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          business_name?: string
          category?: string | null
          city?: string | null
          contact_name?: string
          created_at?: string
          email?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          message?: string | null
          notes?: string | null
          phone?: string
          status?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      supplier_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          is_active: boolean
          member_role: Database["public"]["Enums"]["supplier_member_role"]
          supplier_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          is_active?: boolean
          member_role?: Database["public"]["Enums"]["supplier_member_role"]
          supplier_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          is_active?: boolean
          member_role?: Database["public"]["Enums"]["supplier_member_role"]
          supplier_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_members_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_staff: {
        Row: {
          created_at: string
          deleted_at: string | null
          display_name: string
          failed_attempts: number
          id: string
          is_active: boolean
          last_used_at: string | null
          locked_until: string | null
          pin_hash: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          display_name: string
          failed_attempts?: number
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          locked_until?: string | null
          pin_hash: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          failed_attempts?: number
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          locked_until?: string | null
          pin_hash?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_staff_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          app_scanning_enabled: boolean
          business_id: string | null
          city: string | null
          commission_percent: number
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          default_split_percent: number
          deleted_at: string | null
          id: string
          logo_url: string | null
          name: string
          notes: string | null
          status: string
          updated_at: string
          website: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          app_scanning_enabled?: boolean
          business_id?: string | null
          city?: string | null
          commission_percent?: number
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          default_split_percent?: number
          deleted_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          notes?: string | null
          status?: string
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          app_scanning_enabled?: boolean
          business_id?: string | null
          city?: string | null
          commission_percent?: number
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          default_split_percent?: number
          deleted_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          notes?: string | null
          status?: string
          updated_at?: string
          website?: string | null
          whatsapp?: string | null
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
      user_recent_searches: {
        Row: {
          created_at: string
          id: string
          searched_at: string
          term: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          searched_at?: string
          term: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          searched_at?: string
          term?: string
          updated_at?: string
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
      voucher_redemptions: {
        Row: {
          amount_collected_agorot: number | null
          code_entered: string
          created_at: string
          id: string
          idempotency_key: string | null
          ip_address: unknown
          metadata: Json
          outcome: Database["public"]["Enums"]["voucher_scan_outcome"]
          scan_method: string | null
          scanned_by: string | null
          staff_id: string | null
          supplier_id: string | null
          user_agent: string | null
          voucher_id: string | null
        }
        Insert: {
          amount_collected_agorot?: number | null
          code_entered: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          ip_address?: unknown
          metadata?: Json
          outcome: Database["public"]["Enums"]["voucher_scan_outcome"]
          scan_method?: string | null
          scanned_by?: string | null
          staff_id?: string | null
          supplier_id?: string | null
          user_agent?: string | null
          voucher_id?: string | null
        }
        Update: {
          amount_collected_agorot?: number | null
          code_entered?: string
          created_at?: string
          id?: string
          idempotency_key?: string | null
          ip_address?: unknown
          metadata?: Json
          outcome?: Database["public"]["Enums"]["voucher_scan_outcome"]
          scan_method?: string | null
          scanned_by?: string | null
          staff_id?: string | null
          supplier_id?: string | null
          user_agent?: string | null
          voucher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voucher_redemptions_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "supplier_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voucher_redemptions_voucher_id_fkey"
            columns: ["voucher_id"]
            isOneToOne: false
            referencedRelation: "vouchers"
            referencedColumns: ["id"]
          },
        ]
      }
      vouchers: {
        Row: {
          cancelled_at: string | null
          code: string
          coupon_price_agorot: number
          created_at: string
          expires_at: string
          face_value_agorot: number
          gift_claim_token_hash: string | null
          gift_claimed_at: string | null
          gift_message: string | null
          gift_recipient_email: string | null
          gift_recipient_name: string | null
          gift_sent_at: string | null
          gifted_by_user_id: string | null
          id: string
          issued_at: string
          offer_valid_until: string
          order_id: string
          order_item_id: string
          platform_percent: number
          product_id: string
          qr_key_id: string
          qr_payload: string
          redeemed_amount_collected_agorot: number | null
          redeemed_at: string | null
          redeemed_by_supplier_id: string | null
          redeemed_by_user_id: string | null
          refunded_at: string | null
          remaining_amount_due_agorot: number
          status: Database["public"]["Enums"]["voucher_status"]
          status_reason: string | null
          supplier_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancelled_at?: string | null
          code: string
          coupon_price_agorot: number
          created_at?: string
          expires_at: string
          face_value_agorot: number
          gift_claim_token_hash?: string | null
          gift_claimed_at?: string | null
          gift_message?: string | null
          gift_recipient_email?: string | null
          gift_recipient_name?: string | null
          gift_sent_at?: string | null
          gifted_by_user_id?: string | null
          id?: string
          issued_at?: string
          offer_valid_until: string
          order_id: string
          order_item_id: string
          platform_percent: number
          product_id: string
          qr_key_id?: string
          qr_payload: string
          redeemed_amount_collected_agorot?: number | null
          redeemed_at?: string | null
          redeemed_by_supplier_id?: string | null
          redeemed_by_user_id?: string | null
          refunded_at?: string | null
          remaining_amount_due_agorot: number
          status?: Database["public"]["Enums"]["voucher_status"]
          status_reason?: string | null
          supplier_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancelled_at?: string | null
          code?: string
          coupon_price_agorot?: number
          created_at?: string
          expires_at?: string
          face_value_agorot?: number
          gift_claim_token_hash?: string | null
          gift_claimed_at?: string | null
          gift_message?: string | null
          gift_recipient_email?: string | null
          gift_recipient_name?: string | null
          gift_sent_at?: string | null
          gifted_by_user_id?: string | null
          id?: string
          issued_at?: string
          offer_valid_until?: string
          order_id?: string
          order_item_id?: string
          platform_percent?: number
          product_id?: string
          qr_key_id?: string
          qr_payload?: string
          redeemed_amount_collected_agorot?: number | null
          redeemed_at?: string | null
          redeemed_by_supplier_id?: string | null
          redeemed_by_user_id?: string | null
          refunded_at?: string | null
          remaining_amount_due_agorot?: number
          status?: Database["public"]["Enums"]["voucher_status"]
          status_reason?: string | null
          supplier_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vouchers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_low_stock"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_redeemed_by_supplier_id_fkey"
            columns: ["redeemed_by_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vouchers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
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
            referencedRelation: "v_wallet_balance_drift"
            referencedColumns: ["account_id"]
          },
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
            referencedRelation: "v_wallet_balance_drift"
            referencedColumns: ["account_id"]
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
      v_abandoned_cart_recovery: {
        Row: {
          nudges_sent: number | null
          recovered: number | null
          recovered_value_agorot: number | null
          recovery_rate_percent: number | null
          week: string | null
        }
        Relationships: []
      }
      v_admin_pending_queues: {
        Row: {
          n: number | null
          oldest_at: string | null
          queue: string | null
          sla: string | null
        }
        Relationships: []
      }
      v_cart_reaper_backlog: {
        Row: {
          expired_carts: number | null
          guest_carts: number | null
          oldest_expiry: string | null
          total_carts: number | null
        }
        Relationships: []
      }
      v_discount_campaign_performance: {
        Row: {
          allow_stacking: boolean | null
          code: string | null
          counter_drift: boolean | null
          distinct_users: number | null
          expires_at: string | null
          id: string | null
          is_active: boolean | null
          kind: Database["public"]["Enums"]["discount_kind"] | null
          last_redeemed_at: string | null
          max_uses: number | null
          max_uses_per_user: number | null
          name: string | null
          redemptions: number | null
          starts_at: string | null
          total_discount_agorot: number | null
          used_count: number | null
        }
        Relationships: []
      }
      v_low_stock: {
        Row: {
          available: number | null
          id: string | null
          low_stock_threshold: number | null
          name_he: string | null
          slug: string | null
          stock_initial: number | null
          stock_quantity: number | null
          supplier_email: string | null
          supplier_name: string | null
          type: Database["public"]["Enums"]["product_type"] | null
        }
        Relationships: []
      }
      v_newsletter_stats: {
        Row: {
          churn_percent: number | null
          confirm_rate_percent: number | null
          pending_confirm: number | null
          subscribed: number | null
          total: number | null
          unsubscribed: number | null
        }
        Relationships: []
      }
      v_referral_review_queue: {
        Row: {
          created_at: string | null
          flagged_reasons: string[] | null
          id: string | null
          qualify_by: string | null
          referred_bonus_agorot: number | null
          referred_email: string | null
          referred_first_order_id: string | null
          referred_user_id: string | null
          referrer_bonus_agorot: number | null
          referrer_email: string | null
          referrer_paid_count: number | null
          referrer_user_id: string | null
          status: Database["public"]["Enums"]["referral_status"] | null
          total_bonus_agorot: number | null
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
      v_referral_stats: {
        Row: {
          completed: number | null
          flagged: number | null
          held_agorot: number | null
          paid_agorot: number | null
          pending: number | null
          referrers: number | null
          rejected: number | null
          rejection_rate_percent: number | null
          total: number | null
        }
        Relationships: []
      }
      v_wallet_balance_drift: {
        Row: {
          account_id: string | null
          cached_balance_ils: number | null
          code: string | null
          drift_ils: number | null
          ledger_balance_ils: number | null
          user_id: string | null
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
      v_wallet_ledger: {
        Row: {
          amount_ils: number | null
          created_at: string | null
          direction: string | null
          id: string | null
          order_id: string | null
          reason: string | null
          signed_amount_ils: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wallet_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
    }
    Functions: {
      available_stock: {
        Args: {
          p_exclude_order?: string
          p_product_id: string
          p_variant_id?: string
        }
        Returns: number
      }
      cancel_vouchers_for_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: number
      }
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
      consume_order_stock: { Args: { p_order_id: string }; Returns: number }
      credit_expired_vouchers: { Args: never; Returns: number }
      current_supplier_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      enqueue_expiring_voucher_notices: {
        Args: { p_buckets?: number[] }
        Returns: number
      }
      expire_vouchers: { Args: never; Returns: number }
      fn_attribute_cart_recovery: {
        Args: { p_order_id: string; p_user_id: string }
        Returns: number
      }
      fn_claim_discount: {
        Args: {
          p_amount_agorot: number
          p_code: string
          p_order_id: string
          p_user_id: string
        }
        Returns: Json
      }
      fn_claim_referral: {
        Args: {
          p_code: string
          p_device_hash?: string
          p_ip_hash?: string
          p_referred_user_id: string
        }
        Returns: Json
      }
      fn_complete_referral: {
        Args: {
          p_card_hash?: string
          p_order_agorot: number
          p_order_id: string
          p_user_id: string
        }
        Returns: Json
      }
      fn_due_abandoned_carts: {
        Args: { p_limit?: number; p_older_than_hours?: number }
        Returns: {
          cart_id: string
          email: string
          item_count: number
          updated_at: string
          user_id: string
        }[]
      }
      fn_enqueue_notification:
        | {
            Args: {
              p_dedupe: string
              p_email: string
              p_kind: string
              p_payload: Json
            }
            Returns: undefined
          }
        | {
            Args: {
              p_dedupe: string
              p_email: string
              p_kind: string
              p_payload: Json
              p_user_id: string
            }
            Returns: undefined
          }
      fn_ensure_referral_code: { Args: { p_user_id: string }; Returns: string }
      fn_pay_referral: {
        Args: { p_approved_by?: string; p_referral_id: string }
        Returns: Json
      }
      fn_push_targets: {
        Args: { p_email: string; p_user_id: string }
        Returns: {
          expo_token: string
          locale: string
          platform: string
        }[]
      }
      fn_reap_expired_carts: { Args: { p_limit?: number }; Returns: number }
      fn_record_recent_search: { Args: { p_term: string }; Returns: undefined }
      fn_record_redirect_hits: { Args: { p_paths: string[] }; Returns: number }
      fn_record_search: {
        Args: { p_hits: number; p_term: string }
        Returns: undefined
      }
      fn_referral_fraud_signals: {
        Args: { p_referred_id: string; p_referrer_id: string }
        Returns: string[]
      }
      fn_reject_referral: {
        Args: { p_reason: string; p_referral_id: string; p_rejected_by: string }
        Returns: Json
      }
      fn_release_discount: { Args: { p_order_id: string }; Returns: number }
      fn_unsubscribe_by_token: {
        Args: { p_reason?: string; p_token: string }
        Returns: Json
      }
      fn_wallet_cashback_amount: {
        Args: {
          p_category_ids?: string[]
          p_order_total_ils: number
          p_user_id: string
        }
        Returns: number
      }
      fn_wallet_cashback_percent: {
        Args: {
          p_category_ids?: string[]
          p_order_total_ils: number
          p_user_id: string
        }
        Returns: number
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
      is_supplier_order: { Args: { p_order_id: string }; Returns: boolean }
      is_supplier_owner: { Args: { p_supplier_id: string }; Returns: boolean }
      is_supplier_shipping_order: {
        Args: { p_order_id: string }
        Returns: boolean
      }
      is_support: { Args: never; Returns: boolean }
      log_voucher_scan: {
        Args: {
          p_code_entered: string
          p_ip?: string
          p_outcome?: string
          p_scan_method?: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      product_platform_percent: {
        Args: { p_product_id: string }
        Returns: number
      }
      redeem_voucher: {
        Args: {
          p_code: string
          p_idempotency_key?: string
          p_ip?: string
          p_scan_method?: string
          p_user_agent?: string
        }
        Returns: Json
      }
      refund_vouchers_for_order: {
        Args: { p_order_id: string; p_reason?: string }
        Returns: number
      }
      release_expired_stock_reservations: { Args: never; Returns: number }
      release_order_stock: { Args: { p_order_id: string }; Returns: number }
      reserve_order_stock: {
        Args: { p_order_id: string; p_ttl_minutes?: number }
        Returns: {
          available: number
          product_id: string
          requested: number
        }[]
      }
      set_supplier_staff_pin: {
        Args: { p_pin: string; p_staff_id: string }
        Returns: undefined
      }
      supplier_app_context: {
        Args: never
        Returns: {
          member_role: string
          scanning_enabled: boolean
          staff_count: number
          supplier_id: string
          supplier_name: string
        }[]
      }
      verify_supplier_staff_pin: {
        Args: { p_pin: string }
        Returns: {
          display_name: string
          locked: boolean
          staff_id: string
        }[]
      }
      voucher_scan_ip: { Args: { p_raw: string }; Returns: unknown }
      voucher_success_payload: {
        Args: { v: Database["public"]["Tables"]["vouchers"]["Row"] }
        Returns: Json
      }
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
      commission_type: "coupon_absolute" | "physical_percent"
      coupon_status: "issued" | "used" | "expired" | "refunded"
      discount_kind: "percent" | "fixed"
      dispute_status:
        | "open"
        | "in_review"
        | "resolved_accepted"
        | "resolved_rejected"
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
        | "platform_settled"
      payment_kind: "charge" | "refund"
      payment_status:
        | "initiated"
        | "redirected"
        | "succeeded"
        | "failed"
        | "refunded"
        | "platform_settled"
      payout_line_type: "physical_delivery" | "coupon_redemption" | "adjustment"
      payout_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "paid"
        | "cancelled"
      product_approval_status: "draft" | "pending" | "approved" | "rejected"
      product_status: "draft" | "active" | "paused" | "sold_out" | "archived"
      product_type: "coupon" | "physical" | "service"
      referral_status: "pending" | "completed" | "rejected" | "flagged"
      scan_result:
        | "success"
        | "not_found"
        | "already_used"
        | "expired"
        | "refunded"
        | "wrong_supplier"
        | "unauthorized"
        | "rate_limited"
      settlement_status:
        | "pending"
        | "paid"
        | "split_executed"
        | "escrow_held"
        | "escrow_released"
        | "redeemed"
        | "refunded"
        | "cancelled"
        | "platform_settled"
      subscriber_status:
        | "pending"
        | "subscribed"
        | "unsubscribed"
        | "bounced"
        | "complained"
      supplier_application_status: "pending" | "approved" | "rejected"
      supplier_member_role: "owner" | "manager" | "scanner"
      supplier_status: "active" | "suspended" | "closed"
      user_role:
        | "customer"
        | "content_uploader"
        | "vendor"
        | "admin"
        | "super_admin"
        | "support"
      voucher_scan_outcome:
        | "success"
        | "already_redeemed"
        | "expired"
        | "cancelled"
        | "refunded"
        | "wrong_supplier"
        | "not_found"
        | "invalid_signature"
        | "invalid_request"
        | "unauthorized"
        | "rate_limited"
      voucher_status:
        | "issued"
        | "redeemed"
        | "expired"
        | "cancelled"
        | "refunded"
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
      commission_type: ["coupon_absolute", "physical_percent"],
      coupon_status: ["issued", "used", "expired", "refunded"],
      discount_kind: ["percent", "fixed"],
      dispute_status: [
        "open",
        "in_review",
        "resolved_accepted",
        "resolved_rejected",
      ],
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
        "platform_settled",
      ],
      payment_kind: ["charge", "refund"],
      payment_status: [
        "initiated",
        "redirected",
        "succeeded",
        "failed",
        "refunded",
        "platform_settled",
      ],
      payout_line_type: [
        "physical_delivery",
        "coupon_redemption",
        "adjustment",
      ],
      payout_status: [
        "draft",
        "pending_approval",
        "approved",
        "paid",
        "cancelled",
      ],
      product_approval_status: ["draft", "pending", "approved", "rejected"],
      product_status: ["draft", "active", "paused", "sold_out", "archived"],
      product_type: ["coupon", "physical", "service"],
      referral_status: ["pending", "completed", "rejected", "flagged"],
      scan_result: [
        "success",
        "not_found",
        "already_used",
        "expired",
        "refunded",
        "wrong_supplier",
        "unauthorized",
        "rate_limited",
      ],
      settlement_status: [
        "pending",
        "paid",
        "split_executed",
        "escrow_held",
        "escrow_released",
        "redeemed",
        "refunded",
        "cancelled",
        "platform_settled",
      ],
      subscriber_status: [
        "pending",
        "subscribed",
        "unsubscribed",
        "bounced",
        "complained",
      ],
      supplier_application_status: ["pending", "approved", "rejected"],
      supplier_member_role: ["owner", "manager", "scanner"],
      supplier_status: ["active", "suspended", "closed"],
      user_role: [
        "customer",
        "content_uploader",
        "vendor",
        "admin",
        "super_admin",
        "support",
      ],
      voucher_scan_outcome: [
        "success",
        "already_redeemed",
        "expired",
        "cancelled",
        "refunded",
        "wrong_supplier",
        "not_found",
        "invalid_signature",
        "invalid_request",
        "unauthorized",
        "rate_limited",
      ],
      voucher_status: [
        "issued",
        "redeemed",
        "expired",
        "cancelled",
        "refunded",
      ],
      wallet_tx_source: ["cashback", "referral", "manual"],
      wallet_tx_type: ["earn", "redeem", "expire", "refund"],
    },
  },
} as const

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
export type Voucher = Tables<'vouchers'>
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
