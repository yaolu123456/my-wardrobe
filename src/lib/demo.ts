import type { Item, Season } from './types'

/**
 * 示例衣橱。给没配 Supabase / 刚进来的人看效果用。
 * 刻意做成"典型但不完美"的衣柜：有基础色，也有几件沉睡单品。
 *
 * 图片来自 CC0 数据集 clothing-dataset-small（见 README「示例数据」），
 * 尺码/品牌等字段留空——真实入库时这些本来就靠人补。
 */

let n = 0
function it(
  p: Partial<Item> & Pick<Item, 'category' | 'name' | 'color_hex'> & { img: string },
): Item {
  n++
  return {
    id: `demo-${n}`,
    name: p.name,
    category: p.category,
    gender: p.gender ?? 'unisex',
    subcategory: p.subcategory ?? null,
    color_name: p.color_name ?? null,
    color_hex: p.color_hex,
    secondary_colors: [],
    pattern: p.pattern ?? 'solid',
    material: p.material ?? null,
    style_tags: p.style_tags ?? ['通勤'],
    season: (p.season ?? ['spring', 'autumn']) as Season[],
    formality: p.formality ?? 3,
    warmth: p.warmth ?? 3,
    fit: p.fit ?? 'regular',
    image_url: `/demo/${p.img}`,
    cutout_url: null,
    brand: null,
    status: 'active',
    times_worn: p.times_worn ?? 0,
    last_worn: p.last_worn ?? null,
    favorite: false,
    notes: null,
    created_at: '2026-09-01T00:00:00Z',
  }
}

