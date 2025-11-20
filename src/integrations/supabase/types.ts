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
          category_achieved_at: string | null
          created_at: string | null
          current_category: string | null
          email: string | null
          start_of_empl: string | null
          tags: string[] | null
          updated_at: string | null
          user_id: string
          username: string
        }
        Insert: {
          category_achieved_at?: string | null
          created_at?: string | null
          current_category?: string | null
          email?: string | null
          start_of_empl?: string | null
          tags?: string[] | null
          updated_at?: string | null
          user_id: string
          username: string
        }
        Update: {
          category_achieved_at?: string | null
          created_at?: string | null
          current_category?: string | null
          email?: string | null
          start_of_empl?: string | null
          tags?: string[] | null
          updated_at?: string | null
          user_id?: string
          username?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
