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
      notification_preferences: {
        Row: {
          browser_notifications: boolean
          countries: string[]
          created_at: string
          id: string
          sound_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          browser_notifications?: boolean
          countries?: string[]
          created_at?: string
          id?: string
          sound_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          browser_notifications?: boolean
          countries?: string[]
          created_at?: string
          id?: string
          sound_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      package_promo_audit_log: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string
          id: string
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
          moderator_action: string | null
          moderator_action_at: string | null
          moderator_id: string | null
          package_id: string
          phone: string | null
          receipt_url: string | null
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
          moderator_action?: string | null
          moderator_action_at?: string | null
          moderator_id?: string | null
          package_id: string
          phone?: string | null
          receipt_url?: string | null
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
          moderator_action?: string | null
          moderator_action_at?: string | null
          moderator_id?: string | null
          package_id?: string
          phone?: string | null
          receipt_url?: string | null
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
        ]
      }
      subscriptions: {
        Row: {
          countries: string[]
          created_at: string
          expires_at: string
          id: string
          package_id: string
          service_type: string
          starts_at: string
          status: string
          telegram_chat_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          countries?: string[]
          created_at?: string
          expires_at: string
          id?: string
          package_id: string
          service_type?: string
          starts_at?: string
          status?: string
          telegram_chat_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          countries?: string[]
          created_at?: string
          expires_at?: string
          id?: string
          package_id?: string
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
      telegram_link_log: {
        Row: {
          action: string
          chat_id: string
          created_at: string
          id: string
          user_id: string
          username: string | null
        }
        Insert: {
          action: string
          chat_id: string
          created_at?: string
          id?: string
          user_id: string
          username?: string | null
        }
        Update: {
          action?: string
          chat_id?: string
          created_at?: string
          id?: string
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
      visa_monitor_checks: {
        Row: {
          checked_at: string
          country_code: string
          detection_method: string | null
          error_message: string | null
          id: string
          notified: boolean
          previous_status: string | null
          provider: string
          response_snippet: string | null
          status: string
        }
        Insert: {
          checked_at?: string
          country_code: string
          detection_method?: string | null
          error_message?: string | null
          id?: string
          notified?: boolean
          previous_status?: string | null
          provider: string
          response_snippet?: string | null
          status?: string
        }
        Update: {
          checked_at?: string
          country_code?: string
          detection_method?: string | null
          error_message?: string | null
          id?: string
          notified?: boolean
          previous_status?: string | null
          provider?: string
          response_snippet?: string | null
          status?: string
        }
        Relationships: []
      }
      visa_notifications: {
        Row: {
          country_code: string
          created_at: string
          id: string
          message_ar: string
          sent_by: string | null
          sent_count: number
        }
        Insert: {
          country_code: string
          created_at?: string
          id?: string
          message_ar: string
          sent_by?: string | null
          sent_count?: number
        }
        Update: {
          country_code?: string
          created_at?: string
          id?: string
          message_ar?: string
          sent_by?: string | null
          sent_count?: number
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
      count_active_devices: { Args: { _user_id: string }; Returns: number }
      get_payment_info: {
        Args: never
        Returns: {
          account_holder: string
          ccp_key: string
          ccp_number: string
          rip_number: string
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
