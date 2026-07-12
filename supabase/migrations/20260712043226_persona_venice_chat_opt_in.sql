-- Venice AI chat-engine selection for AI personas. Gated on the persona's
-- existing explicitness_ceiling (not the persona_type label, which is just
-- a display name and can drift independently of the actual enforced
-- ceiling): 'explicit' ceiling personas always use Venice for chat replies
-- (mandatory — the default Lovable-gateway model is moderated and can't
-- produce that tier of content); 'suggestive' ceiling personas may opt in
-- via this flag; 'sfw' personas never use Venice for chat regardless of
-- this flag's value. See resolveChatEngine in venice.server.ts.
ALTER TABLE public.personas ADD COLUMN venice_chat_opt_in boolean NOT NULL DEFAULT false;
