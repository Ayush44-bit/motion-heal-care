
-- Create messages table for chat
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id TEXT NOT NULL,
  receiver_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Since the app uses mock auth (not Supabase Auth), we use permissive policies
-- that filter by sender_id/receiver_id in application code
CREATE POLICY "Allow read messages" ON public.messages
  FOR SELECT USING (true);

CREATE POLICY "Allow insert messages" ON public.messages
  FOR INSERT WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
