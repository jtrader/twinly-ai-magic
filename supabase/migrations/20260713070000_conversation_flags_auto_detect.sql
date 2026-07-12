ALTER TYPE public.conversation_flag_reason ADD VALUE 'auto_high_severity';
ALTER TYPE public.conversation_flag_reason ADD VALUE 'auto_prompt_leak';

-- Nullable — only auto-detected flags carry a severity; supporter reports leave it null.
ALTER TABLE public.conversation_flags ADD COLUMN severity text;
