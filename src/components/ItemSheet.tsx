'use client'

import { useEffect, useState } from 'react'
import type { Item } from '@/lib/types'
import { CATEGORY_LABEL, GENDER_LABEL, itemMeta } from '@/lib/display'
import { colorLabel } from '@/lib/reason'
import { tintOf } from './OutfitCard'
import { ItemEditor, fromEditable, toEditable, type EditableItem } from './ItemEditor'

/** 单品详情。底部弹层，手机上比整页跳转顺手。 */
export function ItemSheet({
  item,
  onClose,
  onWear,
  onStore,
  onDelete,
  onUpdate,
}: {
  item: Item | null
  onClose: () => void
  onWear: (it: Item) => void
  onStore: (it: Item) => void
  onDelete: (it: Item) => void
  /** 保存编辑后的字段；不传则只读 */
  onUpdate?: (it: Item, patch: Partial<Item>) => Promise<void> | void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<EditableItem | null>(null)
  const [saving, setSaving] = useState(false)

  // 换一件单品或关闭时，退出编辑态，避免把草稿带到下一件上
  useEffect(() => {
    setEditing(false)
    setDraft(null)
  }, [item?.id])

  if (!item) return null

  const canEdit = Boolean(onUpdate)

  async function save() {
    if (!item || !draft || !onUpdate) return
    setSaving(true)
    try {
      await onUpdate(item, fromEditable(draft))
      setEditing(false)
      setDraft(null)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div onClick={onClose} className="fixed inset-0 bg-black/30 z-40" />
      <div className="fixed left-0 right-0 bottom-0 z-50 bg-card rounded-t-[22px] px-5 pt-2 pb-8 max-h-[82%] overflow-y-auto shadow-[0_-10px_40px_rgba(0,0,0,.16)]">
        <div className="w-9 h-1 rounded bg-[#d8d3ca] mx-auto my-2" />

        {editing && draft ? (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[17px] font-bold tracking-tight">编辑单品</h2>
              <button
                onClick={() => {
                  setEditing(false)
                  setDraft(null)
                }}
                className="text-[12px] text-ink3 underline underline-offset-4"
              >
                取消
              </button>
            </div>

            <ItemEditor value={draft} onChange={(p) => setDraft({ ...draft, ...p })} />

            <button
              onClick={save}
              disabled={saving}
              className="w-full mt-4 rounded-xl bg-ink text-white py-3 text-sm font-semibold
                         disabled:opacity-40 active:scale-[.98] transition"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-[17px] font-bold tracking-tight truncate">
                  {item.name ?? item.subcategory ?? '未命名'}
                </h2>
                <div className="text-xs text-ink3 mt-1">{itemMeta(item)}</div>
              </div>
              {canEdit && (
                <button
                  onClick={() => {
                    setDraft(toEditable(item))
                    setEditing(true)
                  }}
                  className="shrink-0 text-[12px] rounded-full border border-line px-3 py-1.5 text-ink2 active:scale-95 transition"
                >
                  编辑
                </button>
              )}
            </div>

            <div
              className="h-40 rounded-[14px] grid place-items-center my-4 overflow-hidden"
              style={{ background: tintOf(item.color_hex) }}
            >
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image_url}
                  alt={item.name ?? '单品'}
                  className="max-h-36 max-w-[85%] object-contain rounded-[10px]"
                />
              ) : (
                <span
                  className="w-[70px] h-[70px] rounded-2xl shadow-[inset_0_-12px_24px_rgba(0,0,0,.18),0_4px_10px_rgba(0,0,0,.1)]"
                  style={{ background: item.color_hex }}
                />
              )}
            </div>

            <KV k="类别" v={`${CATEGORY_LABEL[item.category]} · ${GENDER_LABEL[item.gender]}`} />
            <KV k="颜色" v={`${item.color_name ?? colorLabel(item.color_hex)} ${item.color_hex}`} />
            <KV k="材质" v={item.material ?? '未填'} />
            <KV k="正式度 / 保暖" v={`${item.formality} / ${item.warmth}`} />
            <KV
              k="季节"
              v={item.season.length ? item.season.map(seasonLabel).join(' · ') : '四季'}
            />
            <KV k="风格" v={item.style_tags.length ? item.style_tags.join(' · ') : '未填'} />
            <KV k="累计穿着" v={`${item.times_worn} 次`} />
            <KV k="最近穿着" v={item.last_worn ?? '从未'} />
            <KV k="状态" v={item.status === 'stored' ? '已收纳' : '在穿'} last />

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => onWear(item)}
                className="flex-1 rounded-xl bg-ink text-white py-3 text-sm font-semibold active:scale-[.98] transition"
              >
                今天穿它
              </button>
              <button
                onClick={() => onStore(item)}
                className="rounded-xl bg-[#f2f0ec] text-ink2 px-4 py-3 text-sm font-semibold active:scale-[.98] transition"
              >
                {item.status === 'stored' ? '取出来' : '收起来'}
              </button>
              <button
                onClick={() => onDelete(item)}
                className="rounded-xl bg-[#f2f0ec] text-warn px-4 py-3 text-sm font-semibold active:scale-[.98] transition"
              >
                删
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function seasonLabel(s: string): string {
  return { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }[s] ?? s
}

function KV({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <div
      className={`flex justify-between gap-3 py-2.5 text-[13px] ${
        last ? '' : 'border-b border-line'
      }`}
    >
      <span className="text-ink3 shrink-0">{k}</span>
      <span className="font-semibold text-right break-words">{v}</span>
    </div>
  )
}
