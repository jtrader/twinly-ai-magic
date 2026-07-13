export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      age_gate_events: {
        Row: {
          id: string
          method: string
          passed_at: string
          user_id: string
        }
        Insert: {
          id?: string
          method?: string
          passed_at?: string
          user_id: string
        }
        Update: {
          id?: string
          method?: string
          passed_at?: string
          user_id?: string
        }
        Relationships: []
      }
      agencies: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
        }
        Relationships: []
      }
      agency_creators: {
        Row: {
          agency_id: string
          created_at: string
          creator_id: string
          permissions: Json
        }
        Insert: {
          agency_id: string
          created_at?: string
          creator_id: string
          permissions?: Json
        }
        Update: {
          agency_id?: string
          created_at?: string
          creator_id?: string
          permissions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "agency_creators_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_creators_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_creators_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          metadata: Json
          subject_id: string | null
          subject_type: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          subject_id?: string | null
          subject_type?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          subject_id?: string | null
          subject_type?: string | null
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      consent_records: {
        Row: {
          asset_id: string | null
          created_at: string
          creator_id: string
          document_url: string | null
          id: string
          kind: string
          prev_hash: string | null
          record_hash: string | null
          revoked_at: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          creator_id: string
          document_url?: string | null
          id?: string
          kind: string
          prev_hash?: string | null
          record_hash?: string | null
          revoked_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          creator_id?: string
          document_url?: string | null
          id?: string
          kind?: string
          prev_hash?: string | null
          record_hash?: string | null
          revoked_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consent_records_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "content_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consent_records_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
        ]
      }
      content_assets: {
        Row: {
          ai_disclosure_required: boolean
          ai_generated_label: boolean
          approval_status: Database["public"]["Enums"]["approval_status"]
          asset_type: Database["public"]["Enums"]["asset_type"]
          byte_size: number | null
          category: string | null
          consent_status: Database["public"]["Enums"]["consent_status"]
          cost_cents: number | null
          created_at: string
          creator_id: string
          external_url: string | null
          id: string
          internal_label: Database["public"]["Enums"]["asset_internal_label"]
          is_synthetic: boolean
          moderation_status: Database["public"]["Enums"]["moderation_status"]
          price_cents: number
          provider: string | null
          provider_error: string | null
          provider_job_id: string | null
          provider_model: string | null
          provider_status: string | null
          render_completed_at: string | null
          render_started_at: string | null
          shared_across_personas: boolean
          source_type: Database["public"]["Enums"]["asset_source_type"]
          storage_path: string | null
          tags: string[]
          title: string
          updated_at: string
          usage_rights: string | null
          visibility: Database["public"]["Enums"]["asset_visibility"]
        }
        Insert: {
          ai_disclosure_required?: boolean
          ai_generated_label?: boolean
          approval_status?: Database["public"]["Enums"]["approval_status"]
          asset_type: Database["public"]["Enums"]["asset_type"]
          byte_size?: number | null
          category?: string | null
          consent_status?: Database["public"]["Enums"]["consent_status"]
          cost_cents?: number | null
          created_at?: string
          creator_id: string
          external_url?: string | null
          id?: string
          internal_label?: Database["public"]["Enums"]["asset_internal_label"]
          is_synthetic?: boolean
          moderation_status?: Database["public"]["Enums"]["moderation_status"]
          price_cents?: number
          provider?: string | null
          provider_error?: string | null
          provider_job_id?: string | null
          provider_model?: string | null
          provider_status?: string | null
          render_completed_at?: string | null
          render_started_at?: string | null
          shared_across_personas?: boolean
          source_type?: Database["public"]["Enums"]["asset_source_type"]
          storage_path?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          usage_rights?: string | null
          visibility?: Database["public"]["Enums"]["asset_visibility"]
        }
        Update: {
          ai_disclosure_required?: boolean
          ai_generated_label?: boolean
          approval_status?: Database["public"]["Enums"]["approval_status"]
          asset_type?: Database["public"]["Enums"]["asset_type"]
          byte_size?: number | null
          category?: string | null
          consent_status?: Database["public"]["Enums"]["consent_status"]
          cost_cents?: number | null
          created_at?: string
          creator_id?: string
          external_url?: string | null
          id?: string
          internal_label?: Database["public"]["Enums"]["asset_internal_label"]
          is_synthetic?: boolean
          moderation_status?: Database["public"]["Enums"]["moderation_status"]
          price_cents?: number
          provider?: string | null
          provider_error?: string | null
          provider_job_id?: string | null
          provider_model?: string | null
          provider_status?: string | null
          render_completed_at?: string | null
          render_started_at?: string | null
          shared_across_personas?: boolean
          source_type?: Database["public"]["Enums"]["asset_source_type"]
          storage_path?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          usage_rights?: string | null
          visibility?: Database["public"]["Enums"]["asset_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "content_assets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_assets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
        ]
      }
      content_pack_items: {
        Row: {
          added_at: string
          asset_id: string
          pack_id: string
          position: number
        }
        Insert: {
          added_at?: string
          asset_id: string
          pack_id: string
          position?: number
        }
        Update: {
          added_at?: string
          asset_id?: string
          pack_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_pack_items_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "content_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_pack_items_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "content_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      content_pack_personas: {
        Row: {
          attached_at: string
          pack_id: string
          permission_type: string
          persona_id: string
        }
        Insert: {
          attached_at?: string
          pack_id: string
          permission_type?: string
          persona_id: string
        }
        Update: {
          attached_at?: string
          pack_id?: string
          permission_type?: string
          persona_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_pack_personas_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "content_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_pack_personas_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      content_packs: {
        Row: {
          cover_asset_id: string | null
          created_at: string
          creator_id: string
          description: string | null
          ends_at: string | null
          id: string
          name: string
          pack_type: string
          review_feedback: string | null
          review_note: string | null
          reviewed_at: string | null
          slug: string
          sort_order: number
          starts_at: string | null
          status: string
          tags: string[]
          unlock_price_cents: number | null
          updated_at: string
        }
        Insert: {
          cover_asset_id?: string | null
          created_at?: string
          creator_id: string
          description?: string | null
          ends_at?: string | null
          id?: string
          name: string
          pack_type?: string
          review_feedback?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          slug: string
          sort_order?: number
          starts_at?: string | null
          status?: string
          tags?: string[]
          unlock_price_cents?: number | null
          updated_at?: string
        }
        Update: {
          cover_asset_id?: string | null
          created_at?: string
          creator_id?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          name?: string
          pack_type?: string
          review_feedback?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          slug?: string
          sort_order?: number
          starts_at?: string | null
          status?: string
          tags?: string[]
          unlock_price_cents?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_packs_cover_asset_id_fkey"
            columns: ["cover_asset_id"]
            isOneToOne: false
            referencedRelation: "content_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_packs_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_packs_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
        ]
      }
      content_unlocks: {
        Row: {
          amount_cents: number
          created_at: string
          creator_id: string
          currency: string
          environment: string
          id: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          unlockable_id: string
          unlockable_type: string
          user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          creator_id: string
          currency?: string
          environment?: string
          id?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          unlockable_id: string
          unlockable_type: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          creator_id?: string
          currency?: string
          environment?: string
          id?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          unlockable_id?: string
          unlockable_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_unlocks_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_unlocks_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_flags: {
        Row: {
          conversation_id: string
          created_at: string
          creator_id: string
          flagged_by: string
          handoff_conversation_id: string | null
          id: string
          message_id: string | null
          note: string | null
          persona_id: string
          reason: Database["public"]["Enums"]["conversation_flag_reason"]
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string | null
          status: Database["public"]["Enums"]["conversation_flag_status"]
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          creator_id: string
          flagged_by: string
          handoff_conversation_id?: string | null
          id?: string
          message_id?: string | null
          note?: string | null
          persona_id: string
          reason: Database["public"]["Enums"]["conversation_flag_reason"]
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          status?: Database["public"]["Enums"]["conversation_flag_status"]
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          creator_id?: string
          flagged_by?: string
          handoff_conversation_id?: string | null
          id?: string
          message_id?: string | null
          note?: string | null
          persona_id?: string
          reason?: Database["public"]["Enums"]["conversation_flag_reason"]
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string | null
          status?: Database["public"]["Enums"]["conversation_flag_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_flags_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_flags_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_flags_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_flags_handoff_conversation_id_fkey"
            columns: ["handoff_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_flags_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_flags_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_suspended: boolean
          creator_id: string
          fan_id: string
          id: string
          last_message_at: string
          persona_id: string
          started_at: string
        }
        Insert: {
          ai_suspended?: boolean
          creator_id: string
          fan_id: string
          id?: string
          last_message_at?: string
          persona_id: string
          started_at?: string
        }
        Update: {
          ai_suspended?: boolean
          creator_id?: string
          fan_id?: string
          id?: string
          last_message_at?: string
          persona_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_follows: {
        Row: {
          created_at: string
          creator_id: string
          fan_id: string
          favorite: boolean
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          fan_id: string
          favorite?: boolean
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          fan_id?: string
          favorite?: boolean
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_follows_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_follows_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_posts: {
        Row: {
          author_user_id: string
          body: string
          comment_count: number
          created_at: string
          creator_id: string
          id: string
          image_url: string | null
          is_removed: boolean
          like_count: number
          linked_pack_id: string | null
          linked_persona_id: string | null
          linked_poll_id: string | null
          removed_reason: string | null
          unlock_price_cents: number | null
          updated_at: string
        }
        Insert: {
          author_user_id: string
          body: string
          comment_count?: number
          created_at?: string
          creator_id: string
          id?: string
          image_url?: string | null
          is_removed?: boolean
          like_count?: number
          linked_pack_id?: string | null
          linked_persona_id?: string | null
          linked_poll_id?: string | null
          removed_reason?: string | null
          unlock_price_cents?: number | null
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          body?: string
          comment_count?: number
          created_at?: string
          creator_id?: string
          id?: string
          image_url?: string | null
          is_removed?: boolean
          like_count?: number
          linked_pack_id?: string | null
          linked_persona_id?: string | null
          linked_poll_id?: string | null
          removed_reason?: string | null
          unlock_price_cents?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_posts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_posts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_posts_linked_pack_id_fkey"
            columns: ["linked_pack_id"]
            isOneToOne: false
            referencedRelation: "content_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_posts_linked_persona_id_fkey"
            columns: ["linked_persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_posts_linked_poll_id_fkey"
            columns: ["linked_poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_tier_prices: {
        Row: {
          active: boolean
          amount_cents: number
          created_at: string
          creator_id: string
          currency: string
          id: string
          tier: Database["public"]["Enums"]["sub_tier"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount_cents: number
          created_at?: string
          creator_id: string
          currency?: string
          id?: string
          tier: Database["public"]["Enums"]["sub_tier"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount_cents?: number
          created_at?: string
          creator_id?: string
          currency?: string
          id?: string
          tier?: Database["public"]["Enums"]["sub_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_tier_prices_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_tier_prices_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_voice_profiles: {
        Row: {
          approved_phrases: string[]
          banned_phrases: string[]
          boundary_rules: Json
          creator_id: string
          sales_style: string | null
          tone_summary: string | null
          updated_at: string
          vocabulary_rules: Json
        }
        Insert: {
          approved_phrases?: string[]
          banned_phrases?: string[]
          boundary_rules?: Json
          creator_id: string
          sales_style?: string | null
          tone_summary?: string | null
          updated_at?: string
          vocabulary_rules?: Json
        }
        Update: {
          approved_phrases?: string[]
          banned_phrases?: string[]
          boundary_rules?: Json
          creator_id?: string
          sales_style?: string | null
          tone_summary?: string | null
          updated_at?: string
          vocabulary_rules?: Json
        }
        Relationships: [
          {
            foreignKeyName: "creator_voice_profiles_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_voice_profiles_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
        ]
      }
      creators: {
        Row: {
          agency_id: string | null
          avatar_url: string | null
          away_allow_ai_personas: boolean
          away_auto_reply_enabled: boolean
          away_message: string
          away_mode: boolean
          away_started_at: string | null
          bio: string | null
          content_persona_id: string | null
          cover_url: string | null
          created_at: string
          digital_twin_status: Database["public"]["Enums"]["twin_status"]
          elevenlabs_voice_cloned_at: string | null
          elevenlabs_voice_id: string | null
          elevenlabs_voice_requires_verification: boolean | null
          generation_spend_cap_cents: number | null
          handle: string
          id: string
          onboarding_completed_at: string | null
          payout_status: Database["public"]["Enums"]["payout_status"]
          stage_name: string
          style_notes: Json
          updated_at: string
          user_id: string
          venice_character_slug: string | null
          verification_provider: string | null
          verification_provider_ref: string | null
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          agency_id?: string | null
          avatar_url?: string | null
          away_allow_ai_personas?: boolean
          away_auto_reply_enabled?: boolean
          away_message?: string
          away_mode?: boolean
          away_started_at?: string | null
          bio?: string | null
          content_persona_id?: string | null
          cover_url?: string | null
          created_at?: string
          digital_twin_status?: Database["public"]["Enums"]["twin_status"]
          elevenlabs_voice_cloned_at?: string | null
          elevenlabs_voice_id?: string | null
          elevenlabs_voice_requires_verification?: boolean | null
          generation_spend_cap_cents?: number | null
          handle: string
          id?: string
          onboarding_completed_at?: string | null
          payout_status?: Database["public"]["Enums"]["payout_status"]
          stage_name: string
          style_notes?: Json
          updated_at?: string
          user_id: string
          venice_character_slug?: string | null
          verification_provider?: string | null
          verification_provider_ref?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          agency_id?: string | null
          avatar_url?: string | null
          away_allow_ai_personas?: boolean
          away_auto_reply_enabled?: boolean
          away_message?: string
          away_mode?: boolean
          away_started_at?: string | null
          bio?: string | null
          content_persona_id?: string | null
          cover_url?: string | null
          created_at?: string
          digital_twin_status?: Database["public"]["Enums"]["twin_status"]
          elevenlabs_voice_cloned_at?: string | null
          elevenlabs_voice_id?: string | null
          elevenlabs_voice_requires_verification?: boolean | null
          generation_spend_cap_cents?: number | null
          handle?: string
          id?: string
          onboarding_completed_at?: string | null
          payout_status?: Database["public"]["Enums"]["payout_status"]
          stage_name?: string
          style_notes?: Json
          updated_at?: string
          user_id?: string
          venice_character_slug?: string | null
          verification_provider?: string | null
          verification_provider_ref?: string | null
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "creators_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      digital_twin_consent: {
        Row: {
          allowed_uses: Json
          creator_id: string
          forbidden_uses: Json
          image_ok: boolean
          likeness_ok: boolean
          revoked_at: string | null
          signed_at: string | null
          training_consent_revoked_at: string | null
          training_consent_signed_at: string | null
          updated_at: string
          video_ok: boolean
          voice_ok: boolean
        }
        Insert: {
          allowed_uses?: Json
          creator_id: string
          forbidden_uses?: Json
          image_ok?: boolean
          likeness_ok?: boolean
          revoked_at?: string | null
          signed_at?: string | null
          training_consent_revoked_at?: string | null
          training_consent_signed_at?: string | null
          updated_at?: string
          video_ok?: boolean
          voice_ok?: boolean
        }
        Update: {
          allowed_uses?: Json
          creator_id?: string
          forbidden_uses?: Json
          image_ok?: boolean
          likeness_ok?: boolean
          revoked_at?: string | null
          signed_at?: string | null
          training_consent_revoked_at?: string | null
          training_consent_signed_at?: string | null
          updated_at?: string
          video_ok?: boolean
          voice_ok?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "digital_twin_consent_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "digital_twin_consent_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_requests: {
        Row: {
          creator_id: string
          expires_at: string
          from_persona_id: string
          id: string
          message: string | null
          price_cents: number
          requested_at: string
          resolved_at: string | null
          status: Database["public"]["Enums"]["escalation_status"]
          supporter_id: string
        }
        Insert: {
          creator_id: string
          expires_at?: string
          from_persona_id: string
          id?: string
          message?: string | null
          price_cents?: number
          requested_at?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["escalation_status"]
          supporter_id: string
        }
        Update: {
          creator_id?: string
          expires_at?: string
          from_persona_id?: string
          id?: string
          message?: string | null
          price_cents?: number
          requested_at?: string
          resolved_at?: string | null
          status?: Database["public"]["Enums"]["escalation_status"]
          supporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "escalation_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_requests_from_persona_id_fkey"
            columns: ["from_persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_item_visibility_overrides: {
        Row: {
          feed_post_id: string
          id: string
          overrides_default: boolean
          updated_at: string
          updated_by: string | null
          visibility: Database["public"]["Enums"]["feed_visibility_tier"]
        }
        Insert: {
          feed_post_id: string
          id?: string
          overrides_default?: boolean
          updated_at?: string
          updated_by?: string | null
          visibility: Database["public"]["Enums"]["feed_visibility_tier"]
        }
        Update: {
          feed_post_id?: string
          id?: string
          overrides_default?: boolean
          updated_at?: string
          updated_by?: string | null
          visibility?: Database["public"]["Enums"]["feed_visibility_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "feed_item_visibility_overrides_feed_post_id_fkey"
            columns: ["feed_post_id"]
            isOneToOne: true
            referencedRelation: "creator_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_visibility_audit_log: {
        Row: {
          actor_id: string
          actor_role: Database["public"]["Enums"]["app_role"]
          after_value: Json | null
          before_value: Json | null
          changed_at: string
          id: string
          target_id: string
          target_type: Database["public"]["Enums"]["feed_visibility_target_type"]
        }
        Insert: {
          actor_id: string
          actor_role: Database["public"]["Enums"]["app_role"]
          after_value?: Json | null
          before_value?: Json | null
          changed_at?: string
          id?: string
          target_id: string
          target_type: Database["public"]["Enums"]["feed_visibility_target_type"]
        }
        Update: {
          actor_id?: string
          actor_role?: Database["public"]["Enums"]["app_role"]
          after_value?: Json | null
          before_value?: Json | null
          changed_at?: string
          id?: string
          target_id?: string
          target_type?: Database["public"]["Enums"]["feed_visibility_target_type"]
        }
        Relationships: []
      }
      feed_visibility_policies: {
        Row: {
          default_visibility: Database["public"]["Enums"]["feed_visibility_tier"]
          id: string
          persona_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          default_visibility?: Database["public"]["Enums"]["feed_visibility_tier"]
          id?: string
          persona_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          default_visibility?: Database["public"]["Enums"]["feed_visibility_tier"]
          id?: string
          persona_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feed_visibility_policies_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: true
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      generation_requests: {
        Row: {
          created_at: string
          creator_id: string
          disclosure_label: string | null
          id: string
          output_type: Database["public"]["Enums"]["generation_output_type"]
          pack_id: string | null
          persona_id: string | null
          produced_asset_ids: string[]
          prompt_notes: string
          quantity: number
          regenerated_from_id: string | null
          regeneration_count: number
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
          status: Database["public"]["Enums"]["generation_request_status"]
          style_preset: string | null
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          disclosure_label?: string | null
          id?: string
          output_type: Database["public"]["Enums"]["generation_output_type"]
          pack_id?: string | null
          persona_id?: string | null
          produced_asset_ids?: string[]
          prompt_notes?: string
          quantity?: number
          regenerated_from_id?: string | null
          regeneration_count?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          status?: Database["public"]["Enums"]["generation_request_status"]
          style_preset?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          disclosure_label?: string | null
          id?: string
          output_type?: Database["public"]["Enums"]["generation_output_type"]
          pack_id?: string | null
          persona_id?: string | null
          produced_asset_ids?: string[]
          prompt_notes?: string
          quantity?: number
          regenerated_from_id?: string | null
          regeneration_count?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          status?: Database["public"]["Enums"]["generation_request_status"]
          style_preset?: string | null
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_requests_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "content_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_requests_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_requests_regenerated_from_id_fkey"
            columns: ["regenerated_from_id"]
            isOneToOne: false
            referencedRelation: "generation_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      identity_verifications: {
        Row: {
          created_at: string
          environment: string
          id: string
          provider: string
          provider_session_id: string
          status: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string
          environment: string
          id?: string
          provider?: string
          provider_session_id: string
          status?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string
          environment?: string
          id?: string
          provider?: string
          provider_session_id?: string
          status?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          ai_generated: boolean
          attachment_duration_ms: number | null
          attachment_kind: string | null
          attachment_url: string | null
          body: string
          conversation_id: string
          created_at: string
          id: string
          moderation_status: Database["public"]["Enums"]["moderation_status"]
          persona_id: string | null
          sender_type: Database["public"]["Enums"]["sender_type"]
          transcript: string | null
        }
        Insert: {
          ai_generated?: boolean
          attachment_duration_ms?: number | null
          attachment_kind?: string | null
          attachment_url?: string | null
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          moderation_status?: Database["public"]["Enums"]["moderation_status"]
          persona_id?: string | null
          sender_type: Database["public"]["Enums"]["sender_type"]
          transcript?: string | null
        }
        Update: {
          ai_generated?: boolean
          attachment_duration_ms?: number | null
          attachment_kind?: string | null
          attachment_url?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          moderation_status?: Database["public"]["Enums"]["moderation_status"]
          persona_id?: string | null
          sender_type?: Database["public"]["Enums"]["sender_type"]
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_events: {
        Row: {
          auto_flagged: boolean
          category: string
          created_at: string
          id: string
          notes: string | null
          reporter_id: string | null
          resolution: string | null
          severity: string
          status: string
          target_id: string | null
          target_type: string
        }
        Insert: {
          auto_flagged?: boolean
          category: string
          created_at?: string
          id?: string
          notes?: string | null
          reporter_id?: string | null
          resolution?: string | null
          severity?: string
          status?: string
          target_id?: string | null
          target_type: string
        }
        Update: {
          auto_flagged?: boolean
          category?: string
          created_at?: string
          id?: string
          notes?: string | null
          reporter_id?: string | null
          resolution?: string | null
          severity?: string
          status?: string
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          email_enabled: boolean
          escalation_updates: boolean
          in_app_enabled: boolean
          new_content: boolean
          persona_reply: boolean
          push_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          email_enabled?: boolean
          escalation_updates?: boolean
          in_app_enabled?: boolean
          new_content?: boolean
          persona_reply?: boolean
          push_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          email_enabled?: boolean
          escalation_updates?: boolean
          in_app_enabled?: boolean
          new_content?: boolean
          persona_reply?: boolean
          push_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_ai_generated: boolean
          link_path: string | null
          persona_id: string | null
          read_at: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_ai_generated?: boolean
          link_path?: string | null
          persona_id?: string | null
          read_at?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_ai_generated?: boolean
          link_path?: string | null
          persona_id?: string | null
          read_at?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_content_permissions: {
        Row: {
          asset_id: string
          created_at: string
          permission_type: Database["public"]["Enums"]["permission_type"]
          persona_id: string
        }
        Insert: {
          asset_id: string
          created_at?: string
          permission_type?: Database["public"]["Enums"]["permission_type"]
          persona_id: string
        }
        Update: {
          asset_id?: string
          created_at?: string
          permission_type?: Database["public"]["Enums"]["permission_type"]
          persona_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_content_permissions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "content_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_content_permissions_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          creator_id: string
          id: string
          invited_fan_id: string | null
          note: string | null
          persona_id: string
          revoked_at: string | null
          status: Database["public"]["Enums"]["persona_invite_status"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          creator_id: string
          id?: string
          invited_fan_id?: string | null
          note?: string | null
          persona_id: string
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["persona_invite_status"]
          token: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          creator_id?: string
          id?: string
          invited_fan_id?: string | null
          note?: string | null
          persona_id?: string
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["persona_invite_status"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_invites_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_invites_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_invites_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_memory: {
        Row: {
          created_at: string
          fan_id: string
          id: string
          message_count_at_summary: number
          persona_id: string
          summary: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fan_id: string
          id?: string
          message_count_at_summary?: number
          persona_id: string
          summary?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fan_id?: string
          id?: string
          message_count_at_summary?: number
          persona_id?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "persona_memory_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_onboarding_configs: {
        Row: {
          content_framework_choices: Json
          id: string
          opener_templates: string[]
          persona_id: string
          questionnaire_response_id: string | null
          status: Database["public"]["Enums"]["persona_onboarding_status"]
          tone_guidelines: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content_framework_choices?: Json
          id?: string
          opener_templates?: string[]
          persona_id: string
          questionnaire_response_id?: string | null
          status?: Database["public"]["Enums"]["persona_onboarding_status"]
          tone_guidelines?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content_framework_choices?: Json
          id?: string
          opener_templates?: string[]
          persona_id?: string
          questionnaire_response_id?: string | null
          status?: Database["public"]["Enums"]["persona_onboarding_status"]
          tone_guidelines?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "persona_onboarding_configs_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: true
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_onboarding_configs_questionnaire_response_id_fkey"
            columns: ["questionnaire_response_id"]
            isOneToOne: false
            referencedRelation: "persona_questionnaire_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_questionnaire_responses: {
        Row: {
          answers: Json
          created_at: string
          created_by: string | null
          id: string
          persona_id: string
          version: number
        }
        Insert: {
          answers?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          persona_id: string
          version: number
        }
        Update: {
          answers?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          persona_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "persona_questionnaire_responses_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_real_me_references: {
        Row: {
          created_at: string
          id: string
          persona_id: string
          real_me_profile_version_id: string
          synced_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          persona_id: string
          real_me_profile_version_id: string
          synced_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          persona_id?: string
          real_me_profile_version_id?: string
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "persona_real_me_references_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: true
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_real_me_references_real_me_profile_version_id_fkey"
            columns: ["real_me_profile_version_id"]
            isOneToOne: false
            referencedRelation: "real_me_profile_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      persona_saved_messages: {
        Row: {
          attachment_duration_ms: number | null
          attachment_url: string | null
          body: string | null
          created_at: string
          creator_id: string
          id: string
          kind: string
          label: string
          persona_id: string
          sort_order: number
          updated_at: string
          use_as_few_shot: boolean
        }
        Insert: {
          attachment_duration_ms?: number | null
          attachment_url?: string | null
          body?: string | null
          created_at?: string
          creator_id: string
          id?: string
          kind?: string
          label: string
          persona_id: string
          sort_order?: number
          updated_at?: string
          use_as_few_shot?: boolean
        }
        Update: {
          attachment_duration_ms?: number | null
          attachment_url?: string | null
          body?: string | null
          created_at?: string
          creator_id?: string
          id?: string
          kind?: string
          label?: string
          persona_id?: string
          sort_order?: number
          updated_at?: string
          use_as_few_shot?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "persona_saved_messages_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_saved_messages_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "persona_saved_messages_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      personas: {
        Row: {
          avatar_url: string | null
          boundary_rules: Json
          content_theme_overrides: Json
          cover_url: string | null
          created_at: string
          creator_id: string
          description: string | null
          disclosure_label: string
          display_name: string
          elevenlabs_voice_id: string | null
          ends_at: string | null
          explicitness_ceiling: Database["public"]["Enums"]["explicitness_level"]
          heygen_avatar_id: string | null
          heygen_voice_id: string | null
          id: string
          intro_video_asset_id: string | null
          intro_video_uploaded_at: string | null
          intro_video_url: string | null
          is_default_seed: boolean
          is_explicit: boolean
          kind: Database["public"]["Enums"]["persona_kind"]
          linked_twin_ref_ids: string[]
          memory_enabled: boolean
          persona_type: Database["public"]["Enums"]["persona_type"]
          price_cents: number
          require_id_verification: boolean
          slug: string
          sort_order: number
          starts_at: string | null
          system_prompt: string | null
          tone_rules: Json
          training_notes: Json
          tts_voice: string | null
          twin_link_mode: string
          updated_at: string
          use_cloned_voice: boolean
          venice_character_slug: string | null
          venice_chat_opt_in: boolean
          visibility: Database["public"]["Enums"]["visibility"]
          voice_reply_enabled: boolean
          voice_similarity_boost: number | null
          voice_stability: number | null
          voice_style: number | null
        }
        Insert: {
          avatar_url?: string | null
          boundary_rules?: Json
          content_theme_overrides?: Json
          cover_url?: string | null
          created_at?: string
          creator_id: string
          description?: string | null
          disclosure_label: string
          display_name: string
          elevenlabs_voice_id?: string | null
          ends_at?: string | null
          explicitness_ceiling?: Database["public"]["Enums"]["explicitness_level"]
          heygen_avatar_id?: string | null
          heygen_voice_id?: string | null
          id?: string
          intro_video_asset_id?: string | null
          intro_video_uploaded_at?: string | null
          intro_video_url?: string | null
          is_default_seed?: boolean
          is_explicit?: boolean
          kind: Database["public"]["Enums"]["persona_kind"]
          linked_twin_ref_ids?: string[]
          memory_enabled?: boolean
          persona_type?: Database["public"]["Enums"]["persona_type"]
          price_cents?: number
          require_id_verification?: boolean
          slug: string
          sort_order?: number
          starts_at?: string | null
          system_prompt?: string | null
          tone_rules?: Json
          training_notes?: Json
          tts_voice?: string | null
          twin_link_mode?: string
          updated_at?: string
          use_cloned_voice?: boolean
          venice_character_slug?: string | null
          venice_chat_opt_in?: boolean
          visibility?: Database["public"]["Enums"]["visibility"]
          voice_reply_enabled?: boolean
          voice_similarity_boost?: number | null
          voice_stability?: number | null
          voice_style?: number | null
        }
        Update: {
          avatar_url?: string | null
          boundary_rules?: Json
          content_theme_overrides?: Json
          cover_url?: string | null
          created_at?: string
          creator_id?: string
          description?: string | null
          disclosure_label?: string
          display_name?: string
          elevenlabs_voice_id?: string | null
          ends_at?: string | null
          explicitness_ceiling?: Database["public"]["Enums"]["explicitness_level"]
          heygen_avatar_id?: string | null
          heygen_voice_id?: string | null
          id?: string
          intro_video_asset_id?: string | null
          intro_video_uploaded_at?: string | null
          intro_video_url?: string | null
          is_default_seed?: boolean
          is_explicit?: boolean
          kind?: Database["public"]["Enums"]["persona_kind"]
          linked_twin_ref_ids?: string[]
          memory_enabled?: boolean
          persona_type?: Database["public"]["Enums"]["persona_type"]
          price_cents?: number
          require_id_verification?: boolean
          slug?: string
          sort_order?: number
          starts_at?: string | null
          system_prompt?: string | null
          tone_rules?: Json
          training_notes?: Json
          tts_voice?: string | null
          twin_link_mode?: string
          updated_at?: string
          use_cloned_voice?: boolean
          venice_character_slug?: string | null
          venice_chat_opt_in?: boolean
          visibility?: Database["public"]["Enums"]["visibility"]
          voice_reply_enabled?: boolean
          voice_similarity_boost?: number | null
          voice_stability?: number | null
          voice_style?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "personas_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personas_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "personas_intro_video_asset_id_fkey"
            columns: ["intro_video_asset_id"]
            isOneToOne: false
            referencedRelation: "content_assets"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          id: boolean
          max_explicitness_ceiling: Database["public"]["Enums"]["explicitness_level"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          max_explicitness_ceiling?: Database["public"]["Enums"]["explicitness_level"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          max_explicitness_ceiling?: Database["public"]["Enums"]["explicitness_level"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_subscriptions: {
        Row: {
          amount_cents: number | null
          cancel_at_period_end: boolean
          created_at: string
          currency: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          id: string
          price_id: string
          product_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents?: number | null
          cancel_at_period_end?: boolean
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id: string
          product_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number | null
          cancel_at_period_end?: boolean
          created_at?: string
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          id?: string
          price_id?: string
          product_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      poll_options: {
        Row: {
          display_order: number
          id: string
          label: string
          linked_tip_amount_usd: number | null
          poll_id: string
        }
        Insert: {
          display_order?: number
          id?: string
          label: string
          linked_tip_amount_usd?: number | null
          poll_id: string
        }
        Update: {
          display_order?: number
          id?: string
          label?: string
          linked_tip_amount_usd?: number | null
          poll_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "poll_options_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_responses: {
        Row: {
          created_at: string
          id: string
          poll_id: string
          poll_option_id: string
          poll_type: Database["public"]["Enums"]["poll_type"]
          supporter_id: string
          tip_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          poll_id: string
          poll_option_id: string
          poll_type: Database["public"]["Enums"]["poll_type"]
          supporter_id: string
          tip_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          poll_id?: string
          poll_option_id?: string
          poll_type?: Database["public"]["Enums"]["poll_type"]
          supporter_id?: string
          tip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "poll_responses_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "polls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_responses_poll_option_id_fkey"
            columns: ["poll_option_id"]
            isOneToOne: false
            referencedRelation: "poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_responses_tip_id_fkey"
            columns: ["tip_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          anonymous: boolean
          closes_at: string | null
          created_at: string
          creator_id: string
          id: string
          persona_id: string | null
          poll_type: Database["public"]["Enums"]["poll_type"]
          question: string
          results_visible_after_close: boolean
          status: Database["public"]["Enums"]["poll_status"]
          updated_at: string
          visibility: Database["public"]["Enums"]["feed_visibility_tier"]
        }
        Insert: {
          anonymous?: boolean
          closes_at?: string | null
          created_at?: string
          creator_id: string
          id?: string
          persona_id?: string | null
          poll_type: Database["public"]["Enums"]["poll_type"]
          question: string
          results_visible_after_close?: boolean
          status?: Database["public"]["Enums"]["poll_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["feed_visibility_tier"]
        }
        Update: {
          anonymous?: boolean
          closes_at?: string | null
          created_at?: string
          creator_id?: string
          id?: string
          persona_id?: string | null
          poll_type?: Database["public"]["Enums"]["poll_type"]
          question?: string
          results_visible_after_close?: boolean
          status?: Database["public"]["Enums"]["poll_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["feed_visibility_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "polls_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          id: string
          is_removed: boolean
          post_id: string
        }
        Insert: {
          author_user_id: string
          body: string
          created_at?: string
          id?: string
          is_removed?: boolean
          post_id: string
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          id?: string
          is_removed?: boolean
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "creator_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "creator_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age_verified_at: string | null
          avatar_url: string | null
          bio: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          dob_attested_at: string | null
          explicit_content_opt_in: boolean
          full_name: string | null
          handle: string | null
          id: string
          id_verified_at: string | null
          legal_accepted_at: string | null
          legal_accepted_version: string | null
          media_upload_consent_at: string | null
          media_upload_consent_version: string | null
          profile_completed_at: string | null
          strike_count: number
          updated_at: string
        }
        Insert: {
          age_verified_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          dob_attested_at?: string | null
          explicit_content_opt_in?: boolean
          full_name?: string | null
          handle?: string | null
          id: string
          id_verified_at?: string | null
          legal_accepted_at?: string | null
          legal_accepted_version?: string | null
          media_upload_consent_at?: string | null
          media_upload_consent_version?: string | null
          profile_completed_at?: string | null
          strike_count?: number
          updated_at?: string
        }
        Update: {
          age_verified_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          dob_attested_at?: string | null
          explicit_content_opt_in?: boolean
          full_name?: string | null
          handle?: string | null
          id?: string
          id_verified_at?: string | null
          legal_accepted_at?: string | null
          legal_accepted_version?: string | null
          media_upload_consent_at?: string | null
          media_upload_consent_version?: string | null
          profile_completed_at?: string | null
          strike_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      provider_data_handling_records: {
        Row: {
          contract_reference: string | null
          covers_creator_data: boolean | null
          covers_supporter_data: boolean | null
          created_at: string
          id: string
          next_review_due: string
          notes: string | null
          provider_name: string
          reviewed_at: string | null
          reviewed_by: string | null
          updated_at: string
          used_for_training: boolean | null
          zero_data_retention: boolean | null
        }
        Insert: {
          contract_reference?: string | null
          covers_creator_data?: boolean | null
          covers_supporter_data?: boolean | null
          created_at?: string
          id?: string
          next_review_due?: string
          notes?: string | null
          provider_name: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          used_for_training?: boolean | null
          zero_data_retention?: boolean | null
        }
        Update: {
          contract_reference?: string | null
          covers_creator_data?: boolean | null
          covers_supporter_data?: boolean | null
          created_at?: string
          id?: string
          next_review_due?: string
          notes?: string | null
          provider_name?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          updated_at?: string
          used_for_training?: boolean | null
          zero_data_retention?: boolean | null
        }
        Relationships: []
      }
      questionnaire_metatag_mappings: {
        Row: {
          confidence: number
          created_at: string
          field_path: string
          hard_policy_effect: Json
          id: string
          mapping_version: string
          output_namespace: string
          output_tag_id: string | null
          questionnaire_schema_version: string
          reviewed_at: string | null
          reviewed_by: string | null
          source_range_max: number | null
          source_range_min: number | null
          source_value: string | null
          state_contribution_json: Json
          status: string
          updated_at: string
        }
        Insert: {
          confidence: number
          created_at?: string
          field_path: string
          hard_policy_effect?: Json
          id?: string
          mapping_version: string
          output_namespace: string
          output_tag_id?: string | null
          questionnaire_schema_version: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_range_max?: number | null
          source_range_min?: number | null
          source_value?: string | null
          state_contribution_json?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          confidence?: number
          created_at?: string
          field_path?: string
          hard_policy_effect?: Json
          id?: string
          mapping_version?: string
          output_namespace?: string
          output_tag_id?: string | null
          questionnaire_schema_version?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_range_max?: number | null
          source_range_min?: number | null
          source_value?: string | null
          state_contribution_json?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          user_id: string
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          user_id: string
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      real_me_profile_versions: {
        Row: {
          completion_percentage: number
          created_at: string
          id: string
          real_me_profile_id: string
          responses: Json
          updated_at: string
          version_number: number
        }
        Insert: {
          completion_percentage?: number
          created_at?: string
          id?: string
          real_me_profile_id: string
          responses?: Json
          updated_at?: string
          version_number: number
        }
        Update: {
          completion_percentage?: number
          created_at?: string
          id?: string
          real_me_profile_id?: string
          responses?: Json
          updated_at?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "real_me_profile_versions_real_me_profile_id_fkey"
            columns: ["real_me_profile_id"]
            isOneToOne: false
            referencedRelation: "real_me_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      real_me_profiles: {
        Row: {
          created_at: string
          creator_id: string
          current_version: number
          current_version_id: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          current_version?: number
          current_version_id?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          current_version?: number
          current_version_id?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "real_me_profiles_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_me_profiles_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: true
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_me_profiles_current_version_id_fkey"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "real_me_profile_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      rsp_audit_events: {
        Row: {
          actor_id: string | null
          category_metadata: Json
          creator_id: string
          event_type: string
          id: string
          occurred_at: string
          purpose: string
          submission_id: string | null
        }
        Insert: {
          actor_id?: string | null
          category_metadata?: Json
          creator_id: string
          event_type: string
          id?: string
          occurred_at?: string
          purpose: string
          submission_id?: string | null
        }
        Update: {
          actor_id?: string | null
          category_metadata?: Json
          creator_id?: string
          event_type?: string
          id?: string
          occurred_at?: string
          purpose?: string
          submission_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rsp_audit_events_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_audit_events_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_audit_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "rsp_questionnaire_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      rsp_consent_receipts: {
        Row: {
          accepted_at: string
          adult_confirmed: boolean
          consent_version: string
          created_at: string
          id: string
          personalisation_allowed: boolean
          preferences_may_be_saved: boolean
          receipt_hash: string
          respectful_use_accepted: boolean
          submission_id: string
        }
        Insert: {
          accepted_at: string
          adult_confirmed: boolean
          consent_version: string
          created_at?: string
          id?: string
          personalisation_allowed: boolean
          preferences_may_be_saved: boolean
          receipt_hash: string
          respectful_use_accepted: boolean
          submission_id: string
        }
        Update: {
          accepted_at?: string
          adult_confirmed?: boolean
          consent_version?: string
          created_at?: string
          id?: string
          personalisation_allowed?: boolean
          preferences_may_be_saved?: boolean
          receipt_hash?: string
          respectful_use_accepted?: boolean
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsp_consent_receipts_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "rsp_questionnaire_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      rsp_curated_sequence_steps: {
        Row: {
          asset_id: string
          asset_version: number
          fallback_asset_id: string | null
          id: string
          journey_stage: string
          match_explanation: Json
          match_score: number
          position: number
          sequence_id: string
          transition_rules: Json
        }
        Insert: {
          asset_id: string
          asset_version: number
          fallback_asset_id?: string | null
          id?: string
          journey_stage: string
          match_explanation: Json
          match_score: number
          position: number
          sequence_id: string
          transition_rules: Json
        }
        Update: {
          asset_id?: string
          asset_version?: number
          fallback_asset_id?: string | null
          id?: string
          journey_stage?: string
          match_explanation?: Json
          match_score?: number
          position?: number
          sequence_id?: string
          transition_rules?: Json
        }
        Relationships: [
          {
            foreignKeyName: "rsp_curated_sequence_steps_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "rsp_curated_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      rsp_curated_sequences: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          creator_id: string
          expires_at: string
          id: string
          objective: string
          persona: string
          policy_hash: string
          profile_id: string
          relationship_stage: string
          runtime_rules: Json
          sequence_version: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          creator_id: string
          expires_at: string
          id?: string
          objective: string
          persona: string
          policy_hash: string
          profile_id: string
          relationship_stage: string
          runtime_rules: Json
          sequence_version: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          creator_id?: string
          expires_at?: string
          id?: string
          objective?: string
          persona?: string
          policy_hash?: string
          profile_id?: string
          relationship_stage?: string
          runtime_rules?: Json
          sequence_version?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsp_curated_sequences_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_curated_sequences_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_curated_sequences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "rsp_privacy_safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rsp_generated_briefs: {
        Row: {
          brief: Json
          brief_type: string
          created_at: string
          id: string
          schema_version: string
          sequence_id: string
          status: string
        }
        Insert: {
          brief: Json
          brief_type: string
          created_at?: string
          id?: string
          schema_version: string
          sequence_id: string
          status?: string
        }
        Update: {
          brief?: Json
          brief_type?: string
          created_at?: string
          id?: string
          schema_version?: string
          sequence_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsp_generated_briefs_sequence_id_fkey"
            columns: ["sequence_id"]
            isOneToOne: false
            referencedRelation: "rsp_curated_sequences"
            referencedColumns: ["id"]
          },
        ]
      }
      rsp_policy_envelopes: {
        Row: {
          active: boolean
          created_at: string
          creator_id: string
          envelope: Json
          expires_at: string
          id: string
          policy_hash: string
          policy_version: string
          submission_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          creator_id: string
          envelope: Json
          expires_at: string
          id?: string
          policy_hash: string
          policy_version: string
          submission_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          creator_id?: string
          envelope?: Json
          expires_at?: string
          id?: string
          policy_hash?: string
          policy_version?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsp_policy_envelopes_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_policy_envelopes_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_policy_envelopes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "rsp_questionnaire_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      rsp_privacy_safe_profiles: {
        Row: {
          created_at: string
          creator_id: string
          deleted_at: string | null
          expires_at: string
          id: string
          profile: Json
          profile_token: string | null
          profile_version: string
          submission_id: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          deleted_at?: string | null
          expires_at: string
          id?: string
          profile: Json
          profile_token?: string | null
          profile_version: string
          submission_id: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          deleted_at?: string | null
          expires_at?: string
          id?: string
          profile?: Json
          profile_token?: string | null
          profile_version?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsp_privacy_safe_profiles_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_privacy_safe_profiles_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_privacy_safe_profiles_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "rsp_questionnaire_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      rsp_questionnaire_submissions: {
        Row: {
          associated_data_hash: string
          authentication_tag: string
          ciphertext: string
          created_at: string
          creator_id: string
          deleted_at: string | null
          encryption_algorithm: string
          expires_at: string
          id: string
          key_version: string
          locale: string
          nonce: string
          processed_at: string | null
          questionnaire_version: string
          schema_version: string
          source: string
          status: string
          supporter_id: string
          wrap_authentication_tag: string
          wrap_nonce: string
          wrapped_data_key: string
        }
        Insert: {
          associated_data_hash: string
          authentication_tag: string
          ciphertext: string
          created_at?: string
          creator_id: string
          deleted_at?: string | null
          encryption_algorithm: string
          expires_at: string
          id?: string
          key_version: string
          locale: string
          nonce: string
          processed_at?: string | null
          questionnaire_version: string
          schema_version: string
          source: string
          status?: string
          supporter_id: string
          wrap_authentication_tag: string
          wrap_nonce: string
          wrapped_data_key: string
        }
        Update: {
          associated_data_hash?: string
          authentication_tag?: string
          ciphertext?: string
          created_at?: string
          creator_id?: string
          deleted_at?: string | null
          encryption_algorithm?: string
          expires_at?: string
          id?: string
          key_version?: string
          locale?: string
          nonce?: string
          processed_at?: string | null
          questionnaire_version?: string
          schema_version?: string
          source?: string
          status?: string
          supporter_id?: string
          wrap_authentication_tag?: string
          wrap_nonce?: string
          wrapped_data_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsp_questionnaire_submissions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_questionnaire_submissions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
        ]
      }
      rsp_retention_deletion_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          error_class: string | null
          id: string
          idempotency_key: string
          run_after: string
          status: string
          submission_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_class?: string | null
          id?: string
          idempotency_key: string
          run_after: string
          status?: string
          submission_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          error_class?: string | null
          id?: string
          idempotency_key?: string
          run_after?: string
          status?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsp_retention_deletion_jobs_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "rsp_questionnaire_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      rsp_state_profiles: {
        Row: {
          cluster_summaries: Json
          created_at: string
          id: string
          profile_id: string
          quality: Json
          state_version: string
          states: Json
        }
        Insert: {
          cluster_summaries: Json
          created_at?: string
          id?: string
          profile_id: string
          quality: Json
          state_version: string
          states: Json
        }
        Update: {
          cluster_summaries?: Json
          created_at?: string
          id?: string
          profile_id?: string
          quality?: Json
          state_version?: string
          states?: Json
        }
        Relationships: [
          {
            foreignKeyName: "rsp_state_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "rsp_privacy_safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rsp_vault_retrieval_requests: {
        Row: {
          created_at: string
          creator_id: string
          expires_at: string
          id: string
          policy_hash: string
          profile_id: string
          request_id: string
          request_projection: Json
          retrieval_version: string
          tag_schema_version: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          expires_at: string
          id?: string
          policy_hash: string
          profile_id: string
          request_id: string
          request_projection: Json
          retrieval_version: string
          tag_schema_version: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          expires_at?: string
          id?: string
          policy_hash?: string
          profile_id?: string
          request_id?: string
          request_projection?: Json
          retrieval_version?: string
          tag_schema_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsp_vault_retrieval_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_vault_retrieval_requests_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsp_vault_retrieval_requests_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "rsp_privacy_safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount_cents: number | null
          cancel_at_period_end: boolean
          created_at: string
          creator_id: string
          currency: string | null
          current_period_end: string | null
          current_period_start: string | null
          environment: string
          fan_id: string
          id: string
          provider_ref: string | null
          status: Database["public"]["Enums"]["sub_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: Database["public"]["Enums"]["sub_tier"]
          updated_at: string
        }
        Insert: {
          amount_cents?: number | null
          cancel_at_period_end?: boolean
          created_at?: string
          creator_id: string
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          fan_id: string
          id?: string
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["sub_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["sub_tier"]
          updated_at?: string
        }
        Update: {
          amount_cents?: number | null
          cancel_at_period_end?: boolean
          created_at?: string
          creator_id?: string
          currency?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          environment?: string
          fan_id?: string
          id?: string
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["sub_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: Database["public"]["Enums"]["sub_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
        ]
      }
      supporter_journey_profiles: {
        Row: {
          answers: Json
          chat_experience_brief: Json
          created_at: string
          creator_id: string
          creator_visible: boolean
          expires_at: string | null
          fan_id: string
          id: string
          persona_template: string
          status: string
          submitted_at: string | null
          tailored_content_brief: Json
          tier: Database["public"]["Enums"]["sub_tier"]
          updated_at: string
        }
        Insert: {
          answers?: Json
          chat_experience_brief?: Json
          created_at?: string
          creator_id: string
          creator_visible?: boolean
          expires_at?: string | null
          fan_id: string
          id?: string
          persona_template: string
          status?: string
          submitted_at?: string | null
          tailored_content_brief?: Json
          tier?: Database["public"]["Enums"]["sub_tier"]
          updated_at?: string
        }
        Update: {
          answers?: Json
          chat_experience_brief?: Json
          created_at?: string
          creator_id?: string
          creator_visible?: boolean
          expires_at?: string | null
          fan_id?: string
          id?: string
          persona_template?: string
          status?: string
          submitted_at?: string | null
          tailored_content_brief?: Json
          tier?: Database["public"]["Enums"]["sub_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supporter_journey_profiles_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supporter_journey_profiles_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_cents: number
          asset_id: string | null
          created_at: string
          creator_id: string
          environment: string
          fan_id: string
          id: string
          kind: Database["public"]["Enums"]["tx_kind"]
          persona_id: string | null
          status: Database["public"]["Enums"]["tx_status"]
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
        }
        Insert: {
          amount_cents?: number
          asset_id?: string | null
          created_at?: string
          creator_id: string
          environment?: string
          fan_id: string
          id?: string
          kind: Database["public"]["Enums"]["tx_kind"]
          persona_id?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Update: {
          amount_cents?: number
          asset_id?: string | null
          created_at?: string
          creator_id?: string
          environment?: string
          fan_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["tx_kind"]
          persona_id?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "content_assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
      twin_reference_assets: {
        Row: {
          created_at: string
          creator_id: string
          deleted_at: string | null
          id: string
          kind: Database["public"]["Enums"]["twin_ref_kind"]
          mime_type: string | null
          notes: string | null
          replaces_id: string | null
          review_note: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          slot_label: string | null
          sort_order: number
          storage_path: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id: string
          deleted_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["twin_ref_kind"]
          mime_type?: string | null
          notes?: string | null
          replaces_id?: string | null
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          slot_label?: string | null
          sort_order?: number
          storage_path: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string
          deleted_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["twin_ref_kind"]
          mime_type?: string | null
          notes?: string | null
          replaces_id?: string | null
          review_note?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          slot_label?: string | null
          sort_order?: number
          storage_path?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "twin_reference_assets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "twin_reference_assets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      voice_source_recordings: {
        Row: {
          consent_record_id: string | null
          created_at: string
          creator_id: string
          duration_seconds: number
          file_ref: string
          format: string
          id: string
          persona_id: string
          rejection_reason: string | null
          sample_rate: number
          source_type: Database["public"]["Enums"]["voice_source_type"]
          status: Database["public"]["Enums"]["voice_source_status"]
          submitted_for_clone_at: string | null
          updated_at: string
        }
        Insert: {
          consent_record_id?: string | null
          created_at?: string
          creator_id: string
          duration_seconds?: number
          file_ref: string
          format: string
          id?: string
          persona_id: string
          rejection_reason?: string | null
          sample_rate?: number
          source_type: Database["public"]["Enums"]["voice_source_type"]
          status?: Database["public"]["Enums"]["voice_source_status"]
          submitted_for_clone_at?: string | null
          updated_at?: string
        }
        Update: {
          consent_record_id?: string | null
          created_at?: string
          creator_id?: string
          duration_seconds?: number
          file_ref?: string
          format?: string
          id?: string
          persona_id?: string
          rejection_reason?: string | null
          sample_rate?: number
          source_type?: Database["public"]["Enums"]["voice_source_type"]
          status?: Database["public"]["Enums"]["voice_source_status"]
          submitted_for_clone_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_source_recordings_consent_record_id_fkey"
            columns: ["consent_record_id"]
            isOneToOne: false
            referencedRelation: "consent_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_source_recordings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_source_recordings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_source_recordings_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      creators_public: {
        Row: {
          avatar_url: string | null
          away_mode: boolean | null
          bio: string | null
          cover_url: string | null
          created_at: string | null
          handle: string | null
          id: string | null
          stage_name: string | null
          verification_status:
            | Database["public"]["Enums"]["verification_status"]
            | null
        }
        Insert: {
          avatar_url?: string | null
          away_mode?: boolean | null
          bio?: string | null
          cover_url?: string | null
          created_at?: string | null
          handle?: string | null
          id?: string | null
          stage_name?: string | null
          verification_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
        }
        Update: {
          avatar_url?: string | null
          away_mode?: boolean | null
          bio?: string | null
          cover_url?: string | null
          created_at?: string | null
          handle?: string | null
          id?: string | null
          stage_name?: string | null
          verification_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
        }
        Relationships: []
      }
      profiles_public: {
        Row: {
          avatar_url: string | null
          display_name: string | null
          id: string | null
        }
        Insert: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string | null
        }
        Update: {
          avatar_url?: string | null
          display_name?: string | null
          id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_manage_creator: { Args: { _creator_id: string }; Returns: boolean }
      check_rate_limit: {
        Args: { _bucket: string; _limit: number; _window_seconds: number }
        Returns: boolean
      }
      get_my_profile: {
        Args: never
        Returns: {
          age_verified_at: string | null
          avatar_url: string | null
          bio: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          dob_attested_at: string | null
          explicit_content_opt_in: boolean
          full_name: string | null
          handle: string | null
          id: string
          id_verified_at: string | null
          legal_accepted_at: string | null
          legal_accepted_version: string | null
          media_upload_consent_at: string | null
          media_upload_consent_version: string | null
          profile_completed_at: string | null
          strike_count: number
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_my_profile_status: {
        Args: never
        Returns: {
          age_verified_at: string
          profile_completed_at: string
        }[]
      }
      has_accepted_legal: {
        Args: { _min_version?: string; _user_id: string }
        Returns: boolean
      }
      has_creator_access: {
        Args: { _creator_id: string; _min_tier?: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_twinly_plus: { Args: { _user_id: string }; Returns: boolean }
      increment_strike_count: { Args: { _user_id: string }; Returns: number }
      is_adult: { Args: { _user_id?: string }; Returns: boolean }
      is_blocked: { Args: { _a: string; _b: string }; Returns: boolean }
      is_creator_owner: { Args: { _creator_id: string }; Returns: boolean }
      log_audit: {
        Args: {
          _action: string
          _metadata?: Json
          _subject_id?: string
          _subject_type?: string
        }
        Returns: undefined
      }
      screen_message: { Args: { _text: string }; Returns: string }
      verify_consent_ledger_integrity: {
        Args: { _creator_id: string }
        Returns: {
          ok: boolean
          record_id: string
        }[]
      }
    }
    Enums: {
      app_role: "fan" | "creator" | "agency" | "admin"
      approval_status: "pending" | "approved" | "rejected"
      asset_internal_label:
        | "real_upload"
        | "ai_draft"
        | "approved_synthetic"
        | "restricted"
        | "do_not_use"
      asset_source_type: "real_upload" | "ai_generated" | "edited" | "synthetic"
      asset_type: "image" | "video" | "audio" | "text"
      asset_visibility: "private" | "subscribers" | "vip" | "ppv" | "public"
      consent_status: "n_a" | "on_file" | "missing"
      content_theme:
        | "romantic_affection"
        | "flirtation_teasing"
        | "roleplay_fantasy"
        | "power_exchange"
        | "fetish_general"
        | "group_dynamics"
        | "exhibitionism_voyeurism"
        | "sensory_focus"
      conversation_flag_reason:
        | "off_tone"
        | "inaccurate"
        | "uncomfortable"
        | "wants_human"
        | "other"
        | "auto_high_severity"
        | "auto_prompt_leak"
      conversation_flag_status:
        | "open"
        | "acknowledged"
        | "handed_off"
        | "dismissed"
      escalation_status: "requested" | "accepted" | "declined" | "expired"
      explicitness_level: "sfw" | "suggestive" | "explicit"
      feed_visibility_target_type: "persona_default" | "feed_item_override"
      feed_visibility_tier: "public" | "logged_in" | "subscribers_only"
      generation_output_type:
        | "image"
        | "audio"
        | "video"
        | "talking_head"
        | "promo_banner"
      generation_request_status:
        | "draft"
        | "queued"
        | "generating"
        | "generated"
        | "needs_review"
        | "approved"
        | "rejected"
        | "published"
        | "failed"
      moderation_status: "clean" | "flagged" | "removed"
      notification_type:
        | "new_content"
        | "persona_reply"
        | "escalation_requested"
        | "escalation_accepted"
        | "escalation_declined"
        | "subscription_started"
        | "subscription_changed"
        | "subscription_ending"
        | "subscription_reactivated"
        | "new_subscriber"
        | "subscriber_changed"
        | "tip_sent"
        | "tip_received"
        | "unlock_purchased"
        | "content_unlocked"
        | "twinly_plus_active"
        | "twinly_plus_ended"
        | "poll_response"
        | "poll_closed"
      payout_status: "none" | "pending" | "active"
      permission_type: "included" | "ppv" | "restricted"
      persona_invite_status: "pending" | "accepted" | "revoked"
      persona_kind: "real_me" | "ai"
      persona_onboarding_status: "draft" | "published"
      persona_type: "real_me" | "nice" | "naughty" | "wicked" | "custom"
      poll_status: "draft" | "active" | "closed"
      poll_type: "single_choice" | "multi_choice" | "tip_to_vote"
      sender_type: "fan" | "ai" | "creator" | "system"
      sub_status: "active" | "canceled" | "paused"
      sub_tier: "free" | "base" | "plus" | "naughty" | "wicked" | "vip"
      twin_ref_kind: "identity_ref" | "voice_ref" | "style_ref"
      twin_status: "none" | "pending" | "approved" | "revoked"
      tx_kind: "sub" | "ppv" | "tip" | "credits"
      tx_status: "stub" | "succeeded" | "failed"
      verification_status:
        | "unverified"
        | "pending"
        | "verified"
        | "rejected"
        | "revoked"
      visibility:
        | "draft"
        | "public"
        | "subscribers"
        | "vip"
        | "hidden"
        | "invite_only"
      voice_source_status:
        | "pending_validation"
        | "validated"
        | "rejected"
        | "cloned"
      voice_source_type: "uploaded" | "recorded_in_app"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["fan", "creator", "agency", "admin"],
      approval_status: ["pending", "approved", "rejected"],
      asset_internal_label: [
        "real_upload",
        "ai_draft",
        "approved_synthetic",
        "restricted",
        "do_not_use",
      ],
      asset_source_type: ["real_upload", "ai_generated", "edited", "synthetic"],
      asset_type: ["image", "video", "audio", "text"],
      asset_visibility: ["private", "subscribers", "vip", "ppv", "public"],
      consent_status: ["n_a", "on_file", "missing"],
      content_theme: [
        "romantic_affection",
        "flirtation_teasing",
        "roleplay_fantasy",
        "power_exchange",
        "fetish_general",
        "group_dynamics",
        "exhibitionism_voyeurism",
        "sensory_focus",
      ],
      conversation_flag_reason: [
        "off_tone",
        "inaccurate",
        "uncomfortable",
        "wants_human",
        "other",
        "auto_high_severity",
        "auto_prompt_leak",
      ],
      conversation_flag_status: [
        "open",
        "acknowledged",
        "handed_off",
        "dismissed",
      ],
      escalation_status: ["requested", "accepted", "declined", "expired"],
      explicitness_level: ["sfw", "suggestive", "explicit"],
      feed_visibility_target_type: ["persona_default", "feed_item_override"],
      feed_visibility_tier: ["public", "logged_in", "subscribers_only"],
      generation_output_type: [
        "image",
        "audio",
        "video",
        "talking_head",
        "promo_banner",
      ],
      generation_request_status: [
        "draft",
        "queued",
        "generating",
        "generated",
        "needs_review",
        "approved",
        "rejected",
        "published",
        "failed",
      ],
      moderation_status: ["clean", "flagged", "removed"],
      notification_type: [
        "new_content",
        "persona_reply",
        "escalation_requested",
        "escalation_accepted",
        "escalation_declined",
        "subscription_started",
        "subscription_changed",
        "subscription_ending",
        "subscription_reactivated",
        "new_subscriber",
        "subscriber_changed",
        "tip_sent",
        "tip_received",
        "unlock_purchased",
        "content_unlocked",
        "twinly_plus_active",
        "twinly_plus_ended",
        "poll_response",
        "poll_closed",
      ],
      payout_status: ["none", "pending", "active"],
      permission_type: ["included", "ppv", "restricted"],
      persona_invite_status: ["pending", "accepted", "revoked"],
      persona_kind: ["real_me", "ai"],
      persona_onboarding_status: ["draft", "published"],
      persona_type: ["real_me", "nice", "naughty", "wicked", "custom"],
      poll_status: ["draft", "active", "closed"],
      poll_type: ["single_choice", "multi_choice", "tip_to_vote"],
      sender_type: ["fan", "ai", "creator", "system"],
      sub_status: ["active", "canceled", "paused"],
      sub_tier: ["free", "base", "plus", "naughty", "wicked", "vip"],
      twin_ref_kind: ["identity_ref", "voice_ref", "style_ref"],
      twin_status: ["none", "pending", "approved", "revoked"],
      tx_kind: ["sub", "ppv", "tip", "credits"],
      tx_status: ["stub", "succeeded", "failed"],
      verification_status: [
        "unverified",
        "pending",
        "verified",
        "rejected",
        "revoked",
      ],
      visibility: [
        "draft",
        "public",
        "subscribers",
        "vip",
        "hidden",
        "invite_only",
      ],
      voice_source_status: [
        "pending_validation",
        "validated",
        "rejected",
        "cloned",
      ],
      voice_source_type: ["uploaded", "recorded_in_app"],
    },
  },
} as const
