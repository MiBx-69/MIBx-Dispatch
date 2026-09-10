-- Enable Realtime for the orders table so the UI can auto-update
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE orders;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
