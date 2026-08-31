CREATE TABLE IF NOT EXISTS "public"."transactions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "type" text NOT NULL CHECK ("type" IN ('income', 'expense')),
    "amount" numeric NOT NULL DEFAULT 0,
    "description" text NOT NULL,
    "category" text,
    "date" timestamp with time zone DEFAULT now() NOT NULL,
    "created_by" uuid REFERENCES "public"."profiles"("user_id") ON DELETE SET NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    PRIMARY KEY ("id")
);

-- Enable RLS
ALTER TABLE "public"."transactions" ENABLE ROW LEVEL SECURITY;

-- Create policies (only admins can view/manage finances for now)
CREATE POLICY "Admins can view transactions" 
ON "public"."transactions" 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can insert transactions" 
ON "public"."transactions" 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can update transactions" 
ON "public"."transactions" 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

CREATE POLICY "Admins can delete transactions" 
ON "public"."transactions" 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.role = 'admin'
  )
);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE transactions;
