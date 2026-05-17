// Auto-generated types from Supabase schema.
// Regenerate with: pnpm db:types
// Manual edits will be overwritten.

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
          role: 'customer' | 'vendor' | 'content_uploader' | 'admin'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          phone?: string | null
          avatar_url?: string | null
          role?: 'customer' | 'vendor' | 'content_uploader' | 'admin'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          phone?: string | null
          avatar_url?: string | null
          role?: 'customer' | 'vendor' | 'content_uploader' | 'admin'
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
          contact_email: string
          contact_phone: string | null
          address: string | null
          bank_account: string | null
          commission_rate: number
          status: 'pending' | 'active' | 'suspended'
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          business_name: string
          business_id: string
          contact_email: string
          contact_phone?: string | null
          address?: string | null
          bank_account?: string | null
          commission_rate?: number
          status?: 'pending' | 'active' | 'suspended'
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          business_name?: string
          business_id?: string
          contact_email?: string
          contact_phone?: string | null
          address?: string | null
          bank_account?: string | null
          commission_rate?: number
          status?: 'pending' | 'active' | 'suspended'
          created_at?: string
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
        }
        Relationships: [{ foreignKeyName: 'categories_parent_id_fkey'; columns: ['parent_id']; referencedRelation: 'categories'; referencedColumns: ['id'] }]
      }
      products: {
        Row: {
          id: string
          vendor_id: string
          category_id: string | null
          slug: string
          name_he: string
          description_he: string | null
          type: 'physical' | 'coupon'
          base_price: number
          sale_price: number | null
          currency: string
          stock_quantity: number | null
          status: 'draft' | 'active' | 'paused' | 'archived'
          images: Json
          seo_meta: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          vendor_id: string
          category_id?: string | null
          slug: string
          name_he: string
          description_he?: string | null
          type?: 'physical' | 'coupon'
          base_price: number
          sale_price?: number | null
          currency?: string
          stock_quantity?: number | null
          status?: 'draft' | 'active' | 'paused' | 'archived'
          images?: Json
          seo_meta?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          vendor_id?: string
          category_id?: string | null
          slug?: string
          name_he?: string
          description_he?: string | null
          type?: 'physical' | 'coupon'
          base_price?: number
          sale_price?: number | null
          currency?: string
          stock_quantity?: number | null
          status?: 'draft' | 'active' | 'paused' | 'archived'
          images?: Json
          seo_meta?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'products_vendor_id_fkey'; columns: ['vendor_id']; referencedRelation: 'vendors'; referencedColumns: ['id'] },
          { foreignKeyName: 'products_category_id_fkey'; columns: ['category_id']; referencedRelation: 'categories'; referencedColumns: ['id'] }
        ]
      }
      product_variants: {
        Row: {
          id: string
          product_id: string
          sku: string
          name_he: string
          price_modifier: number
          stock_quantity: number | null
          attributes: Json
          is_active: boolean
        }
        Insert: {
          id?: string
          product_id: string
          sku: string
          name_he: string
          price_modifier?: number
          stock_quantity?: number | null
          attributes?: Json
          is_active?: boolean
        }
        Update: {
          id?: string
          product_id?: string
          sku?: string
          name_he?: string
          price_modifier?: number
          stock_quantity?: number | null
          attributes?: Json
          is_active?: boolean
        }
        Relationships: [{ foreignKeyName: 'product_variants_product_id_fkey'; columns: ['product_id']; referencedRelation: 'products'; referencedColumns: ['id'] }]
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
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: 'coupons_product_id_fkey'; columns: ['product_id']; referencedRelation: 'products'; referencedColumns: ['id'] },
          { foreignKeyName: 'coupons_customer_id_fkey'; columns: ['customer_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] }
        ]
      }
      orders: {
        Row: {
          id: string
          order_number: string
          customer_id: string
          status: 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
          subtotal: number
          discount_amount: number
          total: number
          platform_fee: number
          vendor_payout: number
          payment_method: string | null
          payment_token_id: string | null
          shipping_address: Json | null
          notes: string | null
          created_at: string
          paid_at: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          order_number?: string
          customer_id: string
          status?: 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
          subtotal: number
          discount_amount?: number
          total: number
          platform_fee?: number
          vendor_payout?: number
          payment_method?: string | null
          payment_token_id?: string | null
          shipping_address?: Json | null
          notes?: string | null
          created_at?: string
          paid_at?: string | null
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['orders']['Insert']>
        Relationships: [{ foreignKeyName: 'orders_customer_id_fkey'; columns: ['customer_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] }]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_id: string | null
          variant_id: string | null
          vendor_id: string
          quantity: number
          unit_price: number
          subtotal: number
          platform_fee: number
          vendor_payout: number
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          product_id?: string | null
          variant_id?: string | null
          vendor_id: string
          quantity: number
          unit_price: number
          subtotal: number
          platform_fee?: number
          vendor_payout?: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>
        Relationships: [
          { foreignKeyName: 'order_items_order_id_fkey'; columns: ['order_id']; referencedRelation: 'orders'; referencedColumns: ['id'] },
          { foreignKeyName: 'order_items_vendor_id_fkey'; columns: ['vendor_id']; referencedRelation: 'vendors'; referencedColumns: ['id'] }
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
    }
    Views: Record<string, never>
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean }
    }
    Enums: {
      user_role: 'customer' | 'vendor' | 'content_uploader' | 'admin'
      vendor_status: 'pending' | 'active' | 'suspended'
      product_type: 'physical' | 'coupon'
      product_status: 'draft' | 'active' | 'paused' | 'archived'
      coupon_status: 'active' | 'redeemed' | 'expired'
      order_status: 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
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
