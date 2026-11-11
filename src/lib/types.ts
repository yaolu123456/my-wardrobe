// 领域模型。字段与 supabase/schema.sql 一一对应。

export type Category =
  | 'upper'      // 上装
  | 'lower'      // 下装
  | 'outer'      // 外套
  | 'dress'      // 连衣裙
  | 'shoes'      // 鞋
  | 'bag'        // 包
  | 'jewelry'    // 首饰（项链/耳饰/戒指/手链）
  | 'hat'        // 帽子
  | 'scarf'      // 围巾（冬季）
  | 'accessory'  // 其他配饰（腰带/墨镜/手表…）

/** 单品适用性别。unisex 两边都能用，比如白 T、帆布鞋。 */
export type Gender = 'men' | 'women' | 'unisex'

export type Pattern = 'solid' | 'stripe' | 'check' | 'floral' | 'graphic' | 'other'
export type Fit = 'slim' | 'regular' | 'loose'
export type ItemStatus = 'active' | 'stored' | 'archived'
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type Occasion = 'work' | 'casual' | 'date' | 'sport' | 'formal'
export type FeedbackSignal = 'like' | 'dislike'

export interface Item {
  id: string
  name: string | null
  category: Category
  /** 适用性别；老数据默认 unisex，互不排斥 */
  gender: Gender
  subcategory: string | null
  color_name: string | null
  color_hex: string
  secondary_colors: string[]
  pattern: Pattern
  material: string | null
  style_tags: string[]
  season: Season[]
  /** 1=运动居家 2=休闲 3=日常通勤 4=商务 5=正式 */
  formality: number
  /** 1=极薄 5=极厚 */
  warmth: number
  fit: Fit
  image_url: string | null
  cutout_url: string | null
  brand: string | null
  status: ItemStatus
  times_worn: number
  last_worn: string | null // YYYY-MM-DD
  favorite: boolean
  notes: string | null
  created_at: string
}

export interface WearLog {
  id: string
  worn_date: string // YYYY-MM-DD
  item_ids: string[]
  outfit_title: string | null
  occasion: Occasion | null
  temp: number | null
  rating: number | null // 1-5，第二天可补
  note: string | null
  created_at: string
}

export interface Feedback {
  id: string
  item_id: string | null
  outfit_key: string | null
  signal: FeedbackSignal
  occasion: Occasion | null
  created_at: string
}

/** 一次推荐所需的全部上下文 */
export interface RecommendContext {
  occasion: Occasion
  /** 体感温度 °C */
  feelsLike: number
  /** 降水概率 0-1 */
  rainChance: number
  season: Season
  /** 今天日期 YYYY-MM-DD，用于新鲜度计算 */
  today: string
  /**
   * 用户性别偏好：只推荐同性别 + unisex 的单品。
   * 不传则不按性别过滤（兼容老数据与示例模式）。
   */
  gender?: Gender
}

/** 一套搭配 */
export interface Outfit {
  items: Item[]
  /** 规则综合分 0-1 */
  score: number
  reason: string
  breakdown: ScoreBreakdown
}

export interface ScoreBreakdown {
  occasion: number
  color: number
  warmth: number
  freshness: number
  preference: number
  /**
   * 扣分项：用户点过「不喜欢」的搭配/单品的惩罚，0 表示没被否决过。
   * 和上面五项不同，它是在加权总分之后直接减掉的 ——
   * 这样「点了不喜欢」是一个真实可感的分数变化，
   * 而不是把整套从候选里一刀切掉。
   */
  penalty?: number
}
