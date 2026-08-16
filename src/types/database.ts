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

export type ManholeClassifierLabel = 'manhole' | 'not_manhole';
export type OverlayQualityGrade = 'p' | 'e' | 'g' | 'f' | 'b';

export interface Database {
  public: {
    Tables: {
      app_user: {
        Row: {
          id: string;
          auth_uid: string;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          x_url: string | null;
          instagram_url: string | null;
          profile_is_customized: boolean;
          created_at: string;
          updated_at: string;
          all_prefectures_completed_at: string | null;
          all_prefectures_outdated_at: string | null;
          // anon には列単位で REVOKE してある（読めるのは RPC 経由だけ）。
          // 型に出すのは service_role / 本人の読み書き経路のため。
          pokemon_go_friend_code: string | null;
          pokemon_go_friend_note: string | null;
          pokemon_go_friend_open: boolean;
        };
        Insert: {
          id?: string;
          auth_uid: string;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          x_url?: string | null;
          instagram_url?: string | null;
          profile_is_customized?: boolean;
          all_prefectures_completed_at?: string | null;
          all_prefectures_outdated_at?: string | null;
          pokemon_go_friend_code?: string | null;
          pokemon_go_friend_note?: string | null;
          pokemon_go_friend_open?: boolean;
        };
        Update: {
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          x_url?: string | null;
          instagram_url?: string | null;
          profile_is_customized?: boolean;
          all_prefectures_completed_at?: string | null;
          all_prefectures_outdated_at?: string | null;
          pokemon_go_friend_code?: string | null;
          pokemon_go_friend_note?: string | null;
          pokemon_go_friend_open?: boolean;
        };
        Relationships: [];
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
          id?: number;
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
          created_at?: string;
          updated_at?: string;
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
        Relationships: [];
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
        Relationships: [];
      };
      // 蓋コメントの通報。読めるのは service_role のみ（SELECT ポリシーを作っていない）。
      // アプリからは INSERT だけ。`.select()` を付けると 42501 で落ちる。
      comment_report: {
        Row: {
          id: string;
          comment_id: string;
          reporter_user_id: string | null;
          reason: string | null;
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          comment_id: string;
          reporter_user_id?: string | null;
          reason?: string | null;
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          reason?: string | null;
          resolved_at?: string | null;
        };
        Relationships: [];
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
          updated_at?: string;  // visit には更新トリガーが無いので呼び出し側で設定する
          note?: string | null;
          comment?: string | null;  // 訪問コメント（公開可能）
          is_public?: boolean;  // 公開/非公開フラグ
          // Removed fields that don't exist in actual schema: with_family, tags, weather, rating
        };
        Relationships: [];
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
        };
        Relationships: [];
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
          manhole_classifier_label: ManholeClassifierLabel | null;
          manhole_classifier_confidence: number | null;
          manhole_detection_result: Record<string, any> | null;
          overlay_quality_grade: OverlayQualityGrade | null;
          annotation_manhole_label: ManholeClassifierLabel | null;
          annotation_shot_context_label: ShotContextLabel | null;
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
          manhole_classifier_label?: ManholeClassifierLabel | null;
          manhole_classifier_confidence?: number | null;
          manhole_detection_result?: Record<string, any> | null;
          overlay_quality_grade?: OverlayQualityGrade | null;
          annotation_manhole_label?: ManholeClassifierLabel | null;
          annotation_shot_context_label?: ShotContextLabel | null;
          source_platform?: string;
          app_version?: string | null;
          device_model?: string | null;
          sort_order?: number;
          created_by: string;
        };
        Update: {
          metadata?: Record<string, any>;
          shot_context_label?: ShotContextLabel | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      design_manhole: {
        Row: {
          id: string;
          title: string | null;
          description: string | null;
          submitter_name: string | null;
          latitude: number;
          longitude: number;
          storage_provider: string;
          storage_key: string;
          content_type: string;
          file_size: number | null;
          width: number | null;
          height: number | null;
          exif: Record<string, any> | null;
          status: 'published' | 'needs_review' | 'hidden';
          nearby_official_manhole_id: number | null;
          nearby_official_manhole_distance_m: number | null;
          nearby_official_manhole_confirmed_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title?: string | null;
          description?: string | null;
          submitter_name?: string | null;
          latitude: number;
          longitude: number;
          storage_provider?: string;
          storage_key: string;
          content_type: string;
          file_size?: number | null;
          width?: number | null;
          height?: number | null;
          exif?: Record<string, any> | null;
          status?: 'published' | 'needs_review' | 'hidden';
          nearby_official_manhole_id?: number | null;
          nearby_official_manhole_distance_m?: number | null;
          nearby_official_manhole_confirmed_at?: string | null;
          created_by: string;
        };
        Update: {
          title?: string | null;
          description?: string | null;
          status?: 'published' | 'needs_review' | 'hidden';
          nearby_official_manhole_id?: number | null;
          nearby_official_manhole_distance_m?: number | null;
          nearby_official_manhole_confirmed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };
      visit_like: {
        Row: {
          id: string;
          visit_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          visit_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          visit_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      visit_comment: {
        Row: {
          id: string;
          visit_id: string;
          user_id: string;
          content: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          visit_id: string;
          user_id: string;
          content: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          content?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      visit_bookmark: {
        Row: {
          id: string;
          visit_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          visit_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: {
          visit_id?: string;
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      /**
       * 公開訪問だけを公開ID(app_user.id)で引ける読み取り面。
       * **auth_uid / user_id / note / shot_location は列として存在しない。**
       * ここに足すことは公開面を広げることなので、先に
       * tools/verify-app-user-visibility.sql の列集合検査を見ること。
       */
      public_user_visit_base: {
        Row: {
          public_user_id: string;
          id: string;
          manhole_id: number | null;
          shot_at: string | null;
          comment: string | null;
          created_at: string | null;
          manhole_title: string | null;
          manhole_prefecture: string | null;
          manhole_municipality: string | null;
          manhole_pokemons: string[] | null;
        };
        Relationships: [];
      };
      /** public_user_visit_base に最新写真を1枚足したカード表示用。集計には base を使う */
      public_user_visit_card: {
        Row: {
          public_user_id: string;
          id: string;
          manhole_id: number | null;
          shot_at: string | null;
          comment: string | null;
          created_at: string | null;
          manhole_title: string | null;
          manhole_prefecture: string | null;
          manhole_municipality: string | null;
          manhole_pokemons: string[] | null;
          latest_photo_id: string | null;
          // 同じマンホールの代表写真を max(訪問日時, 写真日時) で選ぶために返す
          latest_photo_created_at: string | null;
        };
        Relationships: [];
      };
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
        Relationships: [];
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
        Relationships: [];
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
      get_site_stats: {
        Args: Record<string, never>;
        Returns: {
          total_manhole: number;
          total_manholes_with_photos: number;
          total_posts: number;
          total_users: number;
        }[];
      };
      // トップページの件数用。get_site_stats() と違い manholes_with_photos を返す。
      // /api/site-stats がこちらを呼ぶ（get_site_stats は現在アプリから未使用）。
      get_site_counts: {
        Args: Record<string, never>;
        Returns: {
          manholes: number;
          posts: number;
          public_posts: number;
          manholes_with_photos: number;
          users: number;
        }[];
      };
      get_public_display_names: {
        Args: {
          p_auth_uids: string[];
        };
        Returns: {
          auth_uid: string;
          display_name: string | null;
        }[];
      };
      get_public_user_info: {
        Args: { p_user_id: string };
        Returns: {
          auth_uid: string;
          display_name: string | null;
          bio: string | null;
          x_url: string | null;
          instagram_url: string | null;
          // pokemon_go_friend_open が false のときは NULL で返る（関数側で出し分ける）
          pokemon_go_friend_code: string | null;
          pokemon_go_friend_note: string | null;
        }[];
      };
      /**
       * 公開プロフィール面。**auth_uid を返さない。**
       * 公開訪問の有無で行を隠さないので、訪問0件のユーザーでも1行返る。
       * 訪問は public_user_visit_base / _card から公開IDで引く。
       */
      get_public_profile: {
        Args: { p_user_id: string };
        Returns: {
          display_name: string | null;
          bio: string | null;
          x_url: string | null;
          instagram_url: string | null;
          // pokemon_go_friend_open が false のときは NULL で返る（関数側で出し分ける）
          pokemon_go_friend_code: string | null;
          pokemon_go_friend_note: string | null;
        }[];
      };
      get_own_profile: {
        Args: Record<string, never>;
        Returns: {
          public_user_id: string;
          display_name: string | null;
          bio: string | null;
          x_url: string | null;
          instagram_url: string | null;
          profile_is_customized: boolean;
          pokemon_go_friend_code: string | null;
          pokemon_go_friend_note: string | null;
          pokemon_go_friend_open: boolean;
        }[];
      };
      /**
       * 版が2つある。PostgREST は body のキー名で選ぶ。
       *
       * 7引数版は3項目を**必ず**書く。DB 側に `DEFAULT` を置いていないので
       * 省略できないし、省略できる形にすると4引数呼び出しがこちらへ解決され、
       * 既定値で3列が黙って消える。
       *
       * 4引数版は旧4項目だけを更新し、Pokémon GO の3列には触らない。
       * 旧クライアントの payload と、ロールバック後の旧コードが通る経路。
       */
      update_own_public_profile: {
        Args:
          | {
              p_display_name: string;
              p_bio: string | null;
              p_x_url: string | null;
              p_instagram_url: string | null;
              p_pokemon_go_friend_code: string | null;
              p_pokemon_go_friend_note: string | null;
              p_pokemon_go_friend_open: boolean;
            }
          | {
              p_display_name: string;
              p_bio: string | null;
              p_x_url: string | null;
              p_instagram_url: string | null;
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

// デザインマンホール一覧 API (/api/design-manholes GET) が返す公開データ
export interface DesignManhole {
  id: string;
  title: string | null;
  description: string | null;
  submitter_name: string | null;
  latitude: number;
  longitude: number;
  width: number | null;
  height: number | null;
  created_at: string;
  photo_url: string;
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
