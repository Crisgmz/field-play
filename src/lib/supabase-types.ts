export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          first_name: string;
          last_name: string;
          phone: string;
          national_id: string | null;
          role: 'client' | 'club_admin';
          created_at: string;
          updated_at: string;
        };
      };
      clubs: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          location: string;
          description: string;
          image_url: string | null;
          rating: number;
          open_time: string;
          close_time: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      pricing_rules: {
        Row: {
          id: string;
          club_id: string;
          field_type: 'F5' | 'F7' | 'F11';
          price_per_hour: number;
          minimum_minutes: number;
          increment_minutes: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      fields: {
        Row: {
          id: string;
          club_id: string;
          name: string;
          surface: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
      };
      field_units: {
        Row: {
          id: string;
          field_id: string;
          type: 'F5' | 'F7' | 'F11';
          name: string;
          parent_id: string | null;
          slot_ids: string[];
          is_active: boolean;
          created_at: string;
        };
      };
      blocks: {
        Row: {
          id: string;
          field_id: string;
          date: string;
          start_time: string;
          end_time: string;
          type: 'practice' | 'maintenance' | 'event';
          reason: string;
          created_by: string | null;
          created_at: string;
        };
      };
      bookings: {
        Row: {
          id: string;
          user_id: string;
          field_unit_id: string;
          date: string;
          start_time: string;
          end_time: string;
          status: 'pending' | 'confirmed' | 'cancelled';
          field_type: 'F5' | 'F7' | 'F11';
          total_price: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
      };
    };
  };
}
