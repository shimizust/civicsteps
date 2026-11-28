
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            campaign_snapshot: {
              Row: { id: number; sources: Json; items_checked: number; items_matched: number; checked_at: string }
              Insert: { id: number; sources: Json; items_checked: number; items_matched: number; checked_at?: string }
              Update: { id?: number; sources?: Json; items_checked?: number; items_matched?: number; checked_at?: string }
              Relationships: []
            }
            "badges": {
                  Row: {
                    "description": string,"icon": string,"name": string,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "description": string,"icon": string,"name": string,"slug": string
                  }
                  Update: {
                    "description"?: string,"icon"?: string,"name"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"draft_usage": {
                  Row: {
                    "count": number,"day": string,"kind": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "count"?: number,"day": string,"kind"?: string,"user_id": string
                  }
                  Update: {
                    "count"?: number,"day"?: string,"kind"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"drafts": {
                  Row: {
                    "content": string,"created_at": string,"id": string,"item_id": string,"kind": Database["public"]['Enums']["draft_kind"],"model": string | null,"official_id": string | null,"personal_note": string,"stance": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content": string,"created_at"?: string,"id"?: string,"item_id": string,"kind": Database["public"]['Enums']["draft_kind"],"model"?: string | null,"official_id"?: string | null,"personal_note": string,"stance": string,"user_id": string
                  }
                  Update: {
                    "content"?: string,"created_at"?: string,"id"?: string,"item_id"?: string,"kind"?: Database["public"]['Enums']["draft_kind"],"model"?: string | null,"official_id"?: string | null,"personal_note"?: string,"stance"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "drafts_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "drafts_official_id_fkey"
      columns: ["official_id"]
isOneToOne: false
      referencedRelation: "officials"
      referencedColumns: ["id"]
    }
                  ]
                },"facts": {
                  Row: {
                    "answer_type": string,"canonical_key": string | null,"created_at": string,"created_from_item": string | null,"facets": (string)[],"help_text": string | null,"key": string,"options": (string)[],"question": string,"source": string,"topics": (string)[],"you_phrase": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answer_type": string,"canonical_key"?: string | null,"created_at"?: string,"created_from_item"?: string | null,"facets"?: (string)[],"help_text"?: string | null,"key": string,"options"?: (string)[],"question": string,"source": string,"topics"?: (string)[],"you_phrase": string
                  }
                  Update: {
                    "answer_type"?: string,"canonical_key"?: string | null,"created_at"?: string,"created_from_item"?: string | null,"facets"?: (string)[],"help_text"?: string | null,"key"?: string,"options"?: (string)[],"question"?: string,"source"?: string,"topics"?: (string)[],"you_phrase"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "facts_canonical_key_fkey"
      columns: ["canonical_key"]
isOneToOne: false
      referencedRelation: "facts"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "facts_created_from_item_fkey"
      columns: ["created_from_item"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"ingest_coverage": {
                  Row: {
                    "backfilled_at": string | null,"progress": string | null,"progress_at": string | null,"items_found": number | null,"items_analyzed": number | null,"items_failed": number | null,"last_error": string | null,"requested_at": string | null,"scope": string
                  }
                  ComputedFields: never
                  Insert: {
                    "backfilled_at"?: string | null,"progress"?: string | null,"progress_at"?: string | null,"items_found"?: number | null,"items_analyzed"?: number | null,"items_failed"?: number | null,"last_error"?: string | null,"requested_at"?: string | null,"scope": string
                  }
                  Update: {
                    "backfilled_at"?: string | null,"progress"?: string | null,"progress_at"?: string | null,"items_found"?: number | null,"items_analyzed"?: number | null,"items_failed"?: number | null,"last_error"?: string | null,"requested_at"?: string | null,"scope"?: string
                  }
                  Relationships: [
                    
                  ]
                },"item_analysis": {
                  Row: {
                    "affected_groups": (string)[],"arguments_against": (string)[],"arguments_for": (string)[],"created_at": string,"headline": string | null,"impacts": NonNullable<Json>,"item_id": string,"keywords": (string)[],"model": string,"prompt_version": string,"significance": number,"summary": string,"topics": (string)[],"why_it_matters": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "affected_groups"?: (string)[],"arguments_against"?: (string)[],"arguments_for"?: (string)[],"created_at"?: string,"headline"?: string | null,"impacts"?: NonNullable<Json>,"item_id": string,"keywords"?: (string)[],"model": string,"prompt_version": string,"significance": number,"summary": string,"topics"?: (string)[],"why_it_matters"?: string | null
                  }
                  Update: {
                    "affected_groups"?: (string)[],"arguments_against"?: (string)[],"arguments_for"?: (string)[],"created_at"?: string,"headline"?: string | null,"impacts"?: NonNullable<Json>,"item_id"?: string,"keywords"?: (string)[],"model"?: string,"prompt_version"?: string,"significance"?: number,"summary"?: string,"topics"?: (string)[],"why_it_matters"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_analysis_item_id_fkey"
      columns: ["item_id"]
isOneToOne: true
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"item_favorites": {
                  Row: {
                    "created_at": string,"item_id": string,"last_seen_action": string | null,"last_seen_action_at": string | null,"last_seen_at": string,"last_seen_deadline": string | null,"last_seen_enacted_at": string | null,"last_seen_status": string | null,"source": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"item_id": string,"last_seen_action"?: string | null,"last_seen_action_at"?: string | null,"last_seen_at"?: string,"last_seen_deadline"?: string | null,"last_seen_enacted_at"?: string | null,"last_seen_status"?: string | null,"source": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"item_id"?: string,"last_seen_action"?: string | null,"last_seen_action_at"?: string | null,"last_seen_at"?: string,"last_seen_deadline"?: string | null,"last_seen_enacted_at"?: string | null,"last_seen_status"?: string | null,"source"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_favorites_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"item_feedback": {
                  Row: {
                    "created_at": string,"item_id": string,"relevant": boolean,"source": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"item_id": string,"relevant": boolean,"source": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"item_id"?: string,"relevant"?: boolean,"source"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_feedback_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"item_locations": {
                  Row: {
                    "address": string,"item_id": string,"lat": number,"lng": number,"matched_address": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "address": string,"item_id": string,"lat": number,"lng": number,"matched_address"?: string | null
                  }
                  Update: {
                    "address"?: string,"item_id"?: string,"lat"?: number,"lng"?: number,"matched_address"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_locations_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"item_officials": {
                  Row: {
                    "item_id": string,"official_id": string,"role": string,"vote": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "item_id": string,"official_id": string,"role": string,"vote"?: string | null
                  }
                  Update: {
                    "item_id"?: string,"official_id"?: string,"role"?: string,"vote"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "item_officials_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "item_officials_official_id_fkey"
      columns: ["official_id"]
isOneToOne: false
      referencedRelation: "officials"
      referencedColumns: ["id"]
    }
                  ]
                },"items": {
                  Row: {
                    "action_url": string | null,"agency": string | null,"analysis_batch_id": string | null,"analysis_status": string,"comment_deadline": string | null,"content_hash": string,"created_at": string,"description": string | null,"enacted_at": string | null,"event_at": string | null,"external_id": string,"id": string,"introduced_at": string | null,"jurisdiction_id": string | null,"last_action": string | null,"last_action_at": string | null,"level": Database["public"]['Enums']["jurisdiction_level"],"located_at": string | null,"source": string,"state": string | null,"status": string | null,"title": string,"type": Database["public"]['Enums']["item_type"],"updated_at": string,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action_url"?: string | null,"agency"?: string | null,"analysis_batch_id"?: string | null,"analysis_status"?: string,"comment_deadline"?: string | null,"content_hash": string,"created_at"?: string,"description"?: string | null,"enacted_at"?: string | null,"event_at"?: string | null,"external_id": string,"id"?: string,"introduced_at"?: string | null,"jurisdiction_id"?: string | null,"last_action"?: string | null,"last_action_at"?: string | null,"level": Database["public"]['Enums']["jurisdiction_level"],"located_at"?: string | null,"source": string,"state"?: string | null,"status"?: string | null,"title": string,"type": Database["public"]['Enums']["item_type"],"updated_at"?: string,"url"?: string | null
                  }
                  Update: {
                    "action_url"?: string | null,"agency"?: string | null,"analysis_batch_id"?: string | null,"analysis_status"?: string,"comment_deadline"?: string | null,"content_hash"?: string,"created_at"?: string,"description"?: string | null,"enacted_at"?: string | null,"event_at"?: string | null,"external_id"?: string,"id"?: string,"introduced_at"?: string | null,"jurisdiction_id"?: string | null,"last_action"?: string | null,"last_action_at"?: string | null,"level"?: Database["public"]['Enums']["jurisdiction_level"],"located_at"?: string | null,"source"?: string,"state"?: string | null,"status"?: string | null,"title"?: string,"type"?: Database["public"]['Enums']["item_type"],"updated_at"?: string,"url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"jurisdictions": {
                  Row: {
                    "id": string,"level": Database["public"]['Enums']["jurisdiction_level"],"name": string,"state": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id": string,"level": Database["public"]['Enums']["jurisdiction_level"],"name": string,"state"?: string | null
                  }
                  Update: {
                    "id"?: string,"level"?: Database["public"]['Enums']["jurisdiction_level"],"name"?: string,"state"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"local_sources": {
                  Row: {
                    "enabled": boolean,"id": string,"jurisdiction_id": string,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled"?: boolean,"id": string,"jurisdiction_id": string,"name": string
                  }
                  Update: {
                    "enabled"?: boolean,"id"?: string,"jurisdiction_id"?: string,"name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "local_sources_jurisdiction_id_fkey"
      columns: ["jurisdiction_id"]
isOneToOne: false
      referencedRelation: "jurisdictions"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications_sent": {
                  Row: {
                    "item_id": string | null,"kind": string,"period": string,"sent_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "item_id"?: string | null,"kind": string,"period"?: string,"sent_at"?: string,"user_id": string
                  }
                  Update: {
                    "item_id"?: string | null,"kind"?: string,"period"?: string,"sent_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_sent_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"officials": {
                  Row: {
                    "contacts": NonNullable<Json>,"external_ids": NonNullable<Json>,"id": string,"jurisdiction_id": string | null,"level": Database["public"]['Enums']["jurisdiction_level"],"name": string,"office": string,"party": string | null,"photo_url": string | null,"state": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contacts"?: NonNullable<Json>,"external_ids"?: NonNullable<Json>,"id": string,"jurisdiction_id"?: string | null,"level": Database["public"]['Enums']["jurisdiction_level"],"name": string,"office": string,"party"?: string | null,"photo_url"?: string | null,"state"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "contacts"?: NonNullable<Json>,"external_ids"?: NonNullable<Json>,"id"?: string,"jurisdiction_id"?: string | null,"level"?: Database["public"]['Enums']["jurisdiction_level"],"name"?: string,"office"?: string,"party"?: string | null,"photo_url"?: string | null,"state"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"personal_assessments": {
                  Row: {
                    "created_at": string,"facts_hash": string,"item_id": string,"model": string,"place": string | null,"result": NonNullable<Json>,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"facts_hash": string,"item_id": string,"model": string,"place"?: string | null,"result": NonNullable<Json>,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"facts_hash"?: string,"item_id"?: string,"model"?: string,"place"?: string | null,"result"?: NonNullable<Json>,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "personal_assessments_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"points_ledger": {
                  Row: {
                    "action_id": string | null,"created_at": string,"id": string,"points": number,"reason": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action_id"?: string | null,"created_at"?: string,"id"?: string,"points": number,"reason": string,"user_id": string
                  }
                  Update: {
                    "action_id"?: string | null,"created_at"?: string,"id"?: string,"points"?: number,"reason"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "points_ledger_action_id_fkey"
      columns: ["action_id"]
isOneToOne: false
      referencedRelation: "user_actions"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"demographics": NonNullable<Json>,"display_name": string | null,"jurisdiction_ids": (string)[],"lat": number | null,"lng": number | null,"notify_alerts": boolean,"notify_digest": boolean,"onboarded_at": string | null,"state": string | null,"updated_at": string,"user_id": string,"zip": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"demographics"?: NonNullable<Json>,"display_name"?: string | null,"jurisdiction_ids"?: (string)[],"lat"?: number | null,"lng"?: number | null,"notify_alerts"?: boolean,"notify_digest"?: boolean,"onboarded_at"?: string | null,"state"?: string | null,"updated_at"?: string,"user_id": string,"zip"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"demographics"?: NonNullable<Json>,"display_name"?: string | null,"jurisdiction_ids"?: (string)[],"lat"?: number | null,"lng"?: number | null,"notify_alerts"?: boolean,"notify_digest"?: boolean,"onboarded_at"?: string | null,"state"?: string | null,"updated_at"?: string,"user_id"?: string,"zip"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"saved_zips": {
                  Row: {
                    "jurisdiction_ids": (string)[],"lat": number | null,"lng": number | null,"state": string | null,"state_official_ids": (string)[],"user_id": string,"zip": string
                  }
                  ComputedFields: never
                  Insert: {
                    "jurisdiction_ids": (string)[],"lat"?: number | null,"lng"?: number | null,"state"?: string | null,"state_official_ids"?: (string)[],"user_id": string,"zip": string
                  }
                  Update: {
                    "jurisdiction_ids"?: (string)[],"lat"?: number | null,"lng"?: number | null,"state"?: string | null,"state_official_ids"?: (string)[],"user_id"?: string,"zip"?: string
                  }
                  Relationships: []
                },"topics": {
                  Row: {
                    "name": string,"parent_slug": string | null,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "name": string,"parent_slug"?: string | null,"slug": string
                  }
                  Update: {
                    "name"?: string,"parent_slug"?: string | null,"slug"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "topics_parent_slug_fkey"
      columns: ["parent_slug"]
isOneToOne: false
      referencedRelation: "topics"
      referencedColumns: ["slug"]
    }
                  ]
                },"user_actions": {
                  Row: {
                    "created_at": string,"id": string,"item_id": string | null,"official_id": string | null,"type": Database["public"]['Enums']["action_type"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"item_id"?: string | null,"official_id"?: string | null,"type": Database["public"]['Enums']["action_type"],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"item_id"?: string | null,"official_id"?: string | null,"type"?: Database["public"]['Enums']["action_type"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_actions_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "user_actions_official_id_fkey"
      columns: ["official_id"]
isOneToOne: false
      referencedRelation: "officials"
      referencedColumns: ["id"]
    }
                  ]
                },"user_badges": {
                  Row: {
                    "awarded_at": string,"badge_slug": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "awarded_at"?: string,"badge_slug": string,"user_id": string
                  }
                  Update: {
                    "awarded_at"?: string,"badge_slug"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_badges_badge_slug_fkey"
      columns: ["badge_slug"]
isOneToOne: false
      referencedRelation: "badges"
      referencedColumns: ["slug"]
    }
                  ]
                },"user_facts": {
                  Row: {
                    "fact_key": string,"item_id": string | null,"source": string,"updated_at": string,"user_id": string,"value": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "fact_key": string,"item_id"?: string | null,"source": string,"updated_at"?: string,"user_id": string,"value"?: string | null
                  }
                  Update: {
                    "fact_key"?: string,"item_id"?: string | null,"source"?: string,"updated_at"?: string,"user_id"?: string,"value"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_facts_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "items"
      referencedColumns: ["id"]
    }
                  ]
                },"user_interests": {
                  Row: {
                    "created_at": string,"id": string,"is_pet": boolean,"keywords": (string)[],"label": string,"topic_slugs": (string)[],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_pet"?: boolean,"keywords"?: (string)[],"label": string,"topic_slugs"?: (string)[],"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_pet"?: boolean,"keywords"?: (string)[],"label"?: string,"topic_slugs"?: (string)[],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"user_officials": {
                  Row: {
                    "official_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "official_id": string,"user_id": string
                  }
                  Update: {
                    "official_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "user_officials_official_id_fkey"
      columns: ["official_id"]
isOneToOne: false
      referencedRelation: "officials"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "activate_zip":
{ Args: { "p_jurisdiction_ids": (string)[],"p_lat": number,"p_lng": number,"p_state": string,"p_state_official_ids"?: (string)[],"p_user": string,"p_zip": string }; Returns: number
                           },
"browse_items":
{ Args: { "p_level"?: string,"p_limit"?: number,"p_offset"?: number,"p_query"?: string,"p_scope"?: string }; Returns: {
              "active": boolean,"analysis": Json,"in_area": boolean,"item": Json,"my_official_ids": (string)[],"relevant": boolean,"total_count": number
            }[]
                           },
"consume_ai_quota":
{ Args: { "p_kind": string,"p_limit": number,"p_user": string }; Returns: boolean
                           },
"consume_draft_quota":
{ Args: { "p_limit": number,"p_user": string }; Returns: boolean
                           },
"claim_area_backfill": { Args: { "p_scopes": string[] }; Returns: boolean },
"feed_candidates":
{ Args: { "p_limit"?: number }; Returns: {
              "analysis": Json,"item": Json,"my_official_ids": (string)[]
            }[]
                           },
"index_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "in_area": number,"in_area_active": number,"indexed": number
            }[]
                           },
"remove_zip":
{ Args: { "p_user": string,"p_zip": string }; Returns: {
              "next_jurisdiction_ids": (string)[],"next_state": string | null,"next_zip": string | null,"removed": boolean,"was_active": boolean
            }[]
                           },
"states_to_ingest":
{ Args: Record<PropertyKey, never>; Returns: string[]
                           },
"sync_council_links":
{ Args: { "p_jurisdiction": string,"p_official_ids": (string)[] }; Returns: number
                           }
          }
          Enums: {
            "action_type": "read"|"emailed"|"called"|"commented"|"signed"|"attended"|"shared","draft_kind": "email"|"call_script"|"public_comment","item_type": "bill"|"comment_period"|"hearing"|"vote"|"agenda_item"|"opportunity","jurisdiction_level": "city"|"county"|"state"|"federal"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "action_type": ["read", "emailed", "called", "commented", "signed", "attended", "shared"],"draft_kind": ["email", "call_script", "public_comment"],"item_type": ["bill", "comment_period", "hearing", "vote", "agenda_item", "opportunity"],"jurisdiction_level": ["city", "county", "state", "federal"]
          }
        }
} as const
