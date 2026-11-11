'use client'

import type { Category, Gender, Item, Season } from '@/lib/types'
import { CATEGORY_LABEL, CATEGORY_ORDER, GENDER_LABEL } from '@/lib/display'

/**
 * 单品的可编辑字段。
 *
 * 自动识别（视觉模型 / 手动填的初值）只是起点，材质和保暖这类判断
 * 模型经常估偏，必须让用户能改 —— 而且录入当场就能改，不用先存再回头找。
 */
export interface EditableItem {
  name: string
  category: Category
  gender: Gender
  color_hex: string
  color_name: string
  material: string
  formality: number
  warmth: number
  season: Season[]
  style_tags: string[]
}

const SEASONS: { v: Season; label: string }[] = [
  { v: 'spring', label: '春' },
  { v: 'summer', label: '夏' },
  { v: 'autumn', label: '秋' },
  { v: 'winter', label: '冬' },
]

const GENDERS: Gender[] = ['women', 'men', 'unisex']

/** 从已有单品或识别结果里抽出可编辑字段 */
export function toEditable(src: Partial<Item>): EditableItem {
  return {
    name: src.name ?? '',
    category: src.category ?? 'upper',
    gender: src.gender ?? 'unisex',
    color_hex: src.color_hex ?? '#888888',
    color_name: src.color_name ?? '',
    material: src.material ?? '',
    formality: src.formality ?? 3,
    warmth: src.warmth ?? 3,
    season: src.season ?? [],
    style_tags: src.style_tags ?? [],
  }
}

/** 转回可直接写库的 patch */
export function fromEditable(e: EditableItem): Partial<Item> {
  return {
    name: e.name.trim() || null,
    category: e.category,
    gender: e.gender,
    color_hex: e.color_hex,
    color_name: e.color_name.trim() || null,
    material: e.material.trim() || null,
    formality: e.formality,
    warmth: e.warmth,
    season: e.season,
    style_tags: e.style_tags,
  }
}

export function ItemEditor({
  value,
  onChange,
  autoHint = false,
}: {
  value: EditableItem
  onChange: (patch: Partial<EditableItem>) => void
  /** 是否提示"这些是自动识别的，可以改" */
  autoHint?: boolean
}) {
  function toggleSeason(s: Season) {
    const has = value.season.includes(s)
    onChange({ season: has ? value.season.filter((x) => x !== s) : [...value.season, s] })
  }

  return (
    <div className="space-y-3.5">
      {autoHint && (
        <p className="text-[11.5px] text-ink3 leading-relaxed">
          下面是自动识别的结果，觉得不准可以直接改 —— 材质和保暖度模型经常估偏。
        </p>
      )}

      {/* 名称 */}
      <Field label="名称">
        <input
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="比如 深灰针织衫"
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] outline-none focus:border-accent"
        />
      </Field>

      {/* 类别 */}
      <Field label="类别">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_ORDER.map((c) => (
            <Chip key={c} active={value.category === c} onClick={() => onChange({ category: c })}>
              {CATEGORY_LABEL[c]}
            </Chip>
          ))}
        </div>
      </Field>

      {/* 性别 */}
      <Field label="适用">
        <div className="flex gap-1.5">
          {GENDERS.map((g) => (
            <Chip key={g} active={value.gender === g} onClick={() => onChange({ gender: g })}>
              {GENDER_LABEL[g]}
            </Chip>
          ))}
        </div>
      </Field>

      {/* 颜色 */}
      <Field label="颜色">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={value.color_hex}
            onChange={(e) => onChange({ color_hex: e.target.value })}
            className="w-10 h-9 rounded-lg border border-line bg-card cursor-pointer"
            aria-label="选颜色"
          />
          <input
            value={value.color_name}
            onChange={(e) => onChange({ color_name: e.target.value })}
            placeholder="色名，比如 深灰"
            className="flex-1 rounded-lg border border-line bg-card px-3 py-2 text-[13px] outline-none focus:border-accent"
          />
          <span className="text-[11px] text-ink3 tabular-nums">{value.color_hex}</span>
        </div>
      </Field>

      {/* 材质 */}
      <Field label="材质">
        <input
          value={value.material}
          onChange={(e) => onChange({ material: e.target.value })}
          placeholder="比如 羊毛 / 棉 / 皮革"
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] outline-none focus:border-accent"
        />
      </Field>

      {/* 正式度 / 保暖度 */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="正式度">
          <Scale value={value.formality} onChange={(formality) => onChange({ formality })} />
        </Field>
        <Field label="保暖度">
          <Scale value={value.warmth} onChange={(warmth) => onChange({ warmth })} />
        </Field>
      </div>

      {/* 季节 */}
      <Field label="季节">
        <div className="flex gap-1.5">
          {SEASONS.map((s) => (
            <Chip key={s.v} active={value.season.includes(s.v)} onClick={() => toggleSeason(s.v)}>
              {s.label}
            </Chip>
          ))}
        </div>
      </Field>

      {/* 风格标签 */}
      <Field label="风格标签">
        <input
          value={value.style_tags.join(' ')}
          onChange={(e) =>
            onChange({
              style_tags: e.target.value.split(/[\s,，]+/).filter(Boolean),
            })
          }
          placeholder="空格分隔，比如 通勤 极简"
          className="w-full rounded-lg border border-line bg-card px-3 py-2 text-[13px] outline-none focus:border-accent"
        />
      </Field>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] text-ink3 mb-1.5">{label}</div>
      {children}
    </div>
  )
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-[12px] border transition active:scale-95 ${
        active ? 'bg-ink text-white border-ink' : 'bg-card text-ink2 border-line'
      }`}
    >
      {children}
    </button>
  )
}

/** 1-5 的分段选择器，比滑块更容易点准 */
function Scale({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={`flex-1 rounded-md py-1.5 text-[12px] font-semibold border transition active:scale-95 ${
            value === n ? 'bg-accent text-white border-accent' : 'bg-card text-ink2 border-line'
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  )
}
