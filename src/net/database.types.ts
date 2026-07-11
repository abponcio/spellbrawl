export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      match_history: {
        Row: {
          created_at: string;
          duration_sec: number;
          id: string;
          mode: string;
          opponents: number;
          placement: number;
          room_code: string | null;
          rounds_won: number;
          stats: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          duration_sec?: number;
          id?: string;
          mode: string;
          opponents?: number;
          placement: number;
          room_code?: string | null;
          rounds_won?: number;
          stats?: Json;
          user_id: string;
        };
        Update: {
          created_at?: string;
          duration_sec?: number;
          id?: string;
          mode?: string;
          opponents?: number;
          placement?: number;
          room_code?: string | null;
          rounds_won?: number;
          stats?: Json;
          user_id?: string;
        };
        Relationships: [];
      };
      player_stats: {
        Row: {
          best_placement: number;
          losses: number;
          matches_played: number;
          total_blocks: number;
          total_damage_dealt: number;
          total_damage_taken: number;
          total_deaths: number;
          total_distance_m: number;
          total_kos: number;
          updated_at: string;
          user_id: string;
          wins: number;
        };
        Insert: {
          best_placement?: number;
          losses?: number;
          matches_played?: number;
          total_blocks?: number;
          total_damage_dealt?: number;
          total_damage_taken?: number;
          total_deaths?: number;
          total_distance_m?: number;
          total_kos?: number;
          updated_at?: string;
          user_id: string;
          wins?: number;
        };
        Update: {
          best_placement?: number;
          losses?: number;
          matches_played?: number;
          total_blocks?: number;
          total_damage_dealt?: number;
          total_damage_taken?: number;
          total_deaths?: number;
          total_distance_m?: number;
          total_kos?: number;
          updated_at?: string;
          user_id?: string;
          wins?: number;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_color: string;
          created_at: string;
          display_name: string;
          id: string;
          updated_at: string;
        };
        Insert: {
          avatar_color?: string;
          created_at?: string;
          display_name?: string;
          id: string;
          updated_at?: string;
        };
        Update: {
          avatar_color?: string;
          created_at?: string;
          display_name?: string;
          id?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          ai_difficulty: string;
          control_scheme: string;
          extra: Json;
          master_volume: number;
          screen_shake: boolean;
          sfx_volume: number;
          show_tutorial_hints: boolean;
          user_id: string;
        };
        Insert: {
          ai_difficulty?: string;
          control_scheme?: string;
          extra?: Json;
          master_volume?: number;
          screen_shake?: boolean;
          sfx_volume?: number;
          show_tutorial_hints?: boolean;
          user_id: string;
        };
        Update: {
          ai_difficulty?: string;
          control_scheme?: string;
          extra?: Json;
          master_volume?: number;
          screen_shake?: boolean;
          sfx_volume?: number;
          show_tutorial_hints?: boolean;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
