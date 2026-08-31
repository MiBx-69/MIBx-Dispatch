-- Enable Realtime for the orders table so the UI can auto-update
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
