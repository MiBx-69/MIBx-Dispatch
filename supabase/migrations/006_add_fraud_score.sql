-- Add fraud score columns to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS fraud_risk_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS fraud_risk_level TEXT DEFAULT 'low';

COMMENT ON COLUMN public.orders.fraud_risk_score IS 'Risk score between 0-100 indicating fraud probability';
COMMENT ON COLUMN public.orders.fraud_risk_level IS 'Risk category: low, medium, high';