export const DEMO_ITEMS: Item[] = [
  // 上装
  it({ category: 'upper', name: '深灰针织衫', gender: 'unisex', color_hex: '#322D34', color_name: '深灰', material: '羊毛', style_tags: ['通勤', '极简'], formality: 4, warmth: 3, season: ['autumn', 'winter'], times_worn: 9, last_worn: '2026-11-04', img: 'demo-01.jpg' }),
  it({ category: 'upper', name: '酒红长袖', gender: 'unisex', color_hex: '#684559', color_name: '酒红', material: '棉', style_tags: ['法式', '复古'], formality: 3, warmth: 3, season: ['autumn', 'winter'], times_worn: 4, last_worn: '2026-10-28', img: 'demo-02.jpg' }),
  it({ category: 'upper', name: '米白衬衫', gender: 'unisex', color_hex: '#EFE4CE', color_name: '米白', material: '棉', style_tags: ['通勤', '极简'], formality: 4, warmth: 2, season: ['spring', 'autumn'], times_worn: 11, last_worn: '2026-11-05', img: 'demo-03.jpg' }),
  it({ category: 'upper', name: '棕色衬衫', gender: 'unisex', color_hex: '#6C4D33', color_name: '棕', material: '棉', style_tags: ['复古', '休闲'], formality: 3, warmth: 2, season: ['spring', 'autumn'], times_worn: 0, last_worn: null, img: 'demo-04.jpg' }),
  it({ category: 'upper', name: '砖红 T 恤', gender: 'unisex', color_hex: '#733327', color_name: '砖红', material: '棉', style_tags: ['休闲', '街头'], formality: 2, warmth: 2, season: ['spring', 'summer', 'autumn'], times_worn: 6, last_worn: '2026-11-02', img: 'demo-05.jpg' }),
  it({ category: 'upper', name: '烟灰 T 恤', gender: 'unisex', color_hex: '#75716A', color_name: '烟灰', material: '棉', style_tags: ['休闲', '运动'], formality: 2, warmth: 2, season: ['spring', 'summer', 'autumn'], times_worn: 8, last_worn: '2026-11-01', img: 'demo-06.jpg' }),

  // 下装
  it({ category: 'lower', name: '深灰西裤', gender: 'unisex', color_hex: '#4E5152', color_name: '深灰', material: '羊毛混纺', style_tags: ['通勤', '商务'], formality: 5, warmth: 3, season: ['spring', 'autumn', 'winter'], times_worn: 12, last_worn: '2026-11-05', img: 'demo-07.jpg' }),
  it({ category: 'lower', name: '浅灰休闲裤', gender: 'unisex', color_hex: '#B4B1B1', color_name: '浅灰', material: '棉', style_tags: ['休闲', '极简'], formality: 3, warmth: 3, season: ['spring', 'autumn'], times_worn: 7, last_worn: '2026-11-02', img: 'demo-08.jpg' }),
  it({ category: 'lower', name: '卡其长裤', gender: 'unisex', color_hex: '#8F704E', color_name: '卡其', material: '棉', style_tags: ['通勤', '休闲'], formality: 3, warmth: 3, season: ['spring', 'autumn'], times_worn: 10, last_worn: '2026-10-28', img: 'demo-09.jpg' }),
  it({ category: 'lower', name: '驼色短裤', gender: 'unisex', subcategory: '短裤', color_hex: '#866E5B', color_name: '驼', material: '棉', style_tags: ['休闲', '运动'], formality: 2, warmth: 1, season: ['spring', 'summer', 'autumn'], times_worn: 0, last_worn: null, img: 'demo-10.jpg' }),
  it({ category: 'lower', name: '黑色半裙', gender: 'women', subcategory: '半裙', color_hex: '#2A1E21', color_name: '黑', material: '混纺', style_tags: ['通勤', '法式'], formality: 4, warmth: 2, season: ['spring', 'autumn', 'winter'], times_worn: 5, last_worn: '2026-11-04', img: 'demo-11.jpg' }),

  // 外套
  it({ category: 'outer', name: '黑色短外套', gender: 'unisex', color_hex: '#121215', color_name: '黑', material: '化纤', style_tags: ['商务', '通勤'], formality: 5, warmth: 4, season: ['autumn', 'winter'], times_worn: 6, last_worn: '2026-10-15', img: 'demo-12.jpg' }),
  it({ category: 'outer', name: '灰绿棉服', gender: 'unisex', color_hex: '#4E524F', color_name: '灰绿', material: '羽绒', style_tags: ['休闲', '运动'], formality: 2, warmth: 5, season: ['winter'], times_worn: 0, last_worn: null, img: 'demo-13.jpg' }),
  it({ category: 'outer', name: '浅灰夹克', gender: 'unisex', color_hex: '#909291', color_name: '浅灰', material: '化纤', style_tags: ['休闲', '极简'], formality: 3, warmth: 3, season: ['spring', 'autumn'], times_worn: 0, last_worn: null, img: 'demo-14.jpg' }),

  // 鞋
  it({ category: 'shoes', name: '浅棕皮鞋', gender: 'unisex', color_hex: '#AB8C70', color_name: '浅棕', material: '皮革', style_tags: ['通勤'], formality: 4, warmth: 2, season: ['spring', 'autumn'], times_worn: 13, last_worn: '2026-11-05', img: 'demo-15.jpg' }),
  it({ category: 'shoes', name: '米白帆布鞋', gender: 'unisex', color_hex: '#D5CCC3', color_name: '米白', material: '帆布', style_tags: ['休闲'], formality: 2, warmth: 2, season: ['spring', 'summer', 'autumn'], times_worn: 0, last_worn: null, img: 'demo-16.jpg' }),
  it({ category: 'shoes', name: '深棕皮鞋', gender: 'unisex', color_hex: '#322B2B', color_name: '深棕', material: '皮革', style_tags: ['商务', '通勤'], formality: 4, warmth: 3, season: ['autumn', 'winter'], times_worn: 9, last_worn: '2026-11-04', img: 'demo-17.jpg' }),
  it({ category: 'shoes', name: '白球鞋', gender: 'unisex', color_hex: '#E8E6E1', color_name: '白', material: '皮革', style_tags: ['休闲', '运动'], formality: 2, warmth: 2, season: ['spring', 'summer', 'autumn'], times_worn: 21, last_worn: '2026-11-01', img: 'demo-18.jpg' }),

  // 配饰（推荐时走可选槽位，不是每套都会带）
  it({ category: 'hat', name: '灰色帽子', gender: 'unisex', color_hex: '#9A9490', color_name: '灰', material: '羊毛', style_tags: ['休闲'], formality: 2, warmth: 4, season: ['autumn', 'winter'], times_worn: 3, last_worn: '2026-10-28', img: 'demo-19.jpg' }),
  it({ category: 'hat', name: '白色帽子', gender: 'unisex', color_hex: '#F0EEEA', color_name: '白', material: '棉', style_tags: ['休闲', '街头'], formality: 2, warmth: 2, season: ['spring', 'summer'], times_worn: 2, last_worn: '2026-08-20', img: 'demo-20.jpg' }),
  it({ category: 'jewelry', name: '细金项链', gender: 'women', color_hex: '#C9A961', color_name: '金', material: '金属', style_tags: ['法式', '约会'], formality: 4, warmth: 1, season: [], times_worn: 5, last_worn: '2026-10-31', img: 'demo-25.jpg' }),
  it({ category: 'hat', name: '米色贝雷帽', gender: 'women', color_hex: '#C4B49A', color_name: '米色', material: '羊毛', style_tags: ['法式', '复古'], formality: 3, warmth: 4, season: ['autumn', 'winter'], times_worn: 1, last_worn: '2026-10-12', img: 'demo-26.jpg' }),
  it({ category: 'scarf', name: '酒红围巾', gender: 'unisex', color_hex: '#8C3A3A', color_name: '酒红', material: '羊绒', style_tags: ['通勤', '复古'], formality: 3, warmth: 5, season: ['winter'], times_worn: 4, last_worn: '2026-01-15', img: 'demo-27.jpg' }),
  // 男装三件：不然切到「男装」模式衣柜是空的
  it({ category: 'upper', name: '蓝绿印花衬衫', gender: 'men', color_hex: '#5C7A6B', color_name: '墨绿', material: '棉麻', style_tags: ['休闲', '度假'], formality: 2, warmth: 2, pattern: 'floral', season: ['spring', 'summer', 'autumn'], times_worn: 3, last_worn: '2026-09-20', img: 'demo-29.jpg' }),
  it({ category: 'upper', name: '姜黄长袖', gender: 'men', color_hex: '#C9A227', color_name: '姜黄', material: '棉', style_tags: ['休闲'], formality: 2, warmth: 2, pattern: 'graphic', season: ['spring', 'summer'], times_worn: 0, last_worn: null, img: 'demo-30.jpg' }),
  it({ category: 'lower', name: '深蓝印花短裤', gender: 'men', subcategory: '短裤', color_hex: '#2E3A4F', color_name: '深蓝', material: '棉', style_tags: ['休闲', '运动'], formality: 2, warmth: 1, pattern: 'floral', season: ['spring', 'summer'], times_worn: 6, last_worn: '2026-08-30', img: 'demo-28.jpg' }),

  // ---- 再补 20 件，把男装和各季节补齐 ----
  // 之前切到「男装 + 冬季」会一套都出不来，因为男装只有 3 件春夏款。
  // 这批重点补：冬季外套、正装衬衫、牛仔裤、夏季短袖。
  // 上装（男）
  it({ category: 'upper', name: '黑色高领毛衣', gender: 'men', color_hex: '#1C1B1F', color_name: '黑', material: '羊毛', style_tags: ['通勤', '极简'], formality: 4, warmth: 4, season: ['autumn', 'winter'], times_worn: 8, last_worn: '2026-11-02', img: 'demo-31.jpg' }),
  it({ category: 'upper', name: '深灰蓝衬衫', gender: 'men', color_hex: '#4A5A6A', color_name: '灰蓝', material: '棉', style_tags: ['商务', '通勤'], formality: 4, warmth: 2, season: ['spring', 'autumn'], times_worn: 12, last_worn: '2026-10-29', img: 'demo-36.jpg' }),
  it({ category: 'upper', name: '浅蓝衬衫', gender: 'men', color_hex: '#A8BFCC', color_name: '浅蓝', material: '棉', style_tags: ['通勤', '商务'], formality: 4, warmth: 2, season: ['spring', 'summer'], times_worn: 5, last_worn: '2026-09-28', img: 'demo-37.jpg' }),
  it({ category: 'upper', name: '藏青 T 恤', gender: 'men', color_hex: '#26303D', color_name: '藏青', material: '棉', style_tags: ['休闲'], formality: 2, warmth: 2, season: ['spring', 'summer'], times_worn: 9, last_worn: '2026-09-10', img: 'demo-40.jpg' }),
  it({ category: 'upper', name: '浅蓝条纹 T 恤', gender: 'men', color_hex: '#9FB6C4', color_name: '浅蓝', material: '棉', style_tags: ['休闲', '法式'], formality: 2, warmth: 2, pattern: 'stripe', season: ['spring', 'summer'], times_worn: 3, last_worn: '2026-08-15', img: 'demo-41.jpg' }),
  it({ category: 'upper', name: '灰白运动长袖', gender: 'men', color_hex: '#B8BCC0', color_name: '灰白', material: '化纤', style_tags: ['运动', '休闲'], formality: 2, warmth: 3, pattern: 'stripe', season: ['spring', 'autumn'], times_worn: 14, last_worn: '2026-11-01', img: 'demo-43.jpg' }),
  // 外套（男，冬季重点）
  it({ category: 'outer', name: '墨绿夹克', gender: 'men', color_hex: '#3E4A3A', color_name: '墨绿', material: '棉', style_tags: ['休闲', '工装'], formality: 3, warmth: 4, season: ['autumn', 'winter'], times_worn: 11, last_worn: '2026-10-25', img: 'demo-32.jpg' }),
  it({ category: 'outer', name: '浅灰羽绒服', gender: 'men', color_hex: '#B0B4B8', color_name: '浅灰', material: '羽绒', style_tags: ['休闲', '运动'], formality: 2, warmth: 5, season: ['winter'], times_worn: 6, last_worn: '2026-02-10', img: 'demo-33.jpg' }),
  it({ category: 'outer', name: '深蓝羽绒马甲', gender: 'men', color_hex: '#22303F', color_name: '深蓝', material: '羽绒', style_tags: ['休闲'], formality: 3, warmth: 4, season: ['autumn', 'winter'], times_worn: 2, last_worn: '2025-12-20', img: 'demo-34.jpg' }),
  it({ category: 'outer', name: '驼色开衫', gender: 'unisex', color_hex: '#C9A882', color_name: '驼', material: '羊毛', style_tags: ['休闲', '法式'], formality: 3, warmth: 3, season: ['spring', 'autumn'], times_worn: 4, last_worn: '2026-10-08', img: 'demo-35.jpg' }),
  // 下装（男）
  it({ category: 'lower', name: '浅蓝牛仔裤', gender: 'men', subcategory: '牛仔裤', color_hex: '#7C93A8', color_name: '浅蓝', material: '牛仔', style_tags: ['休闲'], formality: 2, warmth: 3, season: [], times_worn: 18, last_worn: '2026-11-03', img: 'demo-38.jpg' }),
  it({ category: 'lower', name: '深蓝牛仔裤', gender: 'men', subcategory: '牛仔裤', color_hex: '#2F4257', color_name: '深蓝', material: '牛仔', style_tags: ['休闲', '通勤'], formality: 3, warmth: 3, season: [], times_worn: 22, last_worn: '2026-11-05', img: 'demo-39.jpg' }),
  it({ category: 'lower', name: '米色短裤', gender: 'men', subcategory: '短裤', color_hex: '#D3C2A8', color_name: '米色', material: '棉', style_tags: ['休闲'], formality: 2, warmth: 1, season: ['summer'], times_worn: 7, last_worn: '2026-08-22', img: 'demo-42.jpg' }),
  // 女装补充
  it({ category: 'dress', name: '裸粉连衣裙', gender: 'women', color_hex: '#D6BCAE', color_name: '裸粉', material: '雪纺', style_tags: ['约会', '法式'], formality: 4, warmth: 2, season: ['spring', 'summer'], times_worn: 3, last_worn: '2026-09-05', img: 'demo-44.jpg' }),
  it({ category: 'lower', name: '浅蓝半裙', gender: 'women', subcategory: '半裙', color_hex: '#93A9BE', color_name: '浅蓝', material: '棉', style_tags: ['通勤', '极简'], formality: 3, warmth: 2, season: ['spring', 'summer'], times_worn: 5, last_worn: '2026-09-18', img: 'demo-45.jpg' }),
  it({ category: 'shoes', name: '白色平底鞋', gender: 'women', color_hex: '#EFEDE8', color_name: '白', material: '皮革', style_tags: ['通勤', '法式'], formality: 3, warmth: 2, season: ['spring', 'summer', 'autumn'], times_worn: 10, last_worn: '2026-10-21', img: 'demo-46.jpg' }),
  it({ category: 'upper', name: '米奇印花 T 恤', gender: 'women', color_hex: '#F0EDE6', color_name: '白', material: '棉', style_tags: ['休闲', '街头'], formality: 2, warmth: 2, pattern: 'graphic', season: ['summer'], times_worn: 2, last_worn: '2026-07-30', img: 'demo-50.jpg' }),
  // 配饰与鞋（中性）
  it({ category: 'hat', name: '黑色皮帽', gender: 'unisex', color_hex: '#1A1815', color_name: '黑', material: '皮革', style_tags: ['复古', '法式'], formality: 3, warmth: 3, season: ['autumn', 'winter'], times_worn: 3, last_worn: '2026-10-18', img: 'demo-47.jpg' }),
  it({ category: 'shoes', name: '黑色皮靴', gender: 'unisex', color_hex: '#1F1D1A', color_name: '黑', material: '皮革', style_tags: ['通勤', '复古'], formality: 4, warmth: 4, season: ['autumn', 'winter'], times_worn: 15, last_worn: '2026-11-06', img: 'demo-48.jpg' }),
  it({ category: 'shoes', name: '绿色洞洞鞋', gender: 'unisex', color_hex: '#7FBF3F', color_name: '绿', material: 'EVA', style_tags: ['休闲', '运动'], formality: 1, warmth: 1, season: ['summer'], times_worn: 4, last_worn: '2026-08-08', img: 'demo-49.jpg' }),
  // ---- 以下 4 件是后补的 ----
  // 原来 20 件在"上班 + 秋季"下硬筛只剩 10 件，能组合的搭配太少，
  // 「换一批」点几下就见底了。补几件通勤可用的基础款，把候选空间撑开。
  it({ category: 'lower', name: '橄榄半裙', gender: 'women', subcategory: '半裙', color_hex: '#6B6244', color_name: '橄榄', material: '羊毛混纺', style_tags: ['通勤', '极简'], formality: 4, warmth: 3, season: ['spring', 'autumn', 'winter'], times_worn: 2, last_worn: '2026-10-20', img: 'demo-21.jpg' }),
  it({ category: 'upper', name: '条纹长袖', gender: 'unisex', color_hex: '#2B2B30', color_name: '黑白', material: '棉', style_tags: ['通勤', '法式'], formality: 3, warmth: 2, pattern: 'stripe', season: ['spring', 'autumn'], times_worn: 7, last_worn: '2026-10-30', img: 'demo-22.jpg' }),
  it({ category: 'dress', name: '碎花连衣裙', gender: 'women', color_hex: '#4A4E6B', color_name: '深蓝', material: '雪纺', style_tags: ['约会', '法式'], formality: 3, warmth: 2, pattern: 'floral', season: ['spring', 'summer', 'autumn'], times_worn: 4, last_worn: '2026-09-15', img: 'demo-23.jpg' }),
  it({ category: 'dress', name: '几何印花连衣裙', gender: 'women', color_hex: '#C4717E', color_name: '粉', material: '涤纶', style_tags: ['约会', '复古'], formality: 3, warmth: 2, pattern: 'graphic', season: ['spring', 'summer'], times_worn: 0, last_worn: null, img: 'demo-24.jpg' }),
]

