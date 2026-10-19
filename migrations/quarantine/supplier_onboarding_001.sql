CREATE TABLE supplier_profiles (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, business_name TEXT NOT NULL, phone TEXT NOT NULL, bank_account_holder TEXT NOT NULL, bank_iban TEXT NOT NULL, kyc_status TEXT DEFAULT 'pending', kyc_document_url TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE payout_requests (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), supplier_id UUID NOT NULL REFERENCES supplier_profiles(id) ON DELETE CASCADE, amount NUMERIC(12,2) NOT NULL, status TEXT DEFAULT 'pending', requested_at TIMESTAMPTZ DEFAULT now(), approved_at TIMESTAMPTZ, transferred_at TIMESTAMPTZ);
ALTER TABLE supplier_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY supplier_profiles_own ON supplier_profiles FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE INDEX idx_supplier_profiles_kyc_status ON supplier_profiles(kyc_status);
