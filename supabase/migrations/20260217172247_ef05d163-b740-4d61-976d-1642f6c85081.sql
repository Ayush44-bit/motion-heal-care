
-- Fix messages RLS: restrict to sender/receiver only
DROP POLICY "Allow insert messages" ON public.messages;
DROP POLICY "Allow read messages" ON public.messages;
DROP POLICY "Allow update read_at" ON public.messages;

CREATE POLICY "Users can insert own messages"
  ON public.messages FOR INSERT
  WITH CHECK (auth.uid()::text = sender_id);

CREATE POLICY "Users can read their messages"
  ON public.messages FOR SELECT
  USING (auth.uid()::text = sender_id OR auth.uid()::text = receiver_id);

CREATE POLICY "Receiver can mark as read"
  ON public.messages FOR UPDATE
  USING (auth.uid()::text = receiver_id);