/** 示例穿着记录：近 30 天，制造"新鲜度"和"沉睡单品"两种效果 */
export const DEMO_WEAR = [
  { worn_date: '2026-11-05', item_ids: ['demo-3', 'demo-7', 'demo-15'], outfit_title: '通勤 · 米白衬衫 + 深灰西裤', occasion: 'work' as const, temp: 19, rating: 5, note: null },
  { worn_date: '2026-11-04', item_ids: ['demo-1', 'demo-11', 'demo-17'], outfit_title: '通勤 · 深灰针织 + 黑半裙', occasion: 'work' as const, temp: 18, rating: 4, note: null },
  { worn_date: '2026-11-02', item_ids: ['demo-5', 'demo-8', 'demo-18'], outfit_title: '休闲 · 砖红 T + 浅灰裤', occasion: 'casual' as const, temp: 22, rating: 4, note: null },
  { worn_date: '2026-11-01', item_ids: ['demo-6', 'demo-8', 'demo-18'], outfit_title: '休闲 · 烟灰 T + 浅灰裤', occasion: 'casual' as const, temp: 23, rating: 3, note: '有点热' },
  { worn_date: '2026-10-28', item_ids: ['demo-2', 'demo-9', 'demo-15'], outfit_title: '通勤 · 酒红长袖 + 卡其裤', occasion: 'work' as const, temp: 21, rating: 4, note: null },
  { worn_date: '2026-10-15', item_ids: ['demo-3', 'demo-9', 'demo-12', 'demo-17'], outfit_title: '通勤 · 米白衬衫 + 黑外套', occasion: 'work' as const, temp: 15, rating: 4, note: null },
]
