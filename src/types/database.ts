export interface ManholeTitle {
  key: string;
  label: string;
  hashtag?: string;
  emoji?: string;
  priority?: number;
}

export type ShotContextLabel =
  | 'centered_clean'
  | 'selfie_with_manhole'
  | 'wide_context'
  | 'signage_info'
  | 'partial_occluded'
  | 'not_relevant'
  | 'low_quality';

export interface Database {
  public: {
    Tables: {
      app_user: {
        Row: {
          id: string;
          auth_uid: string;
          display_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
          all_prefectures_completed_at: string | null;
          all_prefectures_outdated_at: string | null;
        };
        Insert: {
          id?: string;
          auth_uid: string;
          display_name?: string | null;
          avatar_url?: string | null;
          all_prefectures_completed_at?: string | null;
          all_prefectures_outdated_at?: string | null;
        };
        Update: {
          display_name?: string | null;
          avatar_url?: string | null;
          all_prefectures_completed_at?: string | null;
          all_prefectures_outdated_at?: string | null;
        };
      };
      manhole: {
        Row: {
          id: number;
          title: string;
          prefecture: string;
          prefecture_id: number | null;
          prefecture_code: string | null;
          municipality: string | null;
          address: string | null;
          address_norm: string | null;
          building: string | null;
          location: string; // PostGIS geography as string
          pokemons: string[];
          detail_url: string | null;
          prefecture_site_url: string | null;
          official_url: string | null;
          titles: ManholeTitle[];
          hashtags: string[];
          title_tags: string[];
          region: string | null;
          is_active: boolean;
          last_verified_at: string;
          data_source: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: number;
          title: string;
          prefecture: string;
          prefecture_id?: number | null;
          prefecture_code?: string | null;
          municipality?: string | null;
          address?: string | null;
          address_norm?: string | null;
          building?: string | null;
          location: string;
          pokemons?: string[];
          detail_url?: string | null;
          prefecture_site_url?: string | null;
          official_url?: string | null;
          titles?: ManholeTitle[];
          hashtags?: string[];
          title_tags?: string[];
          region?: string | null;
          is_active?: boolean;
          last_verified_at?: string;
          data_source?: string | null;
        };
        Update: {
          title?: string;
          prefecture?: string;
          prefecture_id?: number | null;
          prefecture_code?: string | null;
          municipality?: string | null;
          address?: string | null;
          address_norm?: string | null;
          building?: string | null;
          location?: string;
          pokemons?: string[];
          detail_url?: string | null;
          prefecture_site_url?: string | null;
          official_url?: string | null;
          titles?: ManholeTitle[];
          hashtags?: string[];
          title_tags?: string[];
          region?: string | null;
          is_active?: boolean;
          last_verified_at?: string;
          data_source?: string | null;
        };
      };
      manhole_comment: {
        Row: {
          id: string;
          manhole_id: number;
          user_id: string;
          content: string;
          parent_comment_id: string | null;
          is_edited: boolean;
          edited_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          manhole_id: number;
          user_id: string;
          content: string;
          parent_comment_id?: string | null;
          is_edited?: boolean;
          edited_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          manhole_id?: number;
          user_id?: string;
          content?: string;
          parent_comment_id?: string | null;
          is_edited?: boolean;
          edited_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      visit: {
        Row: {
          id: string;
          user_id: string;
          manhole_id: number | null;
          shot_location: string | null;
          shot_at: string;
          created_at: string;
          updated_at: string;
          note: string | null;
          comment: string | null;  // 訪問コメント（公開可能）
          is_public: boolean;  // 公開/非公開フラグ
          // Removed fields that don't exist in actual schema: with_family, tags, weather, rating
        };
        Insert: {
          id?: string;
          user_id: string;
          manhole_id?: number | null;
          shot_location?: string | null;
          shot_at: string;
          note?: string | null;
          comment?: string | null;  // 訪問コメント（公開可能）
          is_public?: boolean;  // 公開/非公開フラグ（デフォルト: true）
          // Removed fields that don't exist in actual schema: with_family, tags, weather, rating
        };
        Update: {
          manhole_id?: number | null;
          shot_location?: string | null;
          shot_at?: string;
          note?: string | null;
          comment?: string | null;  // 訪問コメント（公開可能）
          is_public?: boolean;  // 公開/非公開フラグ
          // Removed fields that don't exist in actual schema: with_family, tags, weather, rating
        };
      };
      photo: {
        Row: {
          id: string;
          visit_id: string | null;
          manhole_id: number; // NOT NULL - 写真は必ずマンホールに紐づく
          storage_provider: string;
          storage_key: string;
          original_name: string | null;
          width: number | null;
          height: number | null;
          file_size: number | null;
          content_type: string;
          exif: ExifData | null;
          sha256: string | null;
          created_at: string;
          thumbnail_320: string | null;
          thumbnail_800: string | null;
          thumbnail_1600: string | null;
          binary_data: ArrayBuffer | null;
          thumbnail_small: ArrayBuffer | null;
          thumbnail_medium: ArrayBuffer | null;
          metadata: Record<string, any> | null;
        };
        Insert: {
          id?: string;
          visit_id?: string | null;
          manhole_id: number; // 必須 - マンホールなしの写真は登録不可
          storage_provider?: string;
          storage_key?: string;
          original_name?: string | null;
          width?: number | null;
          height?: number | null;
          file_size?: number | null;
          content_type?: string;
          exif?: ExifData | null;
          sha256?: string | null;
          thumbnail_320?: string | null;
          thumbnail_800?: string | null;
          thumbnail_1600?: string | null;
          binary_data?: ArrayBuffer | null;
          thumbnail_small?: ArrayBuffer | null;
          thumbnail_medium?: ArrayBuffer | null;
          metadata?: Record<string, any> | null;
        };
        Update: {
          visit_id?: string | null;
          manhole_id?: number; // 更新時はオプショナル
          storage_provider?: string;
          storage_key?: string;
          original_name?: string | null;
          width?: number | null;
          height?: number | null;
          file_size?: number | null;
          content_type?: string;
          exif?: ExifData | null;
          sha256?: string | null;
          thumbnail_320?: string | null;
          thumbnail_800?: string | null;
          thumbnail_1600?: string | null;
          binary_data?: ArrayBuffer | null;
          thumbnail_small?: ArrayBuffer | null;
          thumbnail_medium?: ArrayBuffer | null;
          metadata?: Record<string, any> | null;
        };
      };
      photo_context_image: {
        Row: {
          id: string;
          manhole_id: number;
          storage_provider: string;
          storage_key: string;
          original_name: string | null;
          content_type: string;
          file_size: number | null;
          width: number | null;
          height: number | null;
          sha256: string | null;
          exif: ExifData | null;
          metadata: Record<string, any>;
          shot_context_label: ShotContextLabel | null;
          shot_context_confidence: number | null;
          shot_context_confidences: Record<string, any> | null;
          source_platform: string;
          app_version: string | null;
          device_model: string | null;
          sort_order: number;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          manhole_id: number;
          storage_provider?: string;
          storage_key: string;
          original_name?: string | null;
          content_type: string;
          file_size?: number | null;
          width?: number | null;
          height?: number | null;
          sha256?: string | null;
          exif?: ExifData | null;
          metadata?: Record<string, any>;
          shot_context_label?: ShotContextLabel | null;
          shot_context_confidence?: number | null;
          shot_context_confidences?: Record<string, any> | null;
          source_platform?: string;
          app_version?: string | null;
          device_model?: string | null;
          sort_order?: number;
          created_by: string;
        };
        Update: {
          metadata?: Record<string, any>;
          sort_order?: number;
          updated_at?: string;
        };
      };
      shared_link: {
        Row: {
          id: string;
          visit_id: string;
          created_by: string;
          token: string;
          title: string | null;
          description: string | null;
          expires_at: string | null;
          is_active: boolean;
          view_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          visit_id: string;
          created_by: string;
          token?: string;
          title?: string | null;
          description?: string | null;
          expires_at?: string | null;
          is_active?: boolean;
          view_count?: number;
        };
        Update: {
          title?: string | null;
          description?: string | null;
          expires_at?: string | null;
          is_active?: boolean;
        };
      };
      image: {
        Row: {
          id: string;
          photo_id: string | null;
          manhole_id: number | null;
          filename: string;
          content_type: string;
          file_size: number;
          width: number | null;
          height: number | null;
          binary_data: ArrayBuffer;
          thumbnail_small: ArrayBuffer | null;
          thumbnail_medium: ArrayBuffer | null;
          created_at: string;
          updated_at: string;
          exif_data: ExifData | null;
          metadata: Record<string, any> | null;
        };
        Insert: {
          id?: string;
          photo_id?: string | null;
          manhole_id?: number | null;
          filename: string;
          content_type: string;
          file_size: number;
          width?: number | null;
          height?: number | null;
          binary_data: ArrayBuffer;
          thumbnail_small?: ArrayBuffer | null;
          thumbnail_medium?: ArrayBuffer | null;
          exif_data?: ExifData | null;
          metadata?: Record<string, any> | null;
        };
        Update: {
          photo_id?: string | null;
          manhole_id?: number | null;
          filename?: string;
          content_type?: string;
          file_size?: number;
          width?: number | null;
          height?: number | null;
          binary_data?: ArrayBuffer;
          thumbnail_small?: ArrayBuffer | null;
          thumbnail_medium?: ArrayBuffer | null;
          exif_data?: ExifData | null;
          metadata?: Record<string, any> | null;
        };
      };
      prefecture: {
        Row: {
          id: number;
          code: string;
          name: string;
          name_en: string | null;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          code: string;
          name: string;
          name_en?: string | null;
          display_order: number;
        };
        Update: {
          code?: string;
          name?: string;
          name_en?: string | null;
          display_order?: number;
        };
      };
      prefecture_badge: {
        Row: {
          id: string;
          user_id: string;
          prefecture_id: number;
          status: 'active' | 'outdated' | 'completed';
          acquired_at: string;
          outdated_at: string | null;
          completion_percentage: number;
          manhole_count_at_completion: number;
          visited_manhole_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          prefecture_id: number;
          status?: 'active' | 'outdated' | 'completed';
          acquired_at?: string;
          outdated_at?: string | null;
          completion_percentage?: number;
          manhole_count_at_completion?: number;
          visited_manhole_count?: number;
        };
        Update: {
          status?: 'active' | 'outdated' | 'completed';
          outdated_at?: string | null;
          completion_percentage?: number;
        };
      };
    };
    Views: {
      user_visit_stats: {
        Row: {
          user_id: string;
          auth_uid: string;
          display_name: string | null;
          total_visits: number;
          unique_manholes: number;
          prefectures_visited: number;
          total_photos: number;
          first_visit: string | null;
          last_visit: string | null;
        };
      };
      prefecture_completion_tracker: {
        Row: {
          badge_id: string | null;
          user_id: string | null;
          prefecture_id: number;
          code: string;
          name: string;
          name_en: string | null;
          status: string | null;
          total_manholes_now: number;
          visited_manholes_count: number;
          current_completion_percentage: number | null;
          acquired_at: string | null;
          outdated_at: string | null;
          manhole_count_at_completion: number | null;
          visited_manhole_count: number | null;
          completion_percentage: number | null;
          created_at: string | null;
          updated_at: string | null;
        };
      };
    };
    Functions: {
      get_unvisited_manholes: {
        Args: {
          user_uuid: string;
          nearby_lat?: number;
          nearby_lng?: number;
          radius_km?: number;
        };
        Returns: {
          id: number;
          title: string;
          prefecture: string;
          municipality: string | null;
          latitude: number;
          longitude: number;
          pokemons: string[];
          distance_km: number | null;
        }[];
      };
      create_prefecture_badge: {
        Args: {
          p_user_id: string;
          p_prefecture_id: number;
        };
        Returns: string | null;
      };
      check_and_update_all_prefectures_completion: {
        Args: {
          p_user_id: string;
        };
        Returns: undefined;
      };
    };
  };
}

export interface Weather {
  condition: 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'foggy' | 'windy' | 'stormy';
  temperature?: number;
  humidity?: number;
  description?: string;
}

export interface ExifData {
  make?: string;
  model?: string;
  software?: string;
  dateTime?: string;
  gps?: {
    latitude?: number;
    longitude?: number;
    altitude?: number;
    speed?: number;
    heading?: number;
  };
  camera?: {
    fNumber?: number;
    exposureTime?: string;
    iso?: number;
    focalLength?: number;
    flash?: boolean;
  };
  image?: {
    width?: number;
    height?: number;
    orientation?: number;
    colorSpace?: string;
  };
}

// Helper types for API responses
export interface ManholeWithDistance {
  id: number;
  title: string;
  prefecture: string;
  municipality: string | null;
  latitude: number;
  longitude: number;
  pokemons: string[];
  distance_km: number | null;
}

export interface VisitWithPhotos {
  id: string;
  user_id: string;
  manhole_id: number | null;
  manhole?: Database['public']['Tables']['manhole']['Row'];
  shot_location: string | null;
  shot_at: string;
  created_at: string;
  updated_at: string;
  note: string | null;
  // Removed fields that don't exist in actual schema: with_family, tags, weather, rating
  photos: Database['public']['Tables']['photo']['Row'][];
}

export interface PhotoUploadProgress {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  error?: string;
  photoId?: string;
}

export type ManholeCandidate = {
  manhole: Database['public']['Tables']['manhole']['Row'];
  distance: number;
  confidence: number;
};

// Convenience type exports
export type Manhole = Database['public']['Tables']['manhole']['Row'] & {
  name?: string;
  description?: string;
  city?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  source_url?: string;
  is_visited?: boolean;
  last_visit?: string | null;
  photo_count?: number;
  latest_photo_url?: string | null;
};
