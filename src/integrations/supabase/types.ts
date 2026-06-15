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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      badge_definitions: {
        Row: {
          badge_level: string | null
          badge_name: string
          badge_type: Database["public"]["Enums"]["badge_type"]
          color: string
          created_at: string | null
          criteria: Json
          description: string
          evaluation_period: Database["public"]["Enums"]["evaluation_period"]
          icon_name: string
          id: string
        }
        Insert: {
          badge_level?: string | null
          badge_name: string
          badge_type: Database["public"]["Enums"]["badge_type"]
          color: string
          created_at?: string | null
          criteria: Json
          description: string
          evaluation_period: Database["public"]["Enums"]["evaluation_period"]
          icon_name: string
          id?: string
        }
        Update: {
          badge_level?: string | null
          badge_name?: string
          badge_type?: Database["public"]["Enums"]["badge_type"]
          color?: string
          created_at?: string | null
          criteria?: Json
          description?: string
          evaluation_period?: Database["public"]["Enums"]["evaluation_period"]
          icon_name?: string
          id?: string
        }
        Relationships: []
      }
      category_history: {
        Row: {
          change_reason: string | null
          change_type: string
          created_at: string
          id: string
          new_category: string | null
          performance_snapshot: Json | null
          previous_category: string | null
          user_id: string
          warning_id: string | null
        }
        Insert: {
          change_reason?: string | null
          change_type: string
          created_at?: string
          id?: string
          new_category?: string | null
          performance_snapshot?: Json | null
          previous_category?: string | null
          user_id: string
          warning_id?: string | null
        }
        Update: {
          change_reason?: string | null
          change_type?: string
          created_at?: string
          id?: string
          new_category?: string | null
          performance_snapshot?: Json | null
          previous_category?: string | null
          user_id?: string
          warning_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "category_history_warning_id_fkey"
            columns: ["warning_id"]
            isOneToOne: false
            referencedRelation: "performance_warnings"
            referencedColumns: ["id"]
          },
        ]
      }
      company_monitoring: {
        Row: {
          company_code: string | null
          company_name: string
          created_at: string | null
          current_employee_count: number | null
          id: string
          is_active: boolean | null
          last_change_at: string | null
          last_checked_at: string | null
          notes: string | null
          previous_employee_count: number | null
          store_name: string | null
          tax_number: string | null
          updated_at: string | null
        }
        Insert: {
          company_code?: string | null
          company_name: string
          created_at?: string | null
          current_employee_count?: number | null
          id?: string
          is_active?: boolean | null
          last_change_at?: string | null
          last_checked_at?: string | null
          notes?: string | null
          previous_employee_count?: number | null
          store_name?: string | null
          tax_number?: string | null
          updated_at?: string | null
        }
        Update: {
          company_code?: string | null
          company_name?: string
          created_at?: string | null
          current_employee_count?: number | null
          id?: string
          is_active?: boolean | null
          last_change_at?: string | null
          last_checked_at?: string | null
          notes?: string | null
          previous_employee_count?: number | null
          store_name?: string | null
          tax_number?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      company_monitoring_log: {
        Row: {
          changed: boolean | null
          checked_at: string | null
          company_id: string | null
          employee_count: number
          id: string
          previous_count: number | null
          raw_response: Json | null
        }
        Insert: {
          changed?: boolean | null
          checked_at?: string | null
          company_id?: string | null
          employee_count: number
          id?: string
          previous_count?: number | null
          raw_response?: Json | null
        }
        Update: {
          changed?: boolean | null
          checked_at?: string | null
          company_id?: string | null
          employee_count?: number
          id?: string
          previous_count?: number | null
          raw_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "company_monitoring_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_monitoring"
            referencedColumns: ["id"]
          },
        ]
      }
      course_time_tracking: {
        Row: {
          course_id: string
          course_title: string
          created_at: string | null
          id: string
          last_activity_at: string | null
          total_time_spent_seconds: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          course_id: string
          course_title: string
          created_at?: string | null
          id?: string
          last_activity_at?: string | null
          total_time_spent_seconds?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          course_id?: string
          course_title?: string
          created_at?: string | null
          id?: string
          last_activity_at?: string | null
          total_time_spent_seconds?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      exam_results: {
        Row: {
          completed_at: string
          course_id: string
          course_title: string
          created_at: string
          email: string | null
          exam_id: string
          exam_title: string
          id: string
          score: number
          time_spent_seconds: number | null
          user_id: string
          username: string
        }
        Insert: {
          completed_at: string
          course_id: string
          course_title: string
          created_at?: string
          email?: string | null
          exam_id: string
          exam_title: string
          id?: string
          score?: number
          time_spent_seconds?: number | null
          user_id: string
          username: string
        }
        Update: {
          completed_at?: string
          course_id?: string
          course_title?: string
          created_at?: string
          email?: string | null
          exam_id?: string
          exam_title?: string
          id?: string
          score?: number
          time_spent_seconds?: number | null
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      leaderboard_cache: {
        Row: {
          average_score: number | null
          exam_count: number | null
          id: string
          last_activity: string | null
          rank: number | null
          total_score: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          average_score?: number | null
          exam_count?: number | null
          id?: string
          last_activity?: string | null
          rank?: number | null
          total_score?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          average_score?: number | null
          exam_count?: number | null
          id?: string
          last_activity?: string | null
          rank?: number | null
          total_score?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_leaderboard_cache_user"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      lw_certificates: {
        Row: {
          certificate_id: string | null
          certificate_url: string | null
          id: string
          issued_at: string | null
          lw_course_id: string | null
          synced_at: string | null
          user_id: string
        }
        Insert: {
          certificate_id?: string | null
          certificate_url?: string | null
          id?: string
          issued_at?: string | null
          lw_course_id?: string | null
          synced_at?: string | null
          user_id: string
        }
        Update: {
          certificate_id?: string | null
          certificate_url?: string | null
          id?: string
          issued_at?: string | null
          lw_course_id?: string | null
          synced_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      lw_courses: {
        Row: {
          categories: string[] | null
          description: string | null
          id: string
          lw_course_id: string
          price: number | null
          sections: Json | null
          status: string | null
          synced_at: string | null
          title: string | null
        }
        Insert: {
          categories?: string[] | null
          description?: string | null
          id?: string
          lw_course_id: string
          price?: number | null
          sections?: Json | null
          status?: string | null
          synced_at?: string | null
          title?: string | null
        }
        Update: {
          categories?: string[] | null
          description?: string | null
          id?: string
          lw_course_id?: string
          price?: number | null
          sections?: Json | null
          status?: string | null
          synced_at?: string | null
          title?: string | null
        }
        Relationships: []
      }
      lw_enrollments: {
        Row: {
          completed_at: string | null
          completion_percentage: number | null
          enrolled_at: string | null
          id: string
          lw_course_id: string
          synced_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completion_percentage?: number | null
          enrolled_at?: string | null
          id?: string
          lw_course_id: string
          synced_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completion_percentage?: number | null
          enrolled_at?: string | null
          id?: string
          lw_course_id?: string
          synced_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      lw_group_members: {
        Row: {
          id: string
          joined_at: string | null
          lw_group_id: string
          role: string | null
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          lw_group_id: string
          role?: string | null
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          lw_group_id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lw_group_members_lw_group_id_fkey"
            columns: ["lw_group_id"]
            isOneToOne: false
            referencedRelation: "lw_groups"
            referencedColumns: ["lw_group_id"]
          },
          {
            foreignKeyName: "lw_group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      lw_groups: {
        Row: {
          created_at: string | null
          description: string | null
          lw_group_id: string
          manager_ids: string[] | null
          max_members: number | null
          product_ids: string[] | null
          tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          lw_group_id: string
          manager_ids?: string[] | null
          max_members?: number | null
          product_ids?: string[] | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          lw_group_id?: string
          manager_ids?: string[] | null
          max_members?: number | null
          product_ids?: string[] | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      performance_warnings: {
        Row: {
          action_plan_due_date: string | null
          action_plan_notes: string | null
          created_at: string | null
          current_category: string | null
          evaluation_date: string
          exam_performance_pct: number | null
          id: string
          resolved: boolean | null
          resolved_at: string | null
          resulted_in_downgrade: boolean | null
          training_activity_pct: number | null
          user_id: string
          warning_type: Database["public"]["Enums"]["warning_type"]
        }
        Insert: {
          action_plan_due_date?: string | null
          action_plan_notes?: string | null
          created_at?: string | null
          current_category?: string | null
          evaluation_date: string
          exam_performance_pct?: number | null
          id?: string
          resolved?: boolean | null
          resolved_at?: string | null
          resulted_in_downgrade?: boolean | null
          training_activity_pct?: number | null
          user_id: string
          warning_type: Database["public"]["Enums"]["warning_type"]
        }
        Update: {
          action_plan_due_date?: string | null
          action_plan_notes?: string | null
          created_at?: string | null
          current_category?: string | null
          evaluation_date?: string
          exam_performance_pct?: number | null
          id?: string
          resolved?: boolean | null
          resolved_at?: string | null
          resulted_in_downgrade?: boolean | null
          training_activity_pct?: number | null
          user_id?: string
          warning_type?: Database["public"]["Enums"]["warning_type"]
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          id: string
          learnworlds_email: string | null
          learnworlds_user_id: string | null
          link_method: string | null
          link_verified: boolean | null
          linked_at: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id: string
          learnworlds_email?: string | null
          learnworlds_user_id?: string | null
          link_method?: string | null
          link_verified?: boolean | null
          linked_at?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          learnworlds_email?: string | null
          learnworlds_user_id?: string | null
          link_method?: string | null
          link_verified?: boolean | null
          linked_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      refresh_logs: {
        Row: {
          api_calls: number | null
          error_message: string | null
          id: string
          is_selective_refresh: boolean
          selected_user_id: string | null
          timestamp: string
          user_identifier: string | null
        }
        Insert: {
          api_calls?: number | null
          error_message?: string | null
          id?: string
          is_selective_refresh?: boolean
          selected_user_id?: string | null
          timestamp?: string
          user_identifier?: string | null
        }
        Update: {
          api_calls?: number | null
          error_message?: string | null
          id?: string
          is_selective_refresh?: boolean
          selected_user_id?: string | null
          timestamp?: string
          user_identifier?: string | null
        }
        Relationships: []
      }
      sync_queue: {
        Row: {
          created_at: string | null
          error_message: string | null
          last_attempt_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          error_message?: string | null
          last_attempt_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          error_message?: string | null
          last_attempt_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      training_activities: {
        Row: {
          completed: boolean | null
          completion_date: string | null
          created_at: string | null
          id: string
          is_required: boolean | null
          training_name: string
          training_type: Database["public"]["Enums"]["training_type"]
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          completion_date?: string | null
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          training_name: string
          training_type: Database["public"]["Enums"]["training_type"]
          user_id: string
        }
        Update: {
          completed?: boolean | null
          completion_date?: string | null
          created_at?: string | null
          id?: string
          is_required?: boolean | null
          training_name?: string
          training_type?: Database["public"]["Enums"]["training_type"]
          user_id?: string
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          awarded_at: string | null
          badge_id: string | null
          created_at: string | null
          evaluation_period_end: string | null
          evaluation_period_start: string | null
          expires_at: string | null
          id: string
          performance_data: Json | null
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          awarded_at?: string | null
          badge_id?: string | null
          created_at?: string | null
          evaluation_period_end?: string | null
          evaluation_period_start?: string | null
          expires_at?: string | null
          id?: string
          performance_data?: Json | null
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          awarded_at?: string | null
          badge_id?: string | null
          created_at?: string | null
          evaluation_period_end?: string | null
          evaluation_period_start?: string | null
          expires_at?: string | null
          id?: string
          performance_data?: Json | null
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badge_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_performance_metrics: {
        Row: {
          available_trainings_count: number | null
          completed_trainings_count: number | null
          evaluation_period: Database["public"]["Enums"]["evaluation_period"]
          exam_performance_pct: number | null
          id: string
          overall_performance_pct: number | null
          period_end: string
          period_start: string
          successful_exams_count: number | null
          total_exams_count: number | null
          training_activity_pct: number | null
          updated_at: string | null
          user_id: string
          years_of_service: number | null
        }
        Insert: {
          available_trainings_count?: number | null
          completed_trainings_count?: number | null
          evaluation_period: Database["public"]["Enums"]["evaluation_period"]
          exam_performance_pct?: number | null
          id?: string
          overall_performance_pct?: number | null
          period_end: string
          period_start: string
          successful_exams_count?: number | null
          total_exams_count?: number | null
          training_activity_pct?: number | null
          updated_at?: string | null
          user_id: string
          years_of_service?: number | null
        }
        Update: {
          available_trainings_count?: number | null
          completed_trainings_count?: number | null
          evaluation_period?: Database["public"]["Enums"]["evaluation_period"]
          exam_performance_pct?: number | null
          id?: string
          overall_performance_pct?: number | null
          period_end?: string
          period_start?: string
          successful_exams_count?: number | null
          total_exams_count?: number | null
          training_activity_pct?: number | null
          updated_at?: string | null
          user_id?: string
          years_of_service?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          aruhaz: string[] | null
          beosztas: string[] | null
          category_achieved_at: string | null
          created_at: string | null
          current_category: string | null
          demoted_from_category: string | null
          email: string | null
          last_demotion_date: string | null
          nps_comment: string | null
          nps_score: number | null
          start_of_empl: string | null
          updated_at: string | null
          user_id: string
          username: string
        }
        Insert: {
          aruhaz?: string[] | null
          beosztas?: string[] | null
          category_achieved_at?: string | null
          created_at?: string | null
          current_category?: string | null
          demoted_from_category?: string | null
          email?: string | null
          last_demotion_date?: string | null
          nps_comment?: string | null
          nps_score?: number | null
          start_of_empl?: string | null
          updated_at?: string | null
          user_id: string
          username: string
        }
        Update: {
          aruhaz?: string[] | null
          beosztas?: string[] | null
          category_achieved_at?: string | null
          created_at?: string | null
          current_category?: string | null
          demoted_from_category?: string | null
          email?: string | null
          last_demotion_date?: string | null
          nps_comment?: string | null
          nps_score?: number | null
          start_of_empl?: string | null
          updated_at?: string | null
          user_id?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      report_course_exams: {
        Row: {
          Áruház: string | null
          Dátum: string | null
          email: string | null
          "Eredmény %": number | null
          "Kolléga neve": string | null
          Kurzus: string | null
          Megfelelt: string | null
          "Vizsga neve": string | null
        }
        Relationships: []
      }
      report_monthly_detailed: {
        Row: {
          Áruház: string | null
          Dátum: string | null
          email: string | null
          "Eredmény %": number | null
          "Kolléga neve": string | null
          Megfelelt: string | null
          Pozíció: string | null
          Státusz: string | null
          "Vizsga témakör": string | null
          "Vizsga típusa": string | null
        }
        Relationships: []
      }
      report_monthly_stats: {
        Row: {
          Áruház: string | null
          "Átlagos eredmény %": number | null
          Hónap: string | null
          "Összes vizsga száma": number | null
          "Sikeres vizsgák": number | null
          "Sikerességi ráta %": number | null
          "Sikertelen vizsgák": number | null
          "Vizsga témakör": string | null
        }
        Relationships: []
      }
      report_quarterly_totals: {
        Row: {
          Áruház: string | null
          "Áruházi rangsor helyezés": number | null
          "Átlagos eredmény %": number | null
          Negyedév: string | null
          "Sikeres fő": number | null
          "Sikertelen fő": number | null
          "Vizsga témakör": string | null
          "Vizsgázott fő": number | null
        }
        Relationships: []
      }
      report_user_exams: {
        Row: {
          Áruház: string | null
          Dátum: string | null
          email: string | null
          "Eredmény %": number | null
          "Kolléga neve": string | null
          Kurzus: string | null
          Megfelelt: string | null
          Pozíció: string | null
          "Vizsga neve": string | null
        }
        Relationships: []
      }
    }
    Functions: {
      calculate_exam_performance: {
        Args: { p_end_date: string; p_start_date: string; p_user_id: string }
        Returns: number
      }
      calculate_training_activity: {
        Args: { p_end_date: string; p_start_date: string; p_user_id: string }
        Returns: number
      }
      calculate_years_of_service: {
        Args: { p_as_of_date?: string; p_user_id: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      trigger_opten_check_all: { Args: never; Returns: undefined }
      update_all_users_performance_metrics: {
        Args: {
          p_evaluation_period?: Database["public"]["Enums"]["evaluation_period"]
        }
        Returns: number
      }
      update_user_performance_metrics: {
        Args: {
          p_evaluation_period: Database["public"]["Enums"]["evaluation_period"]
          p_period_end?: string
          p_period_start?: string
          p_user_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
      badge_type: "category" | "monthly_star" | "progress" | "aspirant"
      evaluation_period:
        | "current_month"
        | "last_6_months"
        | "last_year"
        | "monthly"
        | "half_yearly"
        | "yearly"
        | "permanent"
      training_type:
        | "START_program"
        | "online_training"
        | "video"
        | "learning_material"
      warning_type: "yellow_card" | "red_card"
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
      app_role: ["admin", "user"],
      badge_type: ["category", "monthly_star", "progress", "aspirant"],
      evaluation_period: [
        "current_month",
        "last_6_months",
        "last_year",
        "monthly",
        "half_yearly",
        "yearly",
        "permanent",
      ],
      training_type: [
        "START_program",
        "online_training",
        "video",
        "learning_material",
      ],
      warning_type: ["yellow_card", "red_card"],
    },
  },
} as const
