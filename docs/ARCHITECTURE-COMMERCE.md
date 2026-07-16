# KenyonExpress — Commerce Architecture

## 1. Schema Changes (draft migration 032)

### products — עמודות חדשות
```sql
product_type TEXT NOT NULL DEFAULT 'coupon' CHECK (product_type IN ('coupon','physical','subscription')),
coupon_price NUMERIC(10,2),           -- מה משולם באתר (קופון בלבד)
total_deal_price NUMERIC(10,2),       -- שווי הדיל המלא (קופון בלבד)
platform_percent NUMERIC(5,2),        -- פיזי + מנוי בלבד
billing_interval TEXT CHECK (billing_interval IN ('monthly')),  -- מנוי בלבד
recurring_amount NUMERIC(10,2),       -- מנוי בלבד
max_billing_cycles INT,               -- NULL = ללא הגבלה
supplier_id UUID REFERENCES suppliers(id)
```

### suppliers — טבלה (אם לא קיימת, ליצור)
```sql
id UUID PK,
business_name TEXT NOT NULL,
address TEXT,
city TEXT,
phone TEXT,
whatsapp TEXT,
opening_hours JSONB,
lat NUMERIC(9,6),
lng NUMERIC(9,6),
waze_link TEXT GENERATED,
created_at, updated_at
```

### order_items — snapshot בזמן קנייה
```sql
product_type TEXT NOT NULL,
coupon_price NUMERIC(10,2),
platform_percent NUMERIC(5,2),
platform_amount NUMERIC(10,2),
supplier_amount NUMERIC(10,2)
```

### coupons_issued — קופונים שהונפקו
```sql
id UUID PK,
order_item_id UUID FK,
code TEXT UNIQUE,          -- קוד סריקה
qr_payload TEXT,
status TEXT CHECK (status IN ('active','redeemed','expired','refunded')),
redeemed_at TIMESTAMPTZ,
redeemed_by UUID,          -- משתמש הספק שסרק
expires_at TIMESTAMPTZ
```

### subscriptions — מנויים
```sql
id UUID PK,
user_id UUID FK,
product_id UUID FK,
cardcom_recurring_token TEXT,
status TEXT CHECK (status IN ('active','paused','cancelled')),
next_billing_at TIMESTAMPTZ,
cycles_completed INT DEFAULT 0,
created_at, cancelled_at
```

### user_location_prefs
```sql
user_id UUID PK,
preferred_city TEXT,
preferred_radius_km INT,
last_lat NUMERIC(9,6),
last_lng NUMERIC(9,6)
```

## 2. Geo — מיון לפי מרחק
- אינדקס: CREATE INDEX ON suppliers USING gist (ll_to_earth(lat,lng)) — earthdistance extension
- API: GET /api/products?near=lat,lng&radius_km=25
- דף בית: אם יש geolocation permission → מבצעים לפי אזור קודם, אחרת כל הארץ
- בורר עיר ידני בעמוד קטגוריה (לא בheader — הheader נשאר לוגו + 3 אייקונים)

## 3. Checkout Flows
### קופון
Cart → "שלם" → Google login → Cardcom charge coupon_price → הנפקת קופון (code + QR) → מוצג באזור אישי + WhatsApp

### פיזי
Cart → "שלם" → Google login → Cardcom charge full price → snapshot split ל-order_items → סטטוס "ממתין לשילוח"

### מנוי
Product page → "הרשם" → Google login → Cardcom Recurring Token → חיוב ראשון → subscription active → cron חיוב חודשי

## 4. סריקת קופון (Supplier flow)
- דף /redeem לבעל עסק (RBAC: role supplier)
- סריקת QR או הזנת קוד → אימות → status redeemed → הקופון פג
- לוג ב-audit_log
