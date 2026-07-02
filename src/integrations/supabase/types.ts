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
      consent_records: {
        Row: {
          asset_id: string | null
          created_at: string
          creator_id: string
          document_url: string | null
          id: string
          kind: string
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
        ]
      }
      content_assets: {
        Row: {
          ai_generated_label: boolean
          approval_status: Database["public"]["Enums"]["approval_status"]
          asset_type: Database["public"]["Enums"]["asset_type"]
          category: string | null
          consent_status: Database["public"]["Enums"]["consent_status"]
          created_at: string
          creator_id: string
          external_url: string | null
          id: string
          is_synthetic: boolean
          moderation_status: Database["public"]["Enums"]["moderation_status"]
          price_cents: number
          storage_path: string | null
          title: string
          updated_at: string
        }
        Insert: {
          ai_generated_label?: boolean
          approval_status?: Database["public"]["Enums"]["approval_status"]
          asset_type: Database["public"]["Enums"]["asset_type"]
          category?: string | null
          consent_status?: Database["public"]["Enums"]["consent_status"]
          created_at?: string
          creator_id: string
          external_url?: string | null
          id?: string
          is_synthetic?: boolean
          moderation_status?: Database["public"]["Enums"]["moderation_status"]
          price_cents?: number
          storage_path?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          ai_generated_label?: boolean
          approval_status?: Database["public"]["Enums"]["approval_status"]
          asset_type?: Database["public"]["Enums"]["asset_type"]
          category?: string | null
          consent_status?: Database["public"]["Enums"]["consent_status"]
          created_at?: string
          creator_id?: string
          external_url?: string | null
          id?: string
          is_synthetic?: boolean
          moderation_status?: Database["public"]["Enums"]["moderation_status"]
          price_cents?: number
          storage_path?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_assets_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          creator_id: string
          fan_id: string
          id: string
          last_message_at: string
          persona_id: string
          started_at: string
        }
        Insert: {
          creator_id: string
          fan_id: string
          id?: string
          last_message_at?: string
          persona_id: string
          started_at?: string
        }
        Update: {
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
            foreignKeyName: "conversations_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
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
        ]
      }
      creators: {
        Row: {
          agency_id: string | null
          avatar_url: string | null
          bio: string | null
          cover_url: string | null
          created_at: string
          digital_twin_status: Database["public"]["Enums"]["twin_status"]
          handle: string
          id: string
          onboarding_completed_at: string | null
          payout_status: Database["public"]["Enums"]["payout_status"]
          stage_name: string
          updated_at: string
          user_id: string
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          agency_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          cover_url?: string | null
          created_at?: string
          digital_twin_status?: Database["public"]["Enums"]["twin_status"]
          handle: string
          id?: string
          onboarding_completed_at?: string | null
          payout_status?: Database["public"]["Enums"]["payout_status"]
          stage_name: string
          updated_at?: string
          user_id: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          agency_id?: string | null
          avatar_url?: string | null
          bio?: string | null
          cover_url?: string | null
          created_at?: string
          digital_twin_status?: Database["public"]["Enums"]["twin_status"]
          handle?: string
          id?: string
          onboarding_completed_at?: string | null
          payout_status?: Database["public"]["Enums"]["payout_status"]
          stage_name?: string
          updated_at?: string
          user_id?: string
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
          image_ok: boolean
          likeness_ok: boolean
          revoked_at: string | null
          signed_at: string | null
          updated_at: string
          video_ok: boolean
          voice_ok: boolean
        }
        Insert: {
          allowed_uses?: Json
          creator_id: string
          image_ok?: boolean
          likeness_ok?: boolean
          revoked_at?: string | null
          signed_at?: string | null
          updated_at?: string
          video_ok?: boolean
          voice_ok?: boolean
        }
        Update: {
          allowed_uses?: Json
          creator_id?: string
          image_ok?: boolean
          likeness_ok?: boolean
          revoked_at?: string | null
          signed_at?: string | null
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
        ]
      }
      messages: {
        Row: {
          ai_generated: boolean
          body: string
          conversation_id: string
          created_at: string
          id: string
          moderation_status: Database["public"]["Enums"]["moderation_status"]
          persona_id: string | null
          sender_type: Database["public"]["Enums"]["sender_type"]
        }
        Insert: {
          ai_generated?: boolean
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          moderation_status?: Database["public"]["Enums"]["moderation_status"]
          persona_id?: string | null
          sender_type: Database["public"]["Enums"]["sender_type"]
        }
        Update: {
          ai_generated?: boolean
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          moderation_status?: Database["public"]["Enums"]["moderation_status"]
          persona_id?: string | null
          sender_type?: Database["public"]["Enums"]["sender_type"]
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
      personas: {
        Row: {
          boundary_rules: Json
          cover_url: string | null
          created_at: string
          creator_id: string
          description: string | null
          disclosure_label: string
          display_name: string
          ends_at: string | null
          id: string
          is_default_seed: boolean
          is_explicit: boolean
          kind: Database["public"]["Enums"]["persona_kind"]
          price_cents: number
          slug: string
          sort_order: number
          starts_at: string | null
          system_prompt: string | null
          tone_rules: Json
          training_notes: Json
          updated_at: string
          visibility: Database["public"]["Enums"]["visibility"]
        }
        Insert: {
          boundary_rules?: Json
          cover_url?: string | null
          created_at?: string
          creator_id: string
          description?: string | null
          disclosure_label: string
          display_name: string
          ends_at?: string | null
          id?: string
          is_default_seed?: boolean
          is_explicit?: boolean
          kind: Database["public"]["Enums"]["persona_kind"]
          price_cents?: number
          slug: string
          sort_order?: number
          starts_at?: string | null
          system_prompt?: string | null
          tone_rules?: Json
          training_notes?: Json
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Update: {
          boundary_rules?: Json
          cover_url?: string | null
          created_at?: string
          creator_id?: string
          description?: string | null
          disclosure_label?: string
          display_name?: string
          ends_at?: string | null
          id?: string
          is_default_seed?: boolean
          is_explicit?: boolean
          kind?: Database["public"]["Enums"]["persona_kind"]
          price_cents?: number
          slug?: string
          sort_order?: number
          starts_at?: string | null
          system_prompt?: string | null
          tone_rules?: Json
          training_notes?: Json
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "personas_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          age_verified_at: string | null
          avatar_url: string | null
          country: string | null
          created_at: string
          date_of_birth: string | null
          display_name: string | null
          dob_attested_at: string | null
          explicit_content_opt_in: boolean
          handle: string | null
          id: string
          updated_at: string
        }
        Insert: {
          age_verified_at?: string | null
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          dob_attested_at?: string | null
          explicit_content_opt_in?: boolean
          handle?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          age_verified_at?: string | null
          avatar_url?: string | null
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          display_name?: string | null
          dob_attested_at?: string | null
          explicit_content_opt_in?: boolean
          handle?: string | null
          id?: string
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
          created_at: string
          creator_id: string
          current_period_end: string | null
          fan_id: string
          id: string
          provider_ref: string | null
          status: Database["public"]["Enums"]["sub_status"]
          tier: Database["public"]["Enums"]["sub_tier"]
        }
        Insert: {
          created_at?: string
          creator_id: string
          current_period_end?: string | null
          fan_id: string
          id?: string
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["sub_status"]
          tier?: Database["public"]["Enums"]["sub_tier"]
        }
        Update: {
          created_at?: string
          creator_id?: string
          current_period_end?: string | null
          fan_id?: string
          id?: string
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["sub_status"]
          tier?: Database["public"]["Enums"]["sub_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
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
          fan_id: string
          id: string
          kind: Database["public"]["Enums"]["tx_kind"]
          persona_id: string | null
          status: Database["public"]["Enums"]["tx_status"]
        }
        Insert: {
          amount_cents?: number
          asset_id?: string | null
          created_at?: string
          creator_id: string
          fan_id: string
          id?: string
          kind: Database["public"]["Enums"]["tx_kind"]
          persona_id?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
        }
        Update: {
          amount_cents?: number
          asset_id?: string | null
          created_at?: string
          creator_id?: string
          fan_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["tx_kind"]
          persona_id?: string | null
          status?: Database["public"]["Enums"]["tx_status"]
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
            foreignKeyName: "transactions_persona_id_fkey"
            columns: ["persona_id"]
            isOneToOne: false
            referencedRelation: "personas"
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_adult: { Args: { _user_id?: string }; Returns: boolean }
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
    }
    Enums: {
      app_role: "fan" | "creator" | "agency" | "admin"
      approval_status: "pending" | "approved" | "rejected"
      asset_type: "image" | "video" | "audio" | "text"
      consent_status: "n_a" | "on_file" | "missing"
      moderation_status: "clean" | "flagged" | "removed"
      payout_status: "none" | "pending" | "active"
      permission_type: "included" | "ppv" | "restricted"
      persona_kind: "real_me" | "ai"
      sender_type: "fan" | "ai" | "creator" | "system"
      sub_status: "active" | "canceled" | "paused"
      sub_tier: "free" | "base" | "plus" | "naughty" | "wicked" | "vip"
      twin_status: "none" | "pending" | "approved" | "revoked"
      tx_kind: "sub" | "ppv" | "tip" | "credits"
      tx_status: "stub" | "succeeded" | "failed"
      verification_status: "unverified" | "pending" | "verified" | "rejected"
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
      asset_type: ["image", "video", "audio", "text"],
      consent_status: ["n_a", "on_file", "missing"],
      moderation_status: ["clean", "flagged", "removed"],
      payout_status: ["none", "pending", "active"],
      permission_type: ["included", "ppv", "restricted"],
      persona_kind: ["real_me", "ai"],
      sender_type: ["fan", "ai", "creator", "system"],
      sub_status: ["active", "canceled", "paused"],
      sub_tier: ["free", "base", "plus", "naughty", "wicked", "vip"],
      twin_status: ["none", "pending", "approved", "revoked"],
      tx_kind: ["sub", "ppv", "tip", "credits"],
      tx_status: ["stub", "succeeded", "failed"],
      verification_status: ["unverified", "pending", "verified", "rejected"],
      visibility: ["draft", "public", "subscribers", "vip", "hidden"],
    },
  },
} as const
