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
          generation_spend_cap_cents: number | null
          handle: string
          id: string
          onboarding_completed_at: string | null
          payout_status: Database["public"]["Enums"]["payout_status"]
          stage_name: string
          style_notes: Json
          updated_at: string
          user_id: string
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
          generation_spend_cap_cents?: number | null
          handle: string
          id?: string
          onboarding_completed_at?: string | null
          payout_status?: Database["public"]["Enums"]["payout_status"]
          stage_name: string
          style_notes?: Json
          updated_at?: string
          user_id: string
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
          generation_spend_cap_cents?: number | null
          handle?: string
          id?: string
          onboarding_completed_at?: string | null
          payout_status?: Database["public"]["Enums"]["payout_status"]
          stage_name?: string
          style_notes?: Json
          updated_at?: string
          user_id?: string
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
          cover_url: string | null
          created_at: string
          creator_id: string
          description: string | null
          disclosure_label: string
          display_name: string
          ends_at: string | null
          explicitness_ceiling: Database["public"]["Enums"]["explicitness_level"]
          heygen_avatar_id: string | null
          heygen_voice_id: string | null
          id: string
          is_default_seed: boolean
          is_explicit: boolean
          kind: Database["public"]["Enums"]["persona_kind"]
          linked_twin_ref_ids: string[]
          memory_enabled: boolean
          price_cents: number
          slug: string
          sort_order: number
          starts_at: string | null
          system_prompt: string | null
          tone_rules: Json
          training_notes: Json
          tts_voice: string | null
          twin_link_mode: string
          updated_at: string
          visibility: Database["public"]["Enums"]["visibility"]
          voice_reply_enabled: boolean
        }
        Insert: {
          avatar_url?: string | null
          boundary_rules?: Json
          cover_url?: string | null
          created_at?: string
          creator_id: string
          description?: string | null
          disclosure_label: string
          display_name: string
          ends_at?: string | null
          explicitness_ceiling?: Database["public"]["Enums"]["explicitness_level"]
          heygen_avatar_id?: string | null
          heygen_voice_id?: string | null
          id?: string
          is_default_seed?: boolean
          is_explicit?: boolean
          kind: Database["public"]["Enums"]["persona_kind"]
          linked_twin_ref_ids?: string[]
          memory_enabled?: boolean
          price_cents?: number
          slug: string
          sort_order?: number
          starts_at?: string | null
          system_prompt?: string | null
          tone_rules?: Json
          training_notes?: Json
          tts_voice?: string | null
          twin_link_mode?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
          voice_reply_enabled?: boolean
        }
        Update: {
          avatar_url?: string | null
          boundary_rules?: Json
          cover_url?: string | null
          created_at?: string
          creator_id?: string
          description?: string | null
          disclosure_label?: string
          display_name?: string
          ends_at?: string | null
          explicitness_ceiling?: Database["public"]["Enums"]["explicitness_level"]
          heygen_avatar_id?: string | null
          heygen_voice_id?: string | null
          id?: string
          is_default_seed?: boolean
          is_explicit?: boolean
          kind?: Database["public"]["Enums"]["persona_kind"]
          linked_twin_ref_ids?: string[]
          memory_enabled?: boolean
          price_cents?: number
          slug?: string
          sort_order?: number
          starts_at?: string | null
          system_prompt?: string | null
          tone_rules?: Json
          training_notes?: Json
          tts_voice?: string | null
          twin_link_mode?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
          voice_reply_enabled?: boolean
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
          profile_completed_at?: string | null
          strike_count?: number
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
      conversation_flag_reason:
        | "off_tone"
        | "inaccurate"
        | "uncomfortable"
        | "wants_human"
        | "other"
      conversation_flag_status:
        | "open"
        | "acknowledged"
        | "handed_off"
        | "dismissed"
      escalation_status: "requested" | "accepted" | "declined" | "expired"
      explicitness_level: "sfw" | "suggestive" | "explicit"
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
      payout_status: "none" | "pending" | "active"
      permission_type: "included" | "ppv" | "restricted"
      persona_kind: "real_me" | "ai"
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
      visibility: "draft" | "public" | "subscribers" | "vip" | "hidden"
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
      conversation_flag_reason: [
        "off_tone",
        "inaccurate",
        "uncomfortable",
        "wants_human",
        "other",
      ],
      conversation_flag_status: [
        "open",
        "acknowledged",
        "handed_off",
        "dismissed",
      ],
      escalation_status: ["requested", "accepted", "declined", "expired"],
      explicitness_level: ["sfw", "suggestive", "explicit"],
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
      ],
      payout_status: ["none", "pending", "active"],
      permission_type: ["included", "ppv", "restricted"],
      persona_kind: ["real_me", "ai"],
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
      visibility: ["draft", "public", "subscribers", "vip", "hidden"],
    },
  },
} as const
