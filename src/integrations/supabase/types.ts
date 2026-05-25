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
      alert_decisions: {
        Row: {
          alert_id: string | null
          api_score: number
          block_reason: string | null
          calendar_score: number
          category: string | null
          confidence_score: number
          country_code: string
          created_at: string
          decision: string
          dom_score: number
          id: string
          layer_details: Json | null
          playwright_score: number
          provider: string
          threshold: number
        }
        Insert: {
          alert_id?: string | null
          api_score?: number
          block_reason?: string | null
          calendar_score?: number
          category?: string | null
          confidence_score?: number
          country_code: string
          created_at?: string
          decision: string
          dom_score?: number
          id?: string
          layer_details?: Json | null
          playwright_score?: number
          provider: string
          threshold: number
        }
        Update: {
          alert_id?: string | null
          api_score?: number
          block_reason?: string | null
          calendar_score?: number
          category?: string | null
          confidence_score?: number
          country_code?: string
          created_at?: string
          decision?: string
          dom_score?: number
          id?: string
          layer_details?: Json | null
          playwright_score?: number
          provider?: string
          threshold?: number
        }
        Relationships: []
      }
      alert_dedup: {
        Row: {
          alert_type: string
          cooldown_until: string
          country_code: string
          dedup_key: string
          first_sent_at: string
          id: string
          last_sent_at: string
          metadata: Json | null
          provider: string
          send_count: number
        }
        Insert: {
          alert_type: string
          cooldown_until?: string
          country_code: string
          dedup_key: string
          first_sent_at?: string
          id?: string
          last_sent_at?: string
          metadata?: Json | null
          provider: string
          send_count?: number
        }
        Update: {
          alert_type?: string
          cooldown_until?: string
          country_code?: string
          dedup_key?: string
          first_sent_at?: string
          id?: string
          last_sent_at?: string
          metadata?: Json | null
          provider?: string
          send_count?: number
        }
        Relationships: []
      }
      alert_delivery_log: {
        Row: {
          alert_id: string | null
          attempts: number
          chat_id: string
          country_code: string | null
          delivered_at: string
          dispatched_at: string | null
          e2e_latency_ms: number | null
          enqueued_at: string
          error: string | null
          id: number
          priority: number
          provider: string | null
          success: boolean
          worker_id: string | null
        }
        Insert: {
          alert_id?: string | null
          attempts?: number
          chat_id: string
          country_code?: string | null
          delivered_at?: string
          dispatched_at?: string | null
          e2e_latency_ms?: number | null
          enqueued_at: string
          error?: string | null
          id?: number
          priority: number
          provider?: string | null
          success: boolean
          worker_id?: string | null
        }
        Update: {
          alert_id?: string | null
          attempts?: number
          chat_id?: string
          country_code?: string | null
          delivered_at?: string
          dispatched_at?: string | null
          e2e_latency_ms?: number | null
          enqueued_at?: string
          error?: string | null
          id?: number
          priority?: number
          provider?: string | null
          success?: boolean
          worker_id?: string | null
        }
        Relationships: []
      }
      alert_queue: {
        Row: {
          alert_key: string | null
          attempts: number
          chat_id: string
          claimed_at: string | null
          claimed_by: string | null
          country_code: string | null
          enqueued_at: string
          expires_at: string
          id: string
          last_error: string | null
          max_attempts: number
          payload: Json
          priority: number
          provider: string | null
          sent_at: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          alert_key?: string | null
          attempts?: number
          chat_id: string
          claimed_at?: string | null
          claimed_by?: string | null
          country_code?: string | null
          enqueued_at?: string
          expires_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          payload: Json
          priority?: number
          provider?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          alert_key?: string | null
          attempts?: number
          chat_id?: string
          claimed_at?: string | null
          claimed_by?: string | null
          country_code?: string | null
          enqueued_at?: string
          expires_at?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          provider?: string | null
          sent_at?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ban_events: {
        Row: {
          country_code: string
          detected_at: string
          http_status: number | null
          id: string
          provider: string
          reason: string
          retry_after_seconds: number | null
          severity: string
          snippet: string | null
          source_url: string | null
          worker_id: string | null
        }
        Insert: {
          country_code: string
          detected_at?: string
          http_status?: number | null
          id?: string
          provider: string
          reason: string
          retry_after_seconds?: number | null
          severity?: string
          snippet?: string | null
          source_url?: string | null
          worker_id?: string | null
        }
        Update: {
          country_code?: string
          detected_at?: string
          http_status?: number | null
          id?: string
          provider?: string
          reason?: string
          retry_after_seconds?: number | null
          severity?: string
          snippet?: string | null
          source_url?: string | null
          worker_id?: string | null
        }
        Relationships: []
      }
      bot_detection_events: {
        Row: {
          blocked_reason: string | null
          country_code: string
          detected_at: string
          detection_type: string
          fingerprint_used: Json | null
          html_snapshot_path: string | null
          http_status: number | null
          id: string
          page_text_snippet: string | null
          page_title: string | null
          provider: string
          proxy_used: string | null
          response_headers: Json | null
          screenshot_path: string | null
          severity: number
          url: string
          worker_id: string | null
        }
        Insert: {
          blocked_reason?: string | null
          country_code: string
          detected_at?: string
          detection_type: string
          fingerprint_used?: Json | null
          html_snapshot_path?: string | null
          http_status?: number | null
          id?: string
          page_text_snippet?: string | null
          page_title?: string | null
          provider: string
          proxy_used?: string | null
          response_headers?: Json | null
          screenshot_path?: string | null
          severity?: number
          url: string
          worker_id?: string | null
        }
        Update: {
          blocked_reason?: string | null
          country_code?: string
          detected_at?: string
          detection_type?: string
          fingerprint_used?: Json | null
          html_snapshot_path?: string | null
          http_status?: number | null
          id?: string
          page_text_snippet?: string | null
          page_title?: string | null
          provider?: string
          proxy_used?: string | null
          response_headers?: Json | null
          screenshot_path?: string | null
          severity?: number
          url?: string
          worker_id?: string | null
        }
        Relationships: []
      }
      browser_sessions: {
        Row: {
          country_code: string
          created_at: string
          expires_at: string | null
          fingerprint: Json | null
          id: string
          last_used_at: string | null
          provider: string
          proxy_label: string | null
          storage_state: Json
          user_agent: string | null
        }
        Insert: {
          country_code: string
          created_at?: string
          expires_at?: string | null
          fingerprint?: Json | null
          id?: string
          last_used_at?: string | null
          provider: string
          proxy_label?: string | null
          storage_state?: Json
          user_agent?: string | null
        }
        Update: {
          country_code?: string
          created_at?: string
          expires_at?: string | null
          fingerprint?: Json | null
          id?: string
          last_used_at?: string | null
          provider?: string
          proxy_label?: string | null
          storage_state?: Json
          user_agent?: string | null
        }
        Relationships: []
      }
      browser_verifications: {
        Row: {
          available_dates_count: number
          booking_buttons_count: number
          calendar_detected: boolean
          checked_at: string
          country_code: string
          created_at: string
          detection_details: Json | null
          error_message: string | null
          id: string
          load_time_ms: number | null
          no_appointments_text_found: boolean
          page_text_snippet: string | null
          provider: string
          screenshot_path: string | null
          status: string
          url: string
          user_agent: string | null
          worker_id: string | null
          xhr_requests: Json | null
        }
        Insert: {
          available_dates_count?: number
          booking_buttons_count?: number
          calendar_detected?: boolean
          checked_at?: string
          country_code: string
          created_at?: string
          detection_details?: Json | null
          error_message?: string | null
          id?: string
          load_time_ms?: number | null
          no_appointments_text_found?: boolean
          page_text_snippet?: string | null
          provider: string
          screenshot_path?: string | null
          status: string
          url: string
          user_agent?: string | null
          worker_id?: string | null
          xhr_requests?: Json | null
        }
        Update: {
          available_dates_count?: number
          booking_buttons_count?: number
          calendar_detected?: boolean
          checked_at?: string
          country_code?: string
          created_at?: string
          detection_details?: Json | null
          error_message?: string | null
          id?: string
          load_time_ms?: number | null
          no_appointments_text_found?: boolean
          page_text_snippet?: string | null
          provider?: string
          screenshot_path?: string | null
          status?: string
          url?: string
          user_agent?: string | null
          worker_id?: string | null
          xhr_requests?: Json | null
        }
        Relationships: []
      }
      browser_worker_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          last_used_at: string | null
          token_hash: string
          total_requests: number
          worker_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          token_hash: string
          total_requests?: number
          worker_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          token_hash?: string
          total_requests?: number
          worker_name?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_rate_limits: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      contact_message_replies: {
        Row: {
          body: string
          created_at: string
          id: string
          message_id: string
          read_at: string | null
          sender_id: string
          sender_role: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          message_id: string
          read_at?: string | null
          sender_id: string
          sender_role: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          message_id?: string
          read_at?: string | null
          sender_id?: string
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_message_replies_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "contact_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          message: string
          status: string
          subject: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          message: string
          status?: string
          subject: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          message?: string
          status?: string
          subject?: string
          user_id?: string | null
        }
        Relationships: []
      }
      detection_evidence: {
        Row: {
          check_id: string
          content: string | null
          country_code: string
          created_at: string
          evidence_type: string
          id: string
          metadata: Json | null
          provider: string
          url: string | null
        }
        Insert: {
          check_id: string
          content?: string | null
          country_code: string
          created_at?: string
          evidence_type: string
          id?: string
          metadata?: Json | null
          provider: string
          url?: string | null
        }
        Update: {
          check_id?: string
          content?: string | null
          country_code?: string
          created_at?: string
          evidence_type?: string
          id?: string
          metadata?: Json | null
          provider?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "detection_evidence_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "visa_monitor_checks"
            referencedColumns: ["id"]
          },
        ]
      }
      email_notifications: {
        Row: {
          created_at: string
          html_body: string
          id: string
          recipient_email: string
          recipient_name: string | null
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          created_at?: string
          html_body: string
          id?: string
          recipient_email: string
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          created_at?: string
          html_body?: string
          id?: string
          recipient_email?: string
          recipient_name?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: []
      }
      expiry_reminder_log: {
        Row: {
          created_at: string
          days_left: number
          email_error: string | null
          email_status: string
          expires_at: string
          id: string
          milestone_days: number
          package_name: string | null
          recipient_email: string | null
          recipient_name: string | null
          subscription_id: string
          telegram_chat_id: string | null
          telegram_error: string | null
          telegram_status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days_left: number
          email_error?: string | null
          email_status?: string
          expires_at: string
          id?: string
          milestone_days: number
          package_name?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          subscription_id: string
          telegram_chat_id?: string | null
          telegram_error?: string | null
          telegram_status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          days_left?: number
          email_error?: string | null
          email_status?: string
          expires_at?: string
          id?: string
          milestone_days?: number
          package_name?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          subscription_id?: string
          telegram_chat_id?: string | null
          telegram_error?: string | null
          telegram_status?: string
          user_id?: string
        }
        Relationships: []
      }
      false_positive_reports: {
        Row: {
          check_id: string | null
          country_code: string
          created_at: string
          id: string
          provider: string
          reason: string | null
          reported_by: string | null
          reporter_type: string
          resolved: boolean
        }
        Insert: {
          check_id?: string | null
          country_code: string
          created_at?: string
          id?: string
          provider: string
          reason?: string | null
          reported_by?: string | null
          reporter_type?: string
          resolved?: boolean
        }
        Update: {
          check_id?: string | null
          country_code?: string
          created_at?: string
          id?: string
          provider?: string
          reason?: string | null
          reported_by?: string | null
          reporter_type?: string
          resolved?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "false_positive_reports_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "visa_monitor_checks"
            referencedColumns: ["id"]
          },
        ]
      }
      monitored_telegram_sources: {
        Row: {
          added_by: string | null
          auto_broadcast: boolean
          category: string | null
          chat_id: string
          chat_type: string
          country_code: string | null
          created_at: string
          id: string
          is_active: boolean
          keywords: string[]
          last_post_at: string | null
          notes: string | null
          posts_captured: number
          title: string
          updated_at: string
          username: string | null
        }
        Insert: {
          added_by?: string | null
          auto_broadcast?: boolean
          category?: string | null
          chat_id: string
          chat_type?: string
          country_code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          keywords?: string[]
          last_post_at?: string | null
          notes?: string | null
          posts_captured?: number
          title: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          added_by?: string | null
          auto_broadcast?: boolean
          category?: string | null
          chat_id?: string
          chat_type?: string
          country_code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          keywords?: string[]
          last_post_at?: string | null
          notes?: string | null
          posts_captured?: number
          title?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          browser_notifications: boolean
          countries: string[]
          created_at: string
          digest_frequency: string
          id: string
          last_digest_sent_at: string | null
          preferred_language: string
          sound_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          browser_notifications?: boolean
          countries?: string[]
          created_at?: string
          digest_frequency?: string
          id?: string
          last_digest_sent_at?: string | null
          preferred_language?: string
          sound_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          browser_notifications?: boolean
          countries?: string[]
          created_at?: string
          digest_frequency?: string
          id?: string
          last_digest_sent_at?: string | null
          preferred_language?: string
          sound_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      outbound_webhooks: {
        Row: {
          countries: string[]
          created_at: string
          created_by: string | null
          event_types: string[]
          failure_count: number
          id: string
          is_active: boolean
          last_failure_at: string | null
          last_success_at: string | null
          name: string
          secret: string | null
          updated_at: string
          url: string
        }
        Insert: {
          countries?: string[]
          created_at?: string
          created_by?: string | null
          event_types?: string[]
          failure_count?: number
          id?: string
          is_active?: boolean
          last_failure_at?: string | null
          last_success_at?: string | null
          name: string
          secret?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          countries?: string[]
          created_at?: string
          created_by?: string | null
          event_types?: string[]
          failure_count?: number
          id?: string
          is_active?: boolean
          last_failure_at?: string | null
          last_success_at?: string | null
          name?: string
          secret?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      package_promo_audit_log: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string
          id: string
          input_method: string | null
          new_ends_at: string | null
          new_promo_price: number | null
          new_starts_at: string | null
          old_ends_at: string | null
          old_promo_price: number | null
          old_starts_at: string | null
          package_id: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string
          id?: string
          input_method?: string | null
          new_ends_at?: string | null
          new_promo_price?: number | null
          new_starts_at?: string | null
          old_ends_at?: string | null
          old_promo_price?: number | null
          old_starts_at?: string | null
          package_id: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          input_method?: string | null
          new_ends_at?: string | null
          new_promo_price?: number | null
          new_starts_at?: string | null
          old_ends_at?: string | null
          old_promo_price?: number | null
          old_starts_at?: string | null
          package_id?: string
        }
        Relationships: []
      }
      packages: {
        Row: {
          created_at: string
          duration_months: number
          features_ar: string[] | null
          id: string
          is_active: boolean
          is_golden: boolean
          max_countries: number
          name_ar: string
          name_en: string
          price: number | null
          promo_ends_at: string | null
          promo_price: number | null
          promo_starts_at: string | null
          service_type: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          duration_months: number
          features_ar?: string[] | null
          id?: string
          is_active?: boolean
          is_golden?: boolean
          max_countries?: number
          name_ar: string
          name_en: string
          price?: number | null
          promo_ends_at?: string | null
          promo_price?: number | null
          promo_starts_at?: string | null
          service_type?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          duration_months?: number
          features_ar?: string[] | null
          id?: string
          is_active?: boolean
          is_golden?: boolean
          max_countries?: number
          name_ar?: string
          name_en?: string
          price?: number | null
          promo_ends_at?: string | null
          promo_price?: number | null
          promo_starts_at?: string | null
          service_type?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          amount: number | null
          created_at: string
          currency: string | null
          event_type: string
          id: string
          message: string | null
          metadata: Json | null
          provider: string | null
          reference: string | null
          status: string
          subscription_id: string | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_type: string
          id?: string
          message?: string | null
          metadata?: Json | null
          provider?: string | null
          reference?: string | null
          status?: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          currency?: string | null
          event_type?: string
          id?: string
          message?: string | null
          metadata?: Json | null
          provider?: string | null
          reference?: string | null
          status?: string
          subscription_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      payment_settings: {
        Row: {
          account_holder: string
          ccp_key: string
          ccp_number: string
          id: string
          referred_bonus_days: number
          referrer_bonus_days: number
          rip_number: string
          updated_at: string
        }
        Insert: {
          account_holder?: string
          ccp_key?: string
          ccp_number?: string
          id?: string
          referred_bonus_days?: number
          referrer_bonus_days?: number
          rip_number?: string
          updated_at?: string
        }
        Update: {
          account_holder?: string
          ccp_key?: string
          ccp_number?: string
          id?: string
          referred_bonus_days?: number
          referrer_bonus_days?: number
          rip_number?: string
          updated_at?: string
        }
        Relationships: []
      }
      predictive_windows: {
        Row: {
          computed_at: string
          country_code: string
          hour: number
          id: string
          last_seen_at: string | null
          open_count: number
          provider: string
          score: number
          total_samples: number
          weekday: number
        }
        Insert: {
          computed_at?: string
          country_code: string
          hour: number
          id?: string
          last_seen_at?: string | null
          open_count?: number
          provider: string
          score?: number
          total_samples?: number
          weekday: number
        }
        Update: {
          computed_at?: string
          country_code?: string
          hour?: number
          id?: string
          last_seen_at?: string | null
          open_count?: number
          provider?: string
          score?: number
          total_samples?: number
          weekday?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          referral_code: string | null
          telegram_id: string | null
          telegram_link_expires_at: string | null
          telegram_link_token: string | null
          telegram_linked_at: string | null
          telegram_username: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          referral_code?: string | null
          telegram_id?: string | null
          telegram_link_expires_at?: string | null
          telegram_link_token?: string | null
          telegram_linked_at?: string | null
          telegram_username?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          referral_code?: string | null
          telegram_id?: string | null
          telegram_link_expires_at?: string | null
          telegram_link_token?: string | null
          telegram_linked_at?: string | null
          telegram_username?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      provider_adapters_config: {
        Row: {
          confidence_weights: Json
          display_name: string
          id: string
          is_active: boolean
          notes: string | null
          provider: string
          rate_limit_per_minute: number
          signal_thresholds: Json
          updated_at: string
          use_render: boolean
        }
        Insert: {
          confidence_weights?: Json
          display_name: string
          id?: string
          is_active?: boolean
          notes?: string | null
          provider: string
          rate_limit_per_minute?: number
          signal_thresholds?: Json
          updated_at?: string
          use_render?: boolean
        }
        Update: {
          confidence_weights?: Json
          display_name?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          provider?: string
          rate_limit_per_minute?: number
          signal_thresholds?: Json
          updated_at?: string
          use_render?: boolean
        }
        Relationships: []
      }
      provider_center_changes: {
        Row: {
          center_name: string
          change_type: string
          country_code: string
          detected_at: string
          id: string
          new_centers: string[] | null
          previous_centers: string[] | null
          provider: string
        }
        Insert: {
          center_name: string
          change_type: string
          country_code: string
          detected_at?: string
          id?: string
          new_centers?: string[] | null
          previous_centers?: string[] | null
          provider: string
        }
        Update: {
          center_name?: string
          change_type?: string
          country_code?: string
          detected_at?: string
          id?: string
          new_centers?: string[] | null
          previous_centers?: string[] | null
          provider?: string
        }
        Relationships: []
      }
      provider_centers: {
        Row: {
          centers: string[]
          country_code: string
          created_at: string
          id: string
          last_checked_at: string | null
          provider: string
          source_url: string | null
          updated_at: string
        }
        Insert: {
          centers?: string[]
          country_code: string
          created_at?: string
          id?: string
          last_checked_at?: string | null
          provider: string
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          centers?: string[]
          country_code?: string
          created_at?: string
          id?: string
          last_checked_at?: string | null
          provider?: string
          source_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      provider_risk_scores: {
        Row: {
          block_rate: number
          captcha_rate: number
          last_event_at: string | null
          provider: string
          recommended_interval_seconds: number
          risk_score: number
          throttle_until: string | null
          updated_at: string
        }
        Insert: {
          block_rate?: number
          captcha_rate?: number
          last_event_at?: string | null
          provider: string
          recommended_interval_seconds?: number
          risk_score?: number
          throttle_until?: string | null
          updated_at?: string
        }
        Update: {
          block_rate?: number
          captcha_rate?: number
          last_event_at?: string | null
          provider?: string
          recommended_interval_seconds?: number
          risk_score?: number
          throttle_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      provider_throttle: {
        Row: {
          consecutive_blocks: number
          cooldown_until: string | null
          current_backoff_minutes: number
          last_block_at: string | null
          last_reason: string | null
          last_success_at: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          consecutive_blocks?: number
          cooldown_until?: string | null
          current_backoff_minutes?: number
          last_block_at?: string | null
          last_reason?: string | null
          last_success_at?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          consecutive_blocks?: number
          cooldown_until?: string | null
          current_backoff_minutes?: number
          last_block_at?: string | null
          last_reason?: string | null
          last_success_at?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      proxy_endpoints: {
        Row: {
          auto_disabled_at: string | null
          avg_latency_ms: number | null
          ban_probability: number
          block_count: number
          captcha_count: number
          consecutive_failures: number
          cooldown_until: string | null
          created_at: string
          disabled_reason: string | null
          failure_count: number
          geo_city: string | null
          geo_country: string | null
          host: string
          id: string
          last_block_at: string | null
          last_captcha_at: string | null
          last_error: string | null
          last_failure_at: string | null
          last_success_at: string | null
          last_used_at: string | null
          notes: string | null
          password: string | null
          pool_id: string
          port: number
          protocol: string
          score: number
          status: string
          success_count: number
          total_requests: number
          updated_at: string
          username: string | null
        }
        Insert: {
          auto_disabled_at?: string | null
          avg_latency_ms?: number | null
          ban_probability?: number
          block_count?: number
          captcha_count?: number
          consecutive_failures?: number
          cooldown_until?: string | null
          created_at?: string
          disabled_reason?: string | null
          failure_count?: number
          geo_city?: string | null
          geo_country?: string | null
          host: string
          id?: string
          last_block_at?: string | null
          last_captcha_at?: string | null
          last_error?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          last_used_at?: string | null
          notes?: string | null
          password?: string | null
          pool_id: string
          port: number
          protocol?: string
          score?: number
          status?: string
          success_count?: number
          total_requests?: number
          updated_at?: string
          username?: string | null
        }
        Update: {
          auto_disabled_at?: string | null
          avg_latency_ms?: number | null
          ban_probability?: number
          block_count?: number
          captcha_count?: number
          consecutive_failures?: number
          cooldown_until?: string | null
          created_at?: string
          disabled_reason?: string | null
          failure_count?: number
          geo_city?: string | null
          geo_country?: string | null
          host?: string
          id?: string
          last_block_at?: string | null
          last_captcha_at?: string | null
          last_error?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          last_used_at?: string | null
          notes?: string | null
          password?: string | null
          pool_id?: string
          port?: number
          protocol?: string
          score?: number
          status?: string
          success_count?: number
          total_requests?: number
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proxy_endpoints_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "proxy_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      proxy_health: {
        Row: {
          captcha_count: number
          cooldown_until: string | null
          created_at: string
          failure_count: number
          id: string
          last_error: string | null
          last_used_at: string | null
          provider: string
          proxy_label: string
          status: string
          success_count: number
          updated_at: string
        }
        Insert: {
          captcha_count?: number
          cooldown_until?: string | null
          created_at?: string
          failure_count?: number
          id?: string
          last_error?: string | null
          last_used_at?: string | null
          provider: string
          proxy_label: string
          status?: string
          success_count?: number
          updated_at?: string
        }
        Update: {
          captcha_count?: number
          cooldown_until?: string | null
          created_at?: string
          failure_count?: number
          id?: string
          last_error?: string | null
          last_used_at?: string | null
          provider?: string
          proxy_label?: string
          status?: string
          success_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      proxy_health_log: {
        Row: {
          checked_at: string
          error_message: string | null
          id: number
          latency_ms: number | null
          provider: string | null
          proxy_id: string
          status_code: number | null
          success: boolean
          test_url: string | null
          used_for: string | null
          was_block: boolean
          was_captcha: boolean
        }
        Insert: {
          checked_at?: string
          error_message?: string | null
          id?: number
          latency_ms?: number | null
          provider?: string | null
          proxy_id: string
          status_code?: number | null
          success: boolean
          test_url?: string | null
          used_for?: string | null
          was_block?: boolean
          was_captcha?: boolean
        }
        Update: {
          checked_at?: string
          error_message?: string | null
          id?: number
          latency_ms?: number | null
          provider?: string | null
          proxy_id?: string
          status_code?: number | null
          success?: boolean
          test_url?: string | null
          used_for?: string | null
          was_block?: boolean
          was_captcha?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "proxy_health_log_proxy_id_fkey"
            columns: ["proxy_id"]
            isOneToOne: false
            referencedRelation: "proxy_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      proxy_pools: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          pool_type: string
          provider: string | null
          rotation_strategy: string
          target_countries: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          pool_type?: string
          provider?: string | null
          rotation_strategy?: string
          target_countries?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          pool_type?: string
          provider?: string | null
          rotation_strategy?: string
          target_countries?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      proxy_provider_affinity: {
        Row: {
          affinity_score: number
          block_count: number
          captcha_count: number
          failure_count: number
          id: string
          last_used_at: string | null
          provider: string
          proxy_id: string
          success_count: number
          updated_at: string
        }
        Insert: {
          affinity_score?: number
          block_count?: number
          captcha_count?: number
          failure_count?: number
          id?: string
          last_used_at?: string | null
          provider: string
          proxy_id: string
          success_count?: number
          updated_at?: string
        }
        Update: {
          affinity_score?: number
          block_count?: number
          captcha_count?: number
          failure_count?: number
          id?: string
          last_used_at?: string | null
          provider?: string
          proxy_id?: string
          success_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "proxy_provider_affinity_proxy_id_fkey"
            columns: ["proxy_id"]
            isOneToOne: false
            referencedRelation: "proxy_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          countries: string[]
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          countries?: string[]
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          countries?: string[]
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_reward_log: {
        Row: {
          action: string
          bonus_days: number
          created_at: string
          extension_applied: boolean
          id: string
          notes: string | null
          performed_by: string
          referral_id: string
          reward_type: string
          target_user_id: string
        }
        Insert: {
          action: string
          bonus_days?: number
          created_at?: string
          extension_applied?: boolean
          id?: string
          notes?: string | null
          performed_by: string
          referral_id: string
          reward_type: string
          target_user_id: string
        }
        Update: {
          action?: string
          bonus_days?: number
          created_at?: string
          extension_applied?: boolean
          id?: string
          notes?: string | null
          performed_by?: string
          referral_id?: string
          reward_type?: string
          target_user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referred_bonus_days: number
          referred_id: string
          referred_rewarded: boolean
          referrer_bonus_days: number
          referrer_id: string
          referrer_rewarded: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          referred_bonus_days?: number
          referred_id: string
          referred_rewarded?: boolean
          referrer_bonus_days?: number
          referrer_id: string
          referrer_rewarded?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          referred_bonus_days?: number
          referred_id?: string
          referred_rewarded?: boolean
          referrer_bonus_days?: number
          referrer_id?: string
          referrer_rewarded?: boolean
        }
        Relationships: []
      }
      reviews: {
        Row: {
          center_name: string | null
          country_code: string
          created_at: string
          id: string
          is_approved: boolean
          rating: number
          review_text: string
          updated_at: string
          user_id: string
          visa_status: string
        }
        Insert: {
          center_name?: string | null
          country_code: string
          created_at?: string
          id?: string
          is_approved?: boolean
          rating: number
          review_text: string
          updated_at?: string
          user_id: string
          visa_status?: string
        }
        Update: {
          center_name?: string | null
          country_code?: string
          created_at?: string
          id?: string
          is_approved?: boolean
          rating?: number
          review_text?: string
          updated_at?: string
          user_id?: string
          visa_status?: string
        }
        Relationships: []
      }
      scan_priorities: {
        Row: {
          ban_detected_count: number
          base_interval_seconds: number
          consecutive_failures: number
          cooldown_until: string | null
          country_code: string
          current_interval_seconds: number
          id: string
          last_scanned_at: string | null
          priority: string
          updated_at: string
        }
        Insert: {
          ban_detected_count?: number
          base_interval_seconds?: number
          consecutive_failures?: number
          cooldown_until?: string | null
          country_code: string
          current_interval_seconds?: number
          id?: string
          last_scanned_at?: string | null
          priority?: string
          updated_at?: string
        }
        Update: {
          ban_detected_count?: number
          base_interval_seconds?: number
          consecutive_failures?: number
          cooldown_until?: string | null
          country_code?: string
          current_interval_seconds?: number
          id?: string
          last_scanned_at?: string | null
          priority?: string
          updated_at?: string
        }
        Relationships: []
      }
      scan_shards: {
        Row: {
          countries: string[]
          created_at: string
          id: string
          is_active: boolean
          providers: string[]
          shard_key: string
          strategy: string
          weight: number
        }
        Insert: {
          countries?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          providers?: string[]
          shard_key: string
          strategy?: string
          weight?: number
        }
        Update: {
          countries?: string[]
          created_at?: string
          id?: string
          is_active?: boolean
          providers?: string[]
          shard_key?: string
          strategy?: string
          weight?: number
        }
        Relationships: []
      }
      scan_tasks: {
        Row: {
          attempts: number
          category: string | null
          claimed_at: string | null
          claimed_by: string | null
          country_code: string
          enqueued_at: string
          error: string | null
          expires_at: string
          finished_at: string | null
          id: string
          is_burst: boolean
          latency_ms: number | null
          priority: number
          provider: string | null
          shard_key: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          category?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          country_code: string
          enqueued_at?: string
          error?: string | null
          expires_at?: string
          finished_at?: string | null
          id?: string
          is_burst?: boolean
          latency_ms?: number | null
          priority?: number
          provider?: string | null
          shard_key?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          category?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          country_code?: string
          enqueued_at?: string
          error?: string | null
          expires_at?: string
          finished_at?: string | null
          id?: string
          is_burst?: boolean
          latency_ms?: number | null
          priority?: number
          provider?: string | null
          shard_key?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: []
      }
      scan_workers: {
        Row: {
          current_load: number
          id: string
          last_heartbeat: string
          max_concurrency: number
          region: string | null
          started_at: string
          status: string
          tasks_completed: number
          tasks_failed: number
          worker_id: string
        }
        Insert: {
          current_load?: number
          id?: string
          last_heartbeat?: string
          max_concurrency?: number
          region?: string | null
          started_at?: string
          status?: string
          tasks_completed?: number
          tasks_failed?: number
          worker_id: string
        }
        Update: {
          current_load?: number
          id?: string
          last_heartbeat?: string
          max_concurrency?: number
          region?: string | null
          started_at?: string
          status?: string
          tasks_completed?: number
          tasks_failed?: number
          worker_id?: string
        }
        Relationships: []
      }
      settings_audit_log: {
        Row: {
          changed_by: string
          created_at: string
          id: string
          new_referred_days: number | null
          new_referrer_days: number | null
          old_referred_days: number | null
          old_referrer_days: number | null
          setting_name: string
        }
        Insert: {
          changed_by: string
          created_at?: string
          id?: string
          new_referred_days?: number | null
          new_referrer_days?: number | null
          old_referred_days?: number | null
          old_referrer_days?: number | null
          setting_name?: string
        }
        Update: {
          changed_by?: string
          created_at?: string
          id?: string
          new_referred_days?: number | null
          new_referrer_days?: number | null
          old_referred_days?: number | null
          old_referrer_days?: number | null
          setting_name?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      subscription_requests: {
        Row: {
          admin_notes: string | null
          ai_fraud_detected: boolean | null
          ai_verification_result: Json | null
          countries: string[]
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_auto_renewal: boolean
          moderator_action: string | null
          moderator_action_at: string | null
          moderator_id: string | null
          monitoring_scopes: Json
          package_id: string
          phone: string | null
          receipt_url: string | null
          renewing_subscription_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          service_type: string
          status: string
          telegram_chat_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          ai_fraud_detected?: boolean | null
          ai_verification_result?: Json | null
          countries?: string[]
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          is_auto_renewal?: boolean
          moderator_action?: string | null
          moderator_action_at?: string | null
          moderator_id?: string | null
          monitoring_scopes?: Json
          package_id: string
          phone?: string | null
          receipt_url?: string | null
          renewing_subscription_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_type?: string
          status?: string
          telegram_chat_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          ai_fraud_detected?: boolean | null
          ai_verification_result?: Json | null
          countries?: string[]
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_auto_renewal?: boolean
          moderator_action?: string | null
          moderator_action_at?: string | null
          moderator_id?: string | null
          monitoring_scopes?: Json
          package_id?: string
          phone?: string | null
          receipt_url?: string | null
          renewing_subscription_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_type?: string
          status?: string
          telegram_chat_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_requests_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_requests_renewing_subscription_id_fkey"
            columns: ["renewing_subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          auto_renew: boolean
          countries: string[]
          created_at: string
          expires_at: string
          id: string
          monitoring_scopes: Json
          package_id: string
          renewal_request_created_at: string | null
          service_type: string
          starts_at: string
          status: string
          telegram_chat_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_renew?: boolean
          countries?: string[]
          created_at?: string
          expires_at: string
          id?: string
          monitoring_scopes?: Json
          package_id: string
          renewal_request_created_at?: string | null
          service_type?: string
          starts_at?: string
          status?: string
          telegram_chat_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_renew?: boolean
          countries?: string[]
          created_at?: string
          expires_at?: string
          id?: string
          monitoring_scopes?: Json
          package_id?: string
          renewal_request_created_at?: string | null
          service_type?: string
          starts_at?: string
          status?: string
          telegram_chat_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_admin_messages: {
        Row: {
          batch_id: string | null
          chat_id: string
          created_at: string
          error_message: string | null
          id: string
          message: string
          recipient_label: string | null
          recipient_user_id: string | null
          sender_id: string
          status: string
          telegram_message_id: number | null
          template_id: string | null
        }
        Insert: {
          batch_id?: string | null
          chat_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          message: string
          recipient_label?: string | null
          recipient_user_id?: string | null
          sender_id: string
          status?: string
          telegram_message_id?: number | null
          template_id?: string | null
        }
        Update: {
          batch_id?: string | null
          chat_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message?: string
          recipient_label?: string | null
          recipient_user_id?: string | null
          sender_id?: string
          status?: string
          telegram_message_id?: number | null
          template_id?: string | null
        }
        Relationships: []
      }
      telegram_bot_state: {
        Row: {
          id: number
          update_offset: number
          updated_at: string
        }
        Insert: {
          id: number
          update_offset?: number
          updated_at?: string
        }
        Update: {
          id?: number
          update_offset?: number
          updated_at?: string
        }
        Relationships: []
      }
      telegram_channel_posts: {
        Row: {
          broadcast_signal_id: string | null
          broadcasted: boolean
          chat_id: string
          created_at: string
          detected_category: string | null
          detected_country: string | null
          id: string
          is_signal: boolean
          matched_keywords: string[]
          message_id: number
          posted_at: string
          raw: Json | null
          source_id: string | null
          text: string | null
        }
        Insert: {
          broadcast_signal_id?: string | null
          broadcasted?: boolean
          chat_id: string
          created_at?: string
          detected_category?: string | null
          detected_country?: string | null
          id?: string
          is_signal?: boolean
          matched_keywords?: string[]
          message_id: number
          posted_at?: string
          raw?: Json | null
          source_id?: string | null
          text?: string | null
        }
        Update: {
          broadcast_signal_id?: string | null
          broadcasted?: boolean
          chat_id?: string
          created_at?: string
          detected_category?: string | null
          detected_country?: string | null
          id?: string
          is_signal?: boolean
          matched_keywords?: string[]
          message_id?: number
          posted_at?: string
          raw?: Json | null
          source_id?: string | null
          text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "telegram_channel_posts_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "monitored_telegram_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_failure_alerts: {
        Row: {
          alerted_at: string
          failure_count: number
          id: string
          last_error: string | null
          notified_admin_count: number
          threshold: number
          user_id: string
          window_minutes: number
        }
        Insert: {
          alerted_at?: string
          failure_count: number
          id?: string
          last_error?: string | null
          notified_admin_count?: number
          threshold: number
          user_id: string
          window_minutes: number
        }
        Update: {
          alerted_at?: string
          failure_count?: number
          id?: string
          last_error?: string | null
          notified_admin_count?: number
          threshold?: number
          user_id?: string
          window_minutes?: number
        }
        Relationships: []
      }
      telegram_link_log: {
        Row: {
          action: string
          chat_id: string | null
          created_at: string
          error_message: string | null
          id: string
          source: string | null
          status: string
          user_id: string
          username: string | null
        }
        Insert: {
          action: string
          chat_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          source?: string | null
          status?: string
          user_id: string
          username?: string | null
        }
        Update: {
          action?: string
          chat_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          source?: string | null
          status?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      user_devices: {
        Row: {
          browser: string | null
          created_at: string
          device_fingerprint: string
          device_name: string | null
          id: string
          ip_address: string | null
          is_active: boolean
          last_active_at: string
          os: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string
          device_fingerprint: string
          device_name?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean
          last_active_at?: string
          os?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string
          device_fingerprint?: string
          device_name?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean
          last_active_at?: string
          os?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      visa_appointments: {
        Row: {
          appointment_date: string
          appointment_time: string | null
          appointment_type: string
          booking_url: string | null
          center_name: string | null
          country_code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          notes: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          appointment_date: string
          appointment_time?: string | null
          appointment_type: string
          booking_url?: string | null
          center_name?: string | null
          country_code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          appointment_date?: string
          appointment_time?: string | null
          appointment_type?: string
          booking_url?: string | null
          center_name?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      visa_content_signals: {
        Row: {
          captured_at: string
          category: string
          center_name: string | null
          centers_open: string[] | null
          country_code: string
          earliest_date: string | null
          extracted_dates: Json | null
          id: string
          provider: string
          raw_signal: Json | null
          signal_hash: string
          slot_count: number | null
        }
        Insert: {
          captured_at?: string
          category?: string
          center_name?: string | null
          centers_open?: string[] | null
          country_code: string
          earliest_date?: string | null
          extracted_dates?: Json | null
          id?: string
          provider: string
          raw_signal?: Json | null
          signal_hash: string
          slot_count?: number | null
        }
        Update: {
          captured_at?: string
          category?: string
          center_name?: string | null
          centers_open?: string[] | null
          country_code?: string
          earliest_date?: string | null
          extracted_dates?: Json | null
          id?: string
          provider?: string
          raw_signal?: Json | null
          signal_hash?: string
          slot_count?: number | null
        }
        Relationships: []
      }
      visa_early_signals: {
        Row: {
          category: string
          center_name: string | null
          confidence: number
          confirmed: boolean | null
          confirmed_at: string | null
          country_code: string
          created_at: string
          details: Json | null
          id: string
          notified_count: number | null
          provider: string
          signal_type: string
        }
        Insert: {
          category?: string
          center_name?: string | null
          confidence?: number
          confirmed?: boolean | null
          confirmed_at?: string | null
          country_code: string
          created_at?: string
          details?: Json | null
          id?: string
          notified_count?: number | null
          provider: string
          signal_type: string
        }
        Update: {
          category?: string
          center_name?: string | null
          confidence?: number
          confirmed?: boolean | null
          confirmed_at?: string | null
          country_code?: string
          created_at?: string
          details?: Json | null
          id?: string
          notified_count?: number | null
          provider?: string
          signal_type?: string
        }
        Relationships: []
      }
      visa_external_signals: {
        Row: {
          broadcast_error: string | null
          broadcast_status: string
          broadcasted_at: string | null
          category: string | null
          country_code: string
          created_at: string
          id: string
          message_ar: string | null
          posted_by: string
          recipients_count: number
          source: string | null
          source_url: string | null
          status: string
          title_ar: string
        }
        Insert: {
          broadcast_error?: string | null
          broadcast_status?: string
          broadcasted_at?: string | null
          category?: string | null
          country_code: string
          created_at?: string
          id?: string
          message_ar?: string | null
          posted_by: string
          recipients_count?: number
          source?: string | null
          source_url?: string | null
          status?: string
          title_ar: string
        }
        Update: {
          broadcast_error?: string | null
          broadcast_status?: string
          broadcasted_at?: string | null
          category?: string | null
          country_code?: string
          created_at?: string
          id?: string
          message_ar?: string | null
          posted_by?: string
          recipients_count?: number
          source?: string | null
          source_url?: string | null
          status?: string
          title_ar?: string
        }
        Relationships: []
      }
      visa_monitor_checks: {
        Row: {
          category: string
          center_name: string | null
          checked_at: string
          confidence_score: number | null
          country_code: string
          detection_method: string | null
          earliest_date: string | null
          error_message: string | null
          extracted_dates: Json | null
          id: string
          notified: boolean
          previous_status: string | null
          provider: string
          response_snippet: string | null
          signal_breakdown: Json | null
          slot_count: number | null
          status: string
          worker_id: string | null
        }
        Insert: {
          category?: string
          center_name?: string | null
          checked_at?: string
          confidence_score?: number | null
          country_code: string
          detection_method?: string | null
          earliest_date?: string | null
          error_message?: string | null
          extracted_dates?: Json | null
          id?: string
          notified?: boolean
          previous_status?: string | null
          provider: string
          response_snippet?: string | null
          signal_breakdown?: Json | null
          slot_count?: number | null
          status?: string
          worker_id?: string | null
        }
        Update: {
          category?: string
          center_name?: string | null
          checked_at?: string
          confidence_score?: number | null
          country_code?: string
          detection_method?: string | null
          earliest_date?: string | null
          error_message?: string | null
          extracted_dates?: Json | null
          id?: string
          notified?: boolean
          previous_status?: string | null
          provider?: string
          response_snippet?: string | null
          signal_breakdown?: Json | null
          slot_count?: number | null
          status?: string
          worker_id?: string | null
        }
        Relationships: []
      }
      visa_notifications: {
        Row: {
          category: string
          country_code: string
          created_at: string
          id: string
          message_ar: string
          sent_by: string | null
          sent_count: number
        }
        Insert: {
          category?: string
          country_code: string
          created_at?: string
          id?: string
          message_ar: string
          sent_by?: string | null
          sent_count?: number
        }
        Update: {
          category?: string
          country_code?: string
          created_at?: string
          id?: string
          message_ar?: string
          sent_by?: string | null
          sent_count?: number
        }
        Relationships: []
      }
      visa_open_events: {
        Row: {
          category: string | null
          center_name: string | null
          closed_at: string | null
          country_code: string
          created_at: string
          detection_method: string | null
          duration_minutes: number | null
          earliest_date: string | null
          extracted_dates: Json | null
          id: string
          opened_at: string
          previous_status: string | null
          provider: string
          response_snippet: string | null
          source_check_id: string | null
        }
        Insert: {
          category?: string | null
          center_name?: string | null
          closed_at?: string | null
          country_code: string
          created_at?: string
          detection_method?: string | null
          duration_minutes?: number | null
          earliest_date?: string | null
          extracted_dates?: Json | null
          id?: string
          opened_at?: string
          previous_status?: string | null
          provider: string
          response_snippet?: string | null
          source_check_id?: string | null
        }
        Update: {
          category?: string | null
          center_name?: string | null
          closed_at?: string | null
          country_code?: string
          created_at?: string
          detection_method?: string | null
          duration_minutes?: number | null
          earliest_date?: string | null
          extracted_dates?: Json | null
          id?: string
          opened_at?: string
          previous_status?: string | null
          provider?: string
          response_snippet?: string | null
          source_check_id?: string | null
        }
        Relationships: []
      }
      visa_profiles: {
        Row: {
          address: string | null
          birth_date: string | null
          birth_place: string | null
          children_count: number | null
          children_details: string | null
          city: string | null
          created_at: string
          destination_country: string | null
          duration_days: number | null
          email: string | null
          employer_address: string | null
          employer_name: string | null
          employer_phone: string | null
          father_name: string | null
          full_name_ar: string | null
          full_name_latin: string | null
          gender: string | null
          hotel_or_host: string | null
          id: string
          is_primary: boolean
          marital_status: string | null
          monthly_income: string | null
          mother_name: string | null
          national_id: string | null
          nationality: string | null
          notes: string | null
          passport_expiry_date: string | null
          passport_issue_date: string | null
          passport_issue_place: string | null
          passport_number: string | null
          phone: string | null
          postal_code: string | null
          profession: string | null
          profile_label: string
          return_date: string | null
          spouse_name: string | null
          travel_date: string | null
          travel_purpose: string | null
          updated_at: string
          user_id: string
          wilaya: string | null
        }
        Insert: {
          address?: string | null
          birth_date?: string | null
          birth_place?: string | null
          children_count?: number | null
          children_details?: string | null
          city?: string | null
          created_at?: string
          destination_country?: string | null
          duration_days?: number | null
          email?: string | null
          employer_address?: string | null
          employer_name?: string | null
          employer_phone?: string | null
          father_name?: string | null
          full_name_ar?: string | null
          full_name_latin?: string | null
          gender?: string | null
          hotel_or_host?: string | null
          id?: string
          is_primary?: boolean
          marital_status?: string | null
          monthly_income?: string | null
          mother_name?: string | null
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          passport_expiry_date?: string | null
          passport_issue_date?: string | null
          passport_issue_place?: string | null
          passport_number?: string | null
          phone?: string | null
          postal_code?: string | null
          profession?: string | null
          profile_label?: string
          return_date?: string | null
          spouse_name?: string | null
          travel_date?: string | null
          travel_purpose?: string | null
          updated_at?: string
          user_id: string
          wilaya?: string | null
        }
        Update: {
          address?: string | null
          birth_date?: string | null
          birth_place?: string | null
          children_count?: number | null
          children_details?: string | null
          city?: string | null
          created_at?: string
          destination_country?: string | null
          duration_days?: number | null
          email?: string | null
          employer_address?: string | null
          employer_name?: string | null
          employer_phone?: string | null
          father_name?: string | null
          full_name_ar?: string | null
          full_name_latin?: string | null
          gender?: string | null
          hotel_or_host?: string | null
          id?: string
          is_primary?: boolean
          marital_status?: string | null
          monthly_income?: string | null
          mother_name?: string | null
          national_id?: string | null
          nationality?: string | null
          notes?: string | null
          passport_expiry_date?: string | null
          passport_issue_date?: string | null
          passport_issue_place?: string | null
          passport_number?: string | null
          phone?: string | null
          postal_code?: string | null
          profession?: string | null
          profile_label?: string
          return_date?: string | null
          spouse_name?: string | null
          travel_date?: string | null
          travel_purpose?: string | null
          updated_at?: string
          user_id?: string
          wilaya?: string | null
        }
        Relationships: []
      }
      webhook_delivery_log: {
        Row: {
          attempt_count: number
          delivered_at: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          response_body: string | null
          response_status: number | null
          success: boolean
          webhook_id: string
        }
        Insert: {
          attempt_count?: number
          delivered_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          payload: Json
          response_body?: string | null
          response_status?: number | null
          success?: boolean
          webhook_id: string
        }
        Update: {
          attempt_count?: number
          delivered_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          success?: boolean
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_delivery_log_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "outbound_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_health: {
        Row: {
          checks_attempted: number
          checks_failed: number
          checks_succeeded: number
          created_at: string
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          metadata: Json | null
          started_at: string
          status: string
          worker_id: string
        }
        Insert: {
          checks_attempted?: number
          checks_failed?: number
          checks_succeeded?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json | null
          started_at?: string
          status?: string
          worker_id: string
        }
        Update: {
          checks_attempted?: number
          checks_failed?: number
          checks_succeeded?: number
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          metadata?: Json | null
          started_at?: string
          status?: string
          worker_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      subscription_requests_moderator_view: {
        Row: {
          countries: string[] | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
          moderator_action: string | null
          moderator_action_at: string | null
          moderator_id: string | null
          package_id: string | null
          phone: string | null
          receipt_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          service_type: string | null
          status: string | null
          telegram_chat_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          countries?: string[] | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          moderator_action?: string | null
          moderator_action_at?: string | null
          moderator_id?: string | null
          package_id?: string | null
          phone?: string | null
          receipt_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_type?: string | null
          status?: string | null
          telegram_chat_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          countries?: string[] | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string | null
          moderator_action?: string | null
          moderator_action_at?: string | null
          moderator_id?: string | null
          package_id?: string | null
          phone?: string | null
          receipt_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_type?: string | null
          status?: string | null
          telegram_chat_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_requests_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      claim_alerts: {
        Args: { _limit?: number; _worker_id: string }
        Returns: {
          attempts: number
          chat_id: string
          country_code: string
          enqueued_at: string
          id: string
          payload: Json
          priority: number
          provider: string
        }[]
      }
      claim_scan_tasks: {
        Args: { _limit?: number; _worker_id: string }
        Returns: {
          category: string
          country_code: string
          id: string
          is_burst: boolean
          priority: number
          provider: string
        }[]
      }
      complete_alert: {
        Args: {
          _error?: string
          _id: string
          _success: boolean
          _worker_id: string
        }
        Returns: undefined
      }
      complete_scan_task: {
        Args: {
          _error?: string
          _latency_ms?: number
          _success: boolean
          _task_id: string
        }
        Returns: undefined
      }
      compute_predictive_windows: { Args: { _days?: number }; Returns: number }
      count_active_devices: { Args: { _user_id: string }; Returns: number }
      enqueue_scan_tasks: { Args: { _burst?: boolean }; Returns: number }
      get_alert_delivery_stats: {
        Args: never
        Returns: {
          active_workers: number
          delivered_last_minute: number
          failed_last_minute: number
          failure_rate_pct: number
          p50_latency_ms: number
          p95_latency_ms: number
          p99_latency_ms: number
          pending_p0: number
          pending_p1: number
          pending_total: number
          sends_per_second: number
        }[]
      }
      get_open_heatmap: {
        Args: { _country?: string; _days?: number; _provider?: string }
        Returns: {
          avg_duration_minutes: number
          hour: number
          open_count: number
          weekday: number
        }[]
      }
      get_payment_info: {
        Args: never
        Returns: {
          account_holder: string
          ccp_key: string
          ccp_number: string
          rip_number: string
        }[]
      }
      get_scan_throughput_stats: {
        Args: never
        Returns: {
          active_workers: number
          avg_latency_ms: number
          burst_active_tasks: number
          done_last_minute: number
          failed_last_minute: number
          p95_latency_ms: number
          pending_tasks: number
          running_tasks: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_device_allowed: {
        Args: { _fingerprint: string; _user_id: string }
        Returns: boolean
      }
      is_in_predictive_window: {
        Args: { _country: string; _min_score?: number; _provider: string }
        Returns: boolean
      }
      pick_best_proxy: {
        Args: { _country?: string; _pool_name?: string; _provider?: string }
        Returns: {
          affinity: number
          avg_latency_ms: number
          ban_probability: number
          host: string
          id: string
          password: string
          port: number
          protocol: string
          score: number
          username: string
        }[]
      }
      pick_next_proxy: {
        Args: { _country?: string; _pool_name: string }
        Returns: {
          host: string
          id: string
          password: string
          port: number
          protocol: string
          username: string
        }[]
      }
      recompute_provider_risk: {
        Args: { _provider: string }
        Returns: undefined
      }
      recompute_proxy_scores: {
        Args: never
        Returns: {
          auto_disabled: number
          updated: number
        }[]
      }
      record_ban_event: {
        Args: {
          _country: string
          _http_status: number
          _provider: string
          _reason: string
          _retry_after: number
          _severity: string
          _snippet: string
          _source_url: string
        }
        Returns: string
      }
      record_provider_success: {
        Args: { _provider: string }
        Returns: undefined
      }
      record_proxy_result:
        | {
            Args: {
              _error?: string
              _latency_ms?: number
              _proxy_id: string
              _status_code?: number
              _success: boolean
              _used_for?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _error?: string
              _latency_ms?: number
              _provider?: string
              _proxy_id: string
              _status_code?: number
              _success: boolean
              _used_for?: string
              _was_block?: boolean
              _was_captcha?: boolean
            }
            Returns: undefined
          }
      set_promo_input_method: { Args: { _method: string }; Returns: undefined }
      update_package_promo: {
        Args: {
          _input_method: string
          _package_id: string
          _promo_ends_at: string
          _promo_price: number
          _promo_starts_at: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
