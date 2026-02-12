
-- Add read_at column for read receipts
ALTER TABLE public.messages ADD COLUMN read_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Allow updating the read_at column
CREATE POLICY "Allow update read_at" ON public.messages
  FOR UPDATE USING (true) WITH CHECK (true);
